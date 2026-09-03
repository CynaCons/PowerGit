namespace PowerGit.Engine;

public sealed partial class GitHost
{
    private FileSystemWatcher? _watcher;
    private long _changeVersion;
    private long _changeSequence;
    private readonly object _changeLock = new();

    /// <summary>
    /// Monotonic counter bumped whenever the open repo's git metadata (HEAD,
    /// refs, packed-refs, index) changes on disk. GET /events streams it so
    /// the UI live-refreshes on external git activity.
    /// </summary>
    /// <remarks>
    ///  The low 2 bits encode the <see cref="GitChangeKind"/> of the change
    ///  that produced this value (see <see cref="ChangeKindOf"/>) so /events
    ///  can tell the client whether to do a full refresh or just re-fetch
    ///  status, without changing the SSE payload shape (still one integer).
    ///  Overwriting rather than accumulating kinds across a burst is safe
    ///  because git always writes ref/HEAD updates last, for crash safety:
    ///  within one logical git command, a later Refs classification can
    ///  never be shadowed by an earlier Status one from the same command.
    /// </remarks>
    public long ChangeVersion
    {
        get
        {
            lock (_changeLock)
            {
                return _changeVersion;
            }
        }
    }

    /// <summary>
    ///  Decodes the <see cref="GitChangeKind"/> encoded into a value
    ///  previously returned by <see cref="ChangeVersion"/>.
    /// </summary>
    public static GitChangeKind ChangeKindOf(long changeVersion) => (GitChangeKind)(changeVersion & 0b11);

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
            GitChangeKind kind = ClassifyPath(fullPath);
            if (kind == GitChangeKind.None)
            {
                return;
            }

            lock (_changeLock)
            {
                _changeSequence++;
                _changeVersion = (_changeSequence << 2) | (long)kind;
            }
        }

        watcher.Changed += (_, e) => Bump(e.FullPath);
        watcher.Created += (_, e) => Bump(e.FullPath);
        watcher.Deleted += (_, e) => Bump(e.FullPath);
        watcher.Renamed += (_, e) => Bump(e.FullPath);
        watcher.EnableRaisingEvents = true;
        _watcher = watcher;
    }

    // "Refs" covers HEAD (including the reflog) and any ref move — branches,
    // tags, and refs/stash — since those can all change the commit list, the
    // ref tree, and status together. "Status" is just the index, so a status
    // re-fetch alone is enough.
    private static GitChangeKind ClassifyPath(string path)
    {
        string p = path.Replace('\\', '/');
        if (p.EndsWith("/HEAD", StringComparison.Ordinal)
            || p.EndsWith("/packed-refs", StringComparison.Ordinal)
            || p.Contains("/refs/", StringComparison.Ordinal))
        {
            return GitChangeKind.Refs;
        }

        if (p.EndsWith("/index", StringComparison.Ordinal))
        {
            return GitChangeKind.Status;
        }

        return GitChangeKind.None;
    }
}

/// <summary>
///  Coarse classification of a filesystem change detected by the repo
///  watcher, encoded into the low bits of <see cref="GitHost.ChangeVersion"/>.
/// </summary>
public enum GitChangeKind
{
    /// <summary>Watcher noise outside the paths we classify; never bumps <see cref="GitHost.ChangeVersion"/>.</summary>
    None = 0,

    /// <summary>The index changed: re-fetching status is enough.</summary>
    Status = 1,

    /// <summary>HEAD or a ref moved: revisions, refs, and status may all be stale.</summary>
    Refs = 2,
}
