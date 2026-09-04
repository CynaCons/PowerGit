using System.Collections.Concurrent;

namespace PowerGit.Engine;

/// <summary>
/// v0.13.6: the engine serves any number of repositories at once. Each open
/// repository is a <see cref="GitHost"/> session (its own root, watcher, job
/// table and write gate) keyed by <see cref="GitHost.IdFor"/>. Routes live
/// under <c>/repos/{id}/...</c> and resolve their session once at entry, so
/// no git command ever reads shared mutable state mid-request.
/// </summary>
public sealed class RepoRegistry(string? gitPath = null)
{
    private readonly ConcurrentDictionary<string, GitHost> _sessions = new();
    private readonly GitHost _tool = gitPath is null ? new GitHost() : new GitHost(gitPath);
    private string? _lastOpenedId;

    /// <summary>Repo-less host for <c>/health</c> (git path and version).</summary>
    public GitHost Tool => _tool;

    public string GitPath => _tool.GitPath;

    /// <summary>Opens (or returns the existing session for) a work tree.</summary>
    public RepoInfo Open(string path)
    {
        // Probe with a throwaway host first so an invalid path never
        // registers a session. Open() throws the same exceptions it always did.
        GitHost probe = new(_tool.GitPath);
        RepoInfo info = probe.Open(path);
        GitHost session = _sessions.GetOrAdd(info.Id, _ => probe);
        if (!ReferenceEquals(session, probe))
        {
            probe.Close(); // an existing session already watches this root
        }

        _lastOpenedId = info.Id;
        return session.Current!;
    }

    public GitHost? Get(string id) => _sessions.TryGetValue(id, out GitHost? host) ? host : null;

    /// <summary>The most recently opened session; what the UI restores on boot.</summary>
    public RepoInfo? Current => _lastOpenedId is not null && _sessions.TryGetValue(_lastOpenedId, out GitHost? host) ? host.Current : null;

    public IReadOnlyList<RepoInfo> List() => [.. _sessions.Values.Select(h => h.Current!).OrderBy(r => r.Name)];

    public bool Close(string id)
    {
        if (!_sessions.TryRemove(id, out GitHost? host))
        {
            return false;
        }

        host.Close();
        if (_lastOpenedId == id)
        {
            _lastOpenedId = _sessions.Keys.FirstOrDefault();
        }

        return true;
    }

    /// <summary>Best-effort auto-open of the repo containing <paramref name="start"/> (dev convenience).</summary>
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
}
