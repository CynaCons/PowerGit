namespace PowerGit.Engine;

public sealed partial class GitHost
{
    public const string DefaultUrl = "http://127.0.0.1:7733";

    private readonly string _gitPath;
    private RepoInfo? _current;

    // v0.13.6: one GitHost per open repository ("session"). Mutations are
    // serialized per session through this gate; reads bypass it (git itself
    // is safe for concurrent reads with GIT_OPTIONAL_LOCKS=0).
    private readonly SemaphoreSlim _writeGate = new(1, 1);
    private string? _writeHolder;

    // v0.13.11 lifecycle: when the session last served a request, so the
    // registry can evict idle ones (sessions with a running job are never
    // evicted; see RepoRegistry.PruneIdle).
    private long _lastUsedTicks = DateTime.UtcNow.Ticks;

    public DateTime LastUsed => new(Interlocked.Read(ref _lastUsedTicks), DateTimeKind.Utc);

    public void Touch() => Interlocked.Exchange(ref _lastUsedTicks, DateTime.UtcNow.Ticks);

    /// <summary>True while the write gate is held (a mutation or a network job is running).</summary>
    public bool IsBusy => _writeGate.CurrentCount == 0;

    public GitHost(string? gitPath = null)
    {
        _gitPath = gitPath ?? ResolveGitPath();
    }

    public string GitPath => _gitPath;

    public RepoInfo? Current => _current;

    /// <summary>Stable session id for a repository root (12 hex chars of its SHA-1).</summary>
    public static string IdFor(string root)
    {
        string normalized = Path.GetFullPath(root).TrimEnd(Path.DirectorySeparatorChar, '/');
        if (OperatingSystem.IsWindows())
        {
            normalized = normalized.ToLowerInvariant();
        }

        byte[] hash = System.Security.Cryptography.SHA1.HashData(System.Text.Encoding.UTF8.GetBytes(normalized));
        return Convert.ToHexStringLower(hash)[..12];
    }

    /// <summary>
    /// Runs a mutating operation under the per-session write gate. A second
    /// mutation (or a running network job) while the gate is held does not
    /// queue; it fails fast with <see cref="RepoBusyException"/> so the
    /// caller can answer 409 and the UI can show what is in progress.
    /// </summary>
    public T Mutate<T>(string what, Func<T> work)
    {
        if (!_writeGate.Wait(0))
        {
            throw new RepoBusyException(_writeHolder ?? "another operation");
        }

        _writeHolder = what;
        try
        {
            return work();
        }
        finally
        {
            _writeHolder = null;
            _writeGate.Release();
        }
    }

    public void Mutate(string what, Action work) => Mutate(what, () => { work(); return 0; });

    /// <summary>Stops the watchers and cancels running jobs; the session is finished.</summary>
    public void Close()
    {
        StopWatching();
        CancelAllJobs();
    }

    public static string ResolveGitPath()
    {
        string name = OperatingSystem.IsWindows() ? "git.exe" : "git";
        string? found = FindOnPath(name);
        if (found is null)
        {
            throw new InvalidOperationException(
                $"'{name}' was not found on PATH. Install Git and retry, or set GIT_EXECUTABLE.");
        }

        return found;
    }

    public GitVersion Version()
    {
        CommandResult result = Run(null, "version");
        if (result.ExitCode != 0)
        {
            throw new InvalidOperationException($"git version failed: {result.StdErr}");
        }

        return new GitVersion(result.StdOut.Trim());
    }

    public RepoInfo Open(string path)
    {
        string full = Path.GetFullPath(path);
        if (!Directory.Exists(full) && !File.Exists(full))
        {
            throw new DirectoryNotFoundException($"Path does not exist: {full}");
        }

        CommandResult inside = Run(full, "rev-parse", "--is-inside-work-tree");
        if (inside.ExitCode != 0 || !string.Equals(inside.StdOut.Trim(), "true", StringComparison.OrdinalIgnoreCase))
        {
            throw new InvalidOperationException($"Not a git work tree: {full}");
        }

        string root = Run(full, "rev-parse", "--show-toplevel").StdOut.Trim().Replace('/', Path.DirectorySeparatorChar);
        string branch = Run(root, "rev-parse", "--abbrev-ref", "HEAD").StdOut.Trim();
        string name = Path.GetFileName(root.TrimEnd(Path.DirectorySeparatorChar));

        _current = new RepoInfo(name, root, branch, IdFor(root));
        RecentsStore.Remember(_current);
        try
        {
            WatchRepo(root);
        }
        catch
        {
            // Live refresh is best-effort; the app works without it.
        }

        return _current;
    }

