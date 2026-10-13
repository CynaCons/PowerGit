namespace PowerGit.Engine;

/// <summary>
///  The recent repositories as repositories with their worktrees (v0.20.10,
///  owner picked "E · Repository cards" of docs/prototypes/recents-v4.html:
///  "very importantly would be better able to handle work trees"). Every
///  recents root is grouped by its repository's common git dir; a group's
///  worktrees come from one <c>git worktree list --porcelain</c>, so the
///  worktrees never opened in PowerGit are listed too, and the recents fields
///  (last opened, pinned, id) are merged in by path.
/// </summary>
public sealed class Workspaces
{
    private const int TimeoutMs = 3_000;
    private static readonly IReadOnlyDictionary<string, string> Environment = new Dictionary<string, string>
    {
        ["GIT_OPTIONAL_LOCKS"] = "0",
        ["GIT_TERMINAL_PROMPT"] = "0",
    };

    /// <summary>Paths compare like the file system does: case-insensitive on Windows.</summary>
    internal static readonly StringComparer PathComparer = OperatingSystem.IsWindows() ? StringComparer.OrdinalIgnoreCase : StringComparer.Ordinal;

    private readonly string _gitPath;

    public Workspaces(string? gitPath = null)
    {
        _gitPath = gitPath ?? GitHost.ResolveGitPath();
    }

    public async Task<WorkspaceGroup[]> ListAsync(IReadOnlyList<RecentInfo> recents, CancellationToken ct)
    {
        // Recents roots by repository; a root that is no longer a work tree is skipped.
        Dictionary<string, List<RecentInfo>> byCommon = new(PathComparer);
        foreach (RecentInfo recent in recents)
        {
            string? common = CommonDirOf(recent.Root);
            if (common is null)
            {
                continue;
            }

            if (!byCommon.TryGetValue(common, out List<RecentInfo>? list))
            {
                byCommon[common] = list = [];
            }

            list.Add(recent);
        }

        WorkspaceGroup[] groups = await Task.WhenAll(byCommon.Select(entry => GroupAsync(entry.Key, entry.Value, ct)));
        return
        [
            .. groups
                .OrderByDescending(g => g.Pinned)
                .ThenByDescending(g => g.LastOpened ?? DateTimeOffset.MinValue)
                .ThenBy(g => g.Name, StringComparer.OrdinalIgnoreCase),
        ];
    }

    private async Task<WorkspaceGroup> GroupAsync(string common, List<RecentInfo> recents, CancellationToken ct)
    {
        List<ListedWorktree> listed = [];
        bool bare = false;
        GitProcess.Result? result = null;
        try
        {
            result = await GitProcess.RunAsync(_gitPath, ["worktree", "list", "--porcelain"], recents[0].Root, TimeoutMs, ct, int.MaxValue, Environment);
        }
        catch (OperationCanceledException) when (!ct.IsCancellationRequested)
        {
        }

        if (result is { ExitCode: 0 })
        {
            (listed, bare) = ParsePorcelain(result.StdOut);
        }

        // A worktree whose folder is gone cannot be opened: it is left out
        // (git calls it prunable; `git worktree prune` is the user's call).
        listed = [.. listed.Where(w => Directory.Exists(w.Path))];

        Dictionary<string, RecentInfo> recentByPath = new(PathComparer);
        foreach (RecentInfo recent in recents)
        {
            recentByPath[Normalise(recent.Root)] = recent;
        }

        List<WorkspaceWorktree> worktrees = [];
        HashSet<string> seen = new(PathComparer);
        foreach (ListedWorktree w in listed)
        {
            string key = Normalise(w.Path);
            seen.Add(key);
            recentByPath.TryGetValue(key, out RecentInfo? recent);
            worktrees.Add(new WorkspaceWorktree(
                Root: recent?.Root ?? key,
                Name: Path.GetFileName(key),
                Branch: w.Branch,
                Head: w.Head,
                Main: w.Main,
                Detached: w.Detached,
                Locked: w.Locked,
                Prunable: w.Prunable,
                LastOpened: recent?.LastOpened,
                Pinned: recent?.Pinned ?? false,
                Id: recent?.Id));
        }

        // Recents roots git did not list (the list failed, or the path is
        // spelled through a link): kept, so a recent repository never vanishes.
        foreach ((string key, RecentInfo recent) in recentByPath)
        {
            if (seen.Contains(key))
            {
                continue;
            }

            worktrees.Add(new WorkspaceWorktree(
                Root: recent.Root,
                Name: Path.GetFileName(key),
                Branch: string.IsNullOrEmpty(recent.Branch) || recent.Branch == "HEAD" ? null : recent.Branch,
                Head: null,
                Main: Directory.Exists(Path.Combine(recent.Root, ".git")),
                Detached: recent.Branch == "HEAD",
                Locked: false,
                Prunable: false,
                LastOpened: recent.LastOpened,
                Pinned: recent.Pinned,
                Id: recent.Id));
        }

        WorkspaceWorktree? main = worktrees.FirstOrDefault(w => w.Main);
        return new WorkspaceGroup(
            Name: GroupName(common, main?.Root, bare),
            MainRoot: bare ? null : main?.Root,
            LastOpened: worktrees.Max(w => w.LastOpened),
            Pinned: worktrees.Any(w => w.Pinned),
            Worktrees:
            [
                .. worktrees
                    .OrderByDescending(w => w.Main)
                    .ThenByDescending(w => w.LastOpened.HasValue)
                    .ThenByDescending(w => w.LastOpened ?? DateTimeOffset.MinValue)
                    .ThenBy(w => w.Name, StringComparer.OrdinalIgnoreCase),
            ]);
    }

