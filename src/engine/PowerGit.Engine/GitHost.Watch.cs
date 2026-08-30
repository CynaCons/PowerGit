namespace PowerGit.Engine;

public sealed partial class GitHost
{
    private FileSystemWatcher? _watcher;
    private long _changeVersion;

    /// <summary>
    /// Monotonic counter bumped whenever the open repo's git metadata (HEAD,
    /// refs, packed-refs, index) changes on disk. GET /events streams it so
    /// the UI live-refreshes on external git activity.
    /// </summary>
    public long ChangeVersion => Interlocked.Read(ref _changeVersion);

    private void WatchRepo(string root)
    {
        _watcher?.Dispose();
        _watcher = null;

        // Resolve the real git dir: `.git` may be a file (worktrees,
        // submodules). Watch the whole dir but only count metadata paths, so
        // object-pack churn during normal operations never fires refreshes.
        string gitDir = Run(root, "rev-parse", "--absolute-git-dir").StdOut.Trim().Replace('/', Path.DirectorySeparatorChar);
        if (!Directory.Exists(gitDir))
        {
            return;
        }

        FileSystemWatcher watcher = new(gitDir)
        {
            IncludeSubdirectories = true,
            NotifyFilter = NotifyFilters.FileName | NotifyFilters.LastWrite | NotifyFilters.DirectoryName,
        };
        void Bump(string fullPath)
        {
            if (IsMetadataPath(fullPath))
            {
                Interlocked.Increment(ref _changeVersion);
            }
        }

        watcher.Changed += (_, e) => Bump(e.FullPath);
        watcher.Created += (_, e) => Bump(e.FullPath);
        watcher.Deleted += (_, e) => Bump(e.FullPath);
        watcher.Renamed += (_, e) => Bump(e.FullPath);
        watcher.EnableRaisingEvents = true;
        _watcher = watcher;
    }

    private static bool IsMetadataPath(string path)
    {
        string p = path.Replace('\\', '/');
        return p.EndsWith("/HEAD", StringComparison.Ordinal)
            || p.EndsWith("/index", StringComparison.Ordinal)
            || p.EndsWith("/packed-refs", StringComparison.Ordinal)
            || p.Contains("/refs/", StringComparison.Ordinal);
    }
}
