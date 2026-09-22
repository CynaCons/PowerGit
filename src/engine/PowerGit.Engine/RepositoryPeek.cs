using System.Collections.Concurrent;
using System.Text.Json.Serialization;

namespace PowerGit.Engine;

public sealed class RepositoryPeek
{
    private const int TimeoutMs = 3_000;
    private static readonly TimeSpan CacheLifetime = TimeSpan.FromSeconds(5);
    private static readonly ConcurrentDictionary<string, CacheEntry> Cache = new(StringComparer.OrdinalIgnoreCase);
    private static readonly SemaphoreSlim Processes = new(8, 8);
    private static readonly IReadOnlyDictionary<string, string> Environment = new Dictionary<string, string>
    {
        ["GIT_OPTIONAL_LOCKS"] = "0",
        ["GIT_TERMINAL_PROMPT"] = "0",
    };

    private readonly string _gitPath;

    public RepositoryPeek(string? gitPath = null)
    {
        _gitPath = gitPath ?? GitHost.ResolveGitPath();
    }

    public async Task<PeekInfo[]> ReadAsync(string[] roots, int? history, CancellationToken ct)
    {
        int historyCount = Math.Clamp(history ?? 0, 0, 50);
        return await Task.WhenAll(roots.Select(root => ReadOneAsync(root, historyCount, ct)));
    }

    private async Task<PeekInfo> ReadOneAsync(string root, int history, CancellationToken ct)
    {
        PeekInfo basic;
        if (Cache.TryGetValue(root, out CacheEntry? cached) && DateTimeOffset.UtcNow - cached.At < CacheLifetime)
        {
            basic = cached.Info;
        }
        else
        {
            basic = await ReadBasicAsync(root, ct);
            Cache[root] = new CacheEntry(DateTimeOffset.UtcNow, basic);
        }

        if (!basic.Exists || history == 0)
        {
            return basic;
        }

        PeekCommit[] commits = ParseLog(await RunAsync(root, ct,
            "log", "-n", Math.Max(1, history).ToString(System.Globalization.CultureInfo.InvariantCulture),
            "--format=%H%x00%s%x00%an%x00%aI%x1e"));
        return basic with { Commits = commits };
    }

    private async Task<PeekInfo> ReadBasicAsync(string root, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(root) || !Directory.Exists(root))
        {
            return new PeekInfo(root, false);
        }

        GitProcess.Result status;
        try
        {
            status = await RunAsync(root, ct, "status", "--porcelain=v2", "--branch");
        }
        catch (TimeoutException)
        {
            return new PeekInfo(root, true);
        }

        if (status.ExitCode < 0)
        {
            return new PeekInfo(root, true);
        }

        if (status.ExitCode != 0)
        {
            return new PeekInfo(root, false);
        }

        string? branch = null;
        string? oid = null;
        int ahead = 0;
        int behind = 0;
        int changed = 0;
        foreach (string line in status.StdOut.Split('\n', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
        {
            if (line.StartsWith("# branch.head ", StringComparison.Ordinal))
            {
                branch = line[14..];
            }
            else if (line.StartsWith("# branch.oid ", StringComparison.Ordinal))
            {
                oid = line[13..];
            }
            else if (line.StartsWith("# branch.ab ", StringComparison.Ordinal))
            {
                string[] parts = line[12..].Split(' ', StringSplitOptions.RemoveEmptyEntries);
                _ = parts.Length > 0 && int.TryParse(parts[0].TrimStart('+'), out ahead);
                _ = parts.Length > 1 && int.TryParse(parts[1].TrimStart('-'), out behind);
            }
            else if (!line.StartsWith('#'))
            {
                changed++;
            }
        }

        if (branch == "(detached)")
        {
            branch = oid is { Length: > 7 } ? oid[..7] : oid;
        }

        PeekCommit? last = ParseLog(await RunAsync(root, ct, "log", "-1", "--format=%H%x00%s%x00%an%x00%aI%x1e")).FirstOrDefault();
        return new PeekInfo(root, true, branch, ahead, behind, changed, last is null ? null : new PeekLast(last.Sha[..Math.Min(7, last.Sha.Length)], last.Subject, last.Date));
    }

    private async Task<GitProcess.Result> RunAsync(string root, CancellationToken ct, params string[] args)
    {
        await Processes.WaitAsync(ct);
        try
        {
            return await GitProcess.RunAsync(_gitPath, args, root, TimeoutMs, ct, int.MaxValue, Environment);
        }
        catch (TimeoutException)
        {
            return new GitProcess.Result(-1, "", "", false);
        }
        finally
        {
            Processes.Release();
        }
    }

    private static PeekCommit[] ParseLog(GitProcess.Result result)
    {
        if (result.ExitCode != 0)
        {
            return [];
        }

        return [.. result.StdOut.Split('\x1e', StringSplitOptions.RemoveEmptyEntries)
            .Select(record => record.Trim('\r', '\n').Split('\0'))
            .Where(fields => fields.Length >= 4)
            .Select(fields => new PeekCommit(fields[0], fields[1], fields[2], DateTimeOffset.TryParse(fields[3], out DateTimeOffset date) ? date : null))];
    }

    private sealed record CacheEntry(DateTimeOffset At, PeekInfo Info);
}

public sealed record PeekInfo(
    string Root,
    bool Exists,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    string? Branch = null,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    int? Ahead = null,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    int? Behind = null,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    int? Changed = null,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    PeekLast? Last = null,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    PeekCommit[]? Commits = null);

public sealed record PeekLast(string Sha, string Subject, DateTimeOffset? Date);

public sealed record PeekCommit(string Sha, string Subject, string Author, DateTimeOffset? Date);
