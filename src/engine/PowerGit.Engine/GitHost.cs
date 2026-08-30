namespace PowerGit.Engine;

public sealed partial class GitHost
{
    public const string DefaultUrl = "http://127.0.0.1:7733";

    private readonly string _gitPath;
    private RepoInfo? _current;

    public GitHost(string? gitPath = null)
    {
        _gitPath = gitPath ?? ResolveGitPath();
    }

    public string GitPath => _gitPath;

    public RepoInfo? Current => _current;

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

        _current = new RepoInfo(name, root, branch);
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
    {
        System.Diagnostics.ProcessStartInfo psi = new()
        {
            FileName = _gitPath,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false,
            CreateNoWindow = true,
            StandardOutputEncoding = System.Text.Encoding.UTF8,
            StandardErrorEncoding = System.Text.Encoding.UTF8,
        };
        psi.Environment["GIT_OPTIONAL_LOCKS"] = "0";

        foreach (string arg in args)
        {
            psi.ArgumentList.Add(arg);
        }

        if (!string.IsNullOrWhiteSpace(workingDirectory))
        {
            psi.WorkingDirectory = workingDirectory;
        }

        using System.Diagnostics.Process process = System.Diagnostics.Process.Start(psi)
            ?? throw new InvalidOperationException("Failed to start git.");

        string stdout = process.StandardOutput.ReadToEnd();
        string stderr = process.StandardError.ReadToEnd();
        if (!process.WaitForExit(timeoutMs))
        {
            try { process.Kill(entireProcessTree: true); } catch { /* ignore */ }
            throw new TimeoutException($"git timed out: {string.Join(' ', args)}");
        }

        return new CommandResult(process.ExitCode, stdout, stderr);
    }

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

public sealed record RepoInfo(string Name, string Root, string Branch);

public sealed record HealthResponse(
    string Engine,
    string Status,
    string GitPath,
    string GitVersion);

public sealed record OpenRepoRequest(string Path);

public sealed record ErrorResponse(string Error);