    public RepoInfo? TryDiscover(string start)
    {
        DirectoryInfo? cursor = new(Path.GetFullPath(start));
        while (cursor is not null)
        {
            if (Directory.Exists(Path.Combine(cursor.FullName, ".git")) || File.Exists(Path.Combine(cursor.FullName, ".git")))
            {
                return Open(cursor.FullName);
            }

            cursor = cursor.Parent;
        }

        return null;
    }

    public string RequireRoot()
        => Current?.Root ?? throw new InvalidOperationException("no repository open");

    internal CommandResult Run(string? workingDirectory, params string[] args)
        => RunTimed(workingDirectory, 30_000, args);

    internal CommandResult RunTimed(string? workingDirectory, int timeoutMs, params string[] args)
        => RunTimed(workingDirectory, timeoutMs, CancellationToken.None, args);

    /// <summary>
    /// v0.13.10/11: every git invocation goes through <see cref="GitProcess"/>
    /// (concurrent pipe draining, timeout armed up front, tree kill). The
    /// token is the HTTP request's abort (latest-request-wins reads) or a
    /// job's cancel: either one terminates the git process instead of
    /// letting it finish for nobody.
    /// </summary>
    internal CommandResult RunTimed(string? workingDirectory, int timeoutMs, CancellationToken ct, params string[] args)
    {
        GitProcess.Result r = GitProcess.Run(_gitPath, args, workingDirectory, timeoutMs, ct, int.MaxValue, GitEnvironment);
        return new CommandResult(r.ExitCode, r.StdOut, r.StdErr);
    }

    /// <summary>Like <see cref="RunTimed(string?, int, CancellationToken, string[])"/> but stops reading (and kills git) past <paramref name="maxStdOutChars"/>.</summary>
    internal GitProcess.Result RunCapped(string? workingDirectory, int timeoutMs, CancellationToken ct, int maxStdOutChars, params string[] args)
        => GitProcess.Run(_gitPath, args, workingDirectory, timeoutMs, ct, maxStdOutChars, GitEnvironment);

    private static readonly IReadOnlyDictionary<string, string> GitEnvironment = new Dictionary<string, string>
    {
        ["GIT_OPTIONAL_LOCKS"] = "0",
        // Never block on a credential or editor prompt inside a headless engine.
        ["GIT_TERMINAL_PROMPT"] = "0",
    };

    private static string? FindOnPath(string fileName)
    {
        string? env = Environment.GetEnvironmentVariable("GIT_EXECUTABLE");
        if (!string.IsNullOrWhiteSpace(env) && File.Exists(env))
        {
            return env;
        }

        string[] paths = (Environment.GetEnvironmentVariable("PATH") ?? string.Empty)
            .Split(Path.PathSeparator, StringSplitOptions.RemoveEmptyEntries);

        foreach (string dir in paths)
        {
            string candidate = Path.Combine(dir.Trim('"'), fileName);
            if (File.Exists(candidate))
            {
                return candidate;
            }
        }

        return null;
    }

    internal readonly record struct CommandResult(int ExitCode, string StdOut, string StdErr);
}

public sealed record GitVersion(string Raw);

public sealed record RepoInfo(string Name, string Root, string Branch, string Id);

/// <summary>A mutation collided with one already running on the same session (HTTP 409).</summary>
public sealed class RepoBusyException(string running) : InvalidOperationException($"Repository is busy: {running} is in progress.")
{
    public string Running { get; } = running;
}

public sealed record HealthResponse(
    string Engine,
    string Status,
    string GitPath,
    string GitVersion);

public sealed record OpenRepoRequest(string Path);

public sealed record ErrorResponse(string Error);