    /// <summary>
    ///  A work tree's common git dir, read from its <c>.git</c> without a
    ///  process: a directory is its own; a <c>gitdir:</c> file points to the
    ///  worktree's git dir, whose <c>commondir</c> names the repository's.
    ///  Null when <paramref name="root"/> is not a git work tree.
    /// </summary>
    internal static string? CommonDirOf(string root)
    {
        try
        {
            if (string.IsNullOrWhiteSpace(root) || !Directory.Exists(root))
            {
                return null;
            }

            string dotGit = Path.Combine(root, ".git");
            if (Directory.Exists(dotGit))
            {
                return Normalise(dotGit);
            }

            if (!File.Exists(dotGit))
            {
                return null;
            }

            string line = File.ReadAllText(dotGit).Trim();
            if (!line.StartsWith("gitdir:", StringComparison.Ordinal))
            {
                return null;
            }

            string gitDir = Path.GetFullPath(Path.Combine(root, line["gitdir:".Length..].Trim()));
            if (!Directory.Exists(gitDir))
            {
                return null;
            }

            string commonFile = Path.Combine(gitDir, "commondir");
            return Normalise(File.Exists(commonFile)
                ? Path.Combine(gitDir, File.ReadAllText(commonFile).Trim())
                : gitDir);
        }
        catch (Exception e) when (e is IOException or UnauthorizedAccessException or ArgumentException or NotSupportedException)
        {
            return null;
        }
    }

    internal static string Normalise(string path)
        => Path.GetFullPath(path).TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);

    /// <summary>The main worktree's folder; for a bare repository its directory without ".git" (or the parent of a ".git"/".bare" dir).</summary>
    private static string GroupName(string common, string? mainRoot, bool bare)
    {
        if (!bare && mainRoot is not null)
        {
            return Path.GetFileName(Normalise(mainRoot));
        }

        string leaf = Path.GetFileName(common);
        if (leaf is ".git" or ".bare")
        {
            return Path.GetFileName(Path.GetDirectoryName(common) ?? common);
        }

        return leaf.EndsWith(".git", StringComparison.OrdinalIgnoreCase) ? leaf[..^4] : leaf;
    }

    internal sealed record ListedWorktree(string Path, string? Head, string? Branch, bool Main, bool Detached, bool Locked, bool Prunable);

    /// <summary>
    ///  <c>git worktree list --porcelain</c>: one record per worktree,
    ///  separated by a blank line. The first record is the main worktree, or
    ///  the bare repository (which is not a worktree to open).
    /// </summary>
    internal static (List<ListedWorktree> Worktrees, bool Bare) ParsePorcelain(string output)
    {
        List<ListedWorktree> worktrees = [];
        bool bare = false;
        bool first = true;
        foreach (string block in output.Replace("\r\n", "\n").Split("\n\n", StringSplitOptions.RemoveEmptyEntries))
        {
            string? path = null, head = null, branch = null;
            bool detached = false, locked = false, prunable = false, isBare = false;
            foreach (string line in block.Split('\n', StringSplitOptions.RemoveEmptyEntries))
            {
                if (line.StartsWith("worktree ", StringComparison.Ordinal)) path = line["worktree ".Length..];
                else if (line.StartsWith("HEAD ", StringComparison.Ordinal)) head = line["HEAD ".Length..];
                else if (line.StartsWith("branch ", StringComparison.Ordinal))
                {
                    string reference = line["branch ".Length..];
                    branch = reference.StartsWith("refs/heads/", StringComparison.Ordinal) ? reference["refs/heads/".Length..] : reference;
                }
                else if (line == "detached") detached = true;
                else if (line == "bare") isBare = true;
                else if (line == "locked" || line.StartsWith("locked ", StringComparison.Ordinal)) locked = true;
                else if (line == "prunable" || line.StartsWith("prunable ", StringComparison.Ordinal)) prunable = true;
            }

            if (path is null)
            {
                continue;
            }

            if (isBare)
            {
                bare = true;
                continue;
            }

            // The first worktree record is the main one, after the bare
            // repository's own record when there is one.
            worktrees.Add(new ListedWorktree(Normalise(path), head, branch, first, detached, locked, prunable));
            first = false;
        }

        return (worktrees, bare);
    }
}

public sealed record WorkspaceGroup(
    string Name,
    string? MainRoot,
    DateTimeOffset? LastOpened,
    bool Pinned,
    WorkspaceWorktree[] Worktrees);

public sealed record WorkspaceWorktree(
    string Root,
    string Name,
    string? Branch,
    string? Head,
    bool Main,
    bool Detached,
    bool Locked,
    bool Prunable,
    DateTimeOffset? LastOpened,
    bool Pinned,
    string? Id);
