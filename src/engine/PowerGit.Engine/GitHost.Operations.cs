namespace PowerGit.Engine;

public sealed partial class GitHost
{
    public RepoStatusDto Checkout(string branch, bool force)
    {
        string root = RequireRoot();
        if (string.IsNullOrWhiteSpace(branch))
        {
            throw new InvalidOperationException("branch is required");
        }

        if (!force && IsDirty(root))
        {
            throw new InvalidOperationException(
                "The working tree has uncommitted changes. Commit or stash them first, or force the checkout to discard them.");
        }

        List<string> args = force ? ["checkout", "-f", branch] : ["checkout", branch];
        CommandResult result = Run(root, [.. args]);
        if (result.ExitCode != 0)
        {
            throw new InvalidOperationException(string.IsNullOrWhiteSpace(result.StdErr) ? result.StdOut.Trim() : result.StdErr.Trim());
        }

        return GetStatus();
    }

    public RepoStatusDto ResetTo(string commit, string mode)
    {
        string root = RequireRoot();
        if (string.IsNullOrWhiteSpace(commit))
        {
            throw new InvalidOperationException("commit is required");
        }

        if (mode is not ("soft" or "mixed" or "hard"))
        {
            throw new InvalidOperationException($"unsupported reset mode '{mode}'");
        }

        CommandResult result = Run(root, "reset", $"--{mode}", commit);
        if (result.ExitCode != 0)
        {
            throw new InvalidOperationException(string.IsNullOrWhiteSpace(result.StdErr) ? result.StdOut.Trim() : result.StdErr.Trim());
        }

        return GetStatus();
    }

    /// <summary>
    ///  Launches the configured external diff tool (see <see cref="VsCodeLocator"/>)
    ///  comparing <paramref name="path"/> between <paramref name="commit"/>'s
    ///  parent and <paramref name="commit"/> itself. The process is started
    ///  detached and not awaited: the tool (e.g. VS Code with --wait) can stay
    ///  open indefinitely, so the caller must not block on it.
    /// </summary>
    /// <summary>
    ///  <c>git difftool commit^ commit -- path</c>, or with <paramref name="local"/>
    ///  <c>git difftool commit -- path</c>: the file at the commit against the
    ///  working tree (Git Extensions' "Difftool selected &lt;-&gt; local" in
    ///  the file history).
    /// </summary>
    public void OpenDifftool(string commit, string path, bool local = false)
    {
        string root = RequireRoot();
        if (string.IsNullOrWhiteSpace(commit))
        {
            throw new InvalidOperationException("commit is required");
        }

        if (string.IsNullOrWhiteSpace(path))
        {
            throw new InvalidOperationException("path is required");
        }

        System.Diagnostics.ProcessStartInfo psi = new()
        {
            FileName = _gitPath,
            WorkingDirectory = root,
            UseShellExecute = false,
            CreateNoWindow = true,
        };
        psi.Environment["GIT_OPTIONAL_LOCKS"] = "0";
        string[] args = local
            ? ["difftool", "--no-prompt", "-y", commit, "--", path]
            : ["difftool", "--no-prompt", "-y", $"{commit}^", commit, "--", path];
        foreach (string arg in args)
        {
            psi.ArgumentList.Add(arg);
        }

        using System.Diagnostics.Process? process = System.Diagnostics.Process.Start(psi);
        if (process is null)
        {
            throw new InvalidOperationException("Failed to start git difftool.");
        }

        RecordDetached([.. psi.ArgumentList], DetachedToolNote);
    }

    private bool IsDirty(string root)
    {
        CommandResult status = Run(root, "status", "--porcelain=v1");
        return !string.IsNullOrWhiteSpace(status.StdOut);
    }

    public void DeleteBranch(string name)
    {
        string root = RequireRoot();
        if (string.IsNullOrWhiteSpace(name))
        {
            throw new InvalidOperationException("branch name is required");
        }

        string current = Run(root, "rev-parse", "--abbrev-ref", "HEAD").StdOut.Trim();
        if (name == current)
        {
            throw new InvalidOperationException("Cannot delete the checked-out branch.");
        }

        CommandResult result = Run(root, "branch", "-D", name);
        if (result.ExitCode != 0)
        {
            throw new InvalidOperationException(result.StdErr.Trim());
        }
    }

    public void DeleteTag(string name)
    {
        string root = RequireRoot();
        if (string.IsNullOrWhiteSpace(name))
        {
            throw new InvalidOperationException("tag name is required");
        }

        CommandResult result = Run(root, "tag", "-d", name);
        if (result.ExitCode != 0)
        {
            throw new InvalidOperationException(result.StdErr.Trim());
        }
    }

    public string FetchRemote(string remote, CancellationToken ct = default)
    {
        string root = RequireRoot();
        if (string.IsNullOrWhiteSpace(remote))
        {
            throw new InvalidOperationException("remote is required");
        }

        CommandResult result = RunTimed(root, 300_000, ct, "fetch", "--prune", remote);
        if (result.ExitCode != 0)
        {
            throw new InvalidOperationException(string.IsNullOrWhiteSpace(result.StdErr) ? result.StdOut.Trim() : result.StdErr.Trim());
        }

        return string.IsNullOrWhiteSpace(result.StdErr) ? result.StdOut.Trim() : result.StdErr.Trim();
    }

    public IReadOnlyList<RemoteInfoDto> ListRemotes()
    {
        string root = RequireRoot();
        CommandResult result = Run(root, "remote", "-v");
        Dictionary<string, string> urls = new(StringComparer.Ordinal);
        foreach (string line in result.StdOut.Split('\n', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
        {
            string[] parts = line.Split('\t');
            if (parts.Length == 2 && parts[1].EndsWith("(fetch)", StringComparison.Ordinal))
            {
                urls[parts[0]] = parts[1]["(fetch)".Length..].Trim();
            }
        }

        return [.. urls.Select(kv => new RemoteInfoDto(kv.Key, kv.Value)).OrderBy(r => r.Name, StringComparer.OrdinalIgnoreCase)];
    }

    public RemoteInfoDto SaveRemote(string name, string url)
    {
        string root = RequireRoot();
        if (string.IsNullOrWhiteSpace(name) || string.IsNullOrWhiteSpace(url))
        {
            throw new InvalidOperationException("name and url are required");
        }

        bool exists = Run(root, "remote", "get-url", name).ExitCode == 0;
        CommandResult result = exists
            ? Run(root, "remote", "set-url", name, url)
            : Run(root, "remote", "add", name, url);
        if (result.ExitCode != 0)
        {
            throw new InvalidOperationException(result.StdErr.Trim());
        }

        return new RemoteInfoDto(name, url);
    }

    /// <summary>Which of the three diffs a reset undoes (v0.15.5).</summary>
    public enum ResetScope
    {
        /// <summary>Index and working tree back to HEAD (Git Extensions "Reset file(s) to HEAD").</summary>
        Head,

        /// <summary>Working tree back to the index. Staged changes survive.</summary>
        Worktree,

        /// <summary>Index back to HEAD. The file on disk is not touched.</summary>
        Index,
    }

    /// <summary>Parses the wire value of <see cref="ResetScope"/>; anything else is a 400.</summary>
    public static ResetScope ParseResetScope(string? scope)
    {
        return (scope ?? "head").Trim().ToLowerInvariant() switch
        {
            "" or "head" => ResetScope.Head,
            "worktree" => ResetScope.Worktree,
            "index" => ResetScope.Index,
            _ => throw new InvalidOperationException($"unknown reset scope '{scope}' (head, worktree or index)"),
        };
    }

    /// <summary>
    /// Git Extensions FormCommit "Reset file(s) to HEAD" (v0.13.14): the index
    /// entry and the working-tree file go back to HEAD. A path HEAD does not
    /// know (untracked, or added only in the index) has nothing to go back to
    /// and is deleted, which is what GE does after its confirmation prompt.
    ///
    /// v0.15.5 narrows it, because the Browse diff view resets "what the user
    /// is looking at" (owner) and the whole-way-to-HEAD reset is wrong there:
    /// on a Working directory row it would silently throw away staged changes
    /// that row never showed. <see cref="ResetScope.Worktree"/> restores the
    /// file from the index, <see cref="ResetScope.Index"/> only unstages.
    /// Untracked paths are deleted under every scope: git holds no copy, so
    /// there is nothing else a reset could mean.
    /// </summary>
    public void ResetFiles(IReadOnlyList<string> paths, ResetScope scope = ResetScope.Head)
    {
        string root = RequireRoot();
        foreach (string path in paths)
        {
            if (string.IsNullOrWhiteSpace(path))
            {
                continue;
            }

            string full = Path.Combine(root, path.Replace('/', Path.DirectorySeparatorChar));
            if (!full.StartsWith(root, StringComparison.OrdinalIgnoreCase))
            {
                continue;
            }

            // Each scope restores from a different source, so each has its own
            // idea of "there is nothing to restore from". A staged deletion is
            // the case that catches you: no index entry, but HEAD still has
            // the file, so it is untracked to the working tree and perfectly
            // ordinary to the index.
            bool inIndex = Run(root, "ls-files", "--error-unmatch", "--", path).ExitCode == 0;
            bool inHead = InHead(root, path);

            switch (scope)
            {
                case ResetScope.Worktree when inIndex:
                {
                    // `checkout -- <path>` (not `restore`, which needs git
                    // 2.23) copies the index entry over the working file and
                    // leaves the index alone.
                    CommandResult restore = Run(root, "checkout", "-q", "--", path);
                    if (restore.ExitCode != 0)
                    {
                        throw new InvalidOperationException(Explain(restore, "reset working tree"));
                    }

                    break;
                }

                case ResetScope.Worktree:
                {
                    // No index entry: the index says this file should not
                    // exist, whether it was never added or its deletion is
                    // staged. Matching the index means deleting it.
                    Delete(full);
                    break;
                }

                case ResetScope.Index when inHead:
                {
                    CommandResult unstage = Run(root, "reset", "-q", "HEAD", "--", path);
                    if (unstage.ExitCode != 0)
                    {
                        throw new InvalidOperationException(Explain(unstage, "unstage"));
                    }

                    break;
                }

                case ResetScope.Index:
                {
                    // A staged add (or a repository whose first commit is
                    // still pending): unstaging means dropping the index
                    // entry, which leaves the file on disk as untracked.
                    Run(root, "rm", "-f", "-q", "--cached", "--", path);
                    break;
                }

                case ResetScope.Head when !inHead:
                {
                    // HEAD has nothing to restore, so a reset to HEAD deletes.
                    Run(root, "rm", "-f", "-q", "--cached", "--", path);
                    Delete(full);
                    break;
                }

                default:
                {
                    CommandResult reset = Run(root, "reset", "-q", "HEAD", "--", path);
                    CommandResult checkout = Run(root, "checkout", "-q", "HEAD", "--", path);
                    if (checkout.ExitCode != 0)
                    {
                        throw new InvalidOperationException(string.IsNullOrWhiteSpace(checkout.StdErr) ? reset.StdErr.Trim() : checkout.StdErr.Trim());
                    }

                    break;
                }
            }
        }
    }

    private bool InHead(string root, string path)
    {
        return Run(root, "cat-file", "-e", $"HEAD:{path}").ExitCode == 0;
    }

    private static void Delete(string full)
    {
        if (File.Exists(full))
        {
            File.Delete(full);
        }
    }

    private static string Explain(CommandResult result, string what)
    {
        return string.IsNullOrWhiteSpace(result.StdErr) ? $"{what} failed" : result.StdErr.Trim();
    }

    /// <summary>Open the difftool on a working-tree path: index vs HEAD when staged, worktree vs index otherwise.</summary>
    public void OpenWorkTreeDifftool(string path, bool staged)
    {
        string root = RequireRoot();
        if (string.IsNullOrWhiteSpace(path))
        {
            throw new InvalidOperationException("path is required");
        }

        System.Diagnostics.ProcessStartInfo psi = new()
        {
            FileName = _gitPath,
            WorkingDirectory = root,
            UseShellExecute = false,
            CreateNoWindow = true,
        };
        psi.Environment["GIT_OPTIONAL_LOCKS"] = "0";
        string[] args = staged
            ? ["difftool", "--no-prompt", "-y", "--cached", "--", path]
            : ["difftool", "--no-prompt", "-y", "--", path];
        foreach (string arg in args)
        {
            psi.ArgumentList.Add(arg);
        }

        using System.Diagnostics.Process? process = System.Diagnostics.Process.Start(psi);
        if (process is null)
        {
            throw new InvalidOperationException("Failed to start git difftool.");
        }

        RecordDetached([.. psi.ArgumentList], DetachedToolNote);
    }

    /// <summary>Largest patch accepted by <see cref="ApplyPatch"/>, in UTF-16 chars (v0.15.5).</summary>
    /// <remarks>
    /// Twice the ceiling on a diff handed to the UI, which is where every
    /// patch the app builds comes from. Before this the route validated
    /// nothing at all and would write any body to disk and hand it to git.
    /// </remarks>
    public const int MaxPatchChars = 2 * MaxDiffChars;

    /// <summary>
    /// `git apply` of a patch the UI synthesized from selected diff lines
    /// (frontend/src/patch/partial.ts), Git Extensions' "Stage / Reset
    /// selected lines". The patch goes through a temp file (the runner has no
    /// stdin). Whitespace warnings are silenced; a non-applying hunk is an
    /// error with git's own message, nothing is applied partially.
    ///
    /// v0.15.5: <paramref name="index"/> and <paramref name="threeWay"/> for
    /// undoing a selection taken from a commit — Git Extensions' FileViewer
    /// runs `git apply --3way --index` there, so the undo lands in the working
    /// tree and the index together, and survives the file having moved on
    /// since that commit (3-way falls back to merging against the recorded
    /// blobs instead of failing on drifted context).
    /// </summary>
    public void ApplyPatch(string patch, bool cached, bool reverse, bool index = false, bool threeWay = false)
    {
        string root = RequireRoot();
        if (string.IsNullOrWhiteSpace(patch))
        {
            throw new InvalidOperationException("patch is empty");
        }

        if (patch.Length > MaxPatchChars)
        {
            throw new InvalidOperationException($"patch is too large ({patch.Length} chars, limit {MaxPatchChars})");
        }

        if (cached && index)
        {
            throw new InvalidOperationException("cached and index are mutually exclusive");
        }

        string file = Path.Combine(Path.GetTempPath(), $"powergit-{Guid.NewGuid():N}.patch");
        File.WriteAllText(file, patch.Replace("\r\n", "\n"), new System.Text.UTF8Encoding(false));
        try
        {
            List<string> args = ["apply", "--whitespace=nowarn", "--recount"];
            if (cached)
            {
                args.Add("--cached");
            }

            if (index)
            {
                args.Add("--index");
            }

            if (threeWay)
            {
                args.Add("--3way");
            }

            if (reverse)
            {
                args.Add("--reverse");
            }

            args.AddRange(["--", file]);
            CommandResult result = Run(root, [.. args]);
            if (result.ExitCode != 0)
            {
                throw new InvalidOperationException(string.IsNullOrWhiteSpace(result.StdErr) ? "git apply failed" : result.StdErr.Trim());
            }
        }
        finally
        {
            try { File.Delete(file); } catch { /* temp file */ }
        }
    }

    public void DeleteFiles(IReadOnlyList<string> paths)
    {
        string root = RequireRoot();
        foreach (string path in paths)
        {
            if (string.IsNullOrWhiteSpace(path))
            {
                continue;
            }

            string full = Path.Combine(root, path.Replace('/', Path.DirectorySeparatorChar));
            if (!full.StartsWith(root, StringComparison.OrdinalIgnoreCase) || !File.Exists(full))
            {
                continue;
            }

            CommandResult tracked = Run(root, "ls-files", "--error-unmatch", "--", path);
            CommandResult result = tracked.ExitCode == 0
                ? Run(root, "rm", "-f", "-q", "--", path)
                : Run(root, "rm", "-f", "-q", "--cached", "--", path);
            if (result.ExitCode != 0 && File.Exists(full))
            {
                File.Delete(full);
            }
        }
    }

    public void AddToIgnore(string pattern)
    {
        string root = RequireRoot();
        if (string.IsNullOrWhiteSpace(pattern))
        {
            throw new InvalidOperationException("pattern is required");
        }

        string gitignore = Path.Combine(root, ".gitignore");
        string line = pattern.Trim().Replace('\\', '/');
        File.AppendAllLines(gitignore, [line]);
    }

    public IgnorePreviewDto PreviewIgnore(string pattern)
    {
        string root = RequireRoot();
        string clean = pattern.Trim().Replace('\\', '/').TrimEnd('/');
        if (clean.Length == 0)
        {
            return new IgnorePreviewDto(pattern, [], 0);
        }

        CommandResult result = Run(root, "-c", "core.quotepath=false", "ls-files", "--cached", "--others", "--exclude-standard");
        List<string> matches = [];
        Func<string, bool> isMatch = GitIgnoreMatcher(clean);
        foreach (string line in result.StdOut.Split('\n', StringSplitOptions.RemoveEmptyEntries))
        {
            string file = line.Trim().Replace('\\', '/');
            if (file.Length > 0 && isMatch(file))
            {
                matches.Add(file);
            }
        }

        return new IgnorePreviewDto(pattern, [.. matches.OrderBy(m => m, StringComparer.OrdinalIgnoreCase)], matches.Count);
    }

    internal static Func<string, bool> GitIgnoreMatcher(string pattern)
    {
        bool dirOnly = pattern.EndsWith("/", StringComparison.Ordinal);
        if (dirOnly)
        {
            pattern = pattern[..^1];
        }

        bool anchored = pattern.Contains('/', StringComparison.Ordinal);
        string regex = "^";
        if (!anchored)
        {
            regex += "(?:.*/)?";
        }

        foreach (char c in pattern)
        {
            switch (c)
            {
                case '*': regex += "[^/]*"; break;
                case '?': regex += "[^/]"; break;
                default: regex += RegexEscape(c); break;
            }
        }

        regex += dirOnly ? "(/.*)?$" : "(/.*)?$";
        var rx = new System.Text.RegularExpressions.Regex(regex, System.Text.RegularExpressions.RegexOptions.IgnoreCase);
        return path => rx.IsMatch(path);
    }

    public string Pull(bool rebase = false, CancellationToken ct = default)
    {
        string root = RequireRoot();
        CommandResult upstream = Run(root, "rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}");
        if (upstream.ExitCode != 0)
        {
            throw new InvalidOperationException("The current branch has no upstream. Push with -u first or configure an upstream.");
        }

        if (IsDirty(root))
        {
            throw new InvalidOperationException("The working tree has uncommitted changes. Commit or stash before pulling.");
        }

        CommandResult result = RunTimed(root, 300_000, ct, "pull", rebase ? "--rebase" : "--ff-only");
        if (result.ExitCode != 0)
        {
            string err = string.IsNullOrWhiteSpace(result.StdErr) ? result.StdOut.Trim() : result.StdErr.Trim();
            throw new InvalidOperationException(
                err.Contains("divergent", StringComparison.OrdinalIgnoreCase) || err.Contains("not possible to fast-forward", StringComparison.OrdinalIgnoreCase)
                    ? $"Pull failed: local branch and upstream have diverged. {err}"
                    : $"Pull failed. {err}");
        }

        return string.IsNullOrWhiteSpace(result.StdErr) ? result.StdOut.Trim() : result.StdErr.Trim();
    }

    public string Push(bool forceWithLease = false, CancellationToken ct = default)
    {
        string root = RequireRoot();
        if (forceWithLease && IsDirty(root))
        {
            // Force variants are dangerous enough on a dirty tree; GE guards it too.
            throw new InvalidOperationException("The working tree has uncommitted changes. Commit or stash before pushing.");
        }

        CommandResult upstream = Run(root, "rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}");
        List<string> args = upstream.ExitCode == 0 ? ["push"] : ["push", "-u", "origin", "HEAD"];
        if (forceWithLease)
        {
            args.Add("--force-with-lease");
        }

        CommandResult result = RunTimed(root, 300_000, ct, [.. args]);
        if (result.ExitCode != 0)
        {
            string err = string.IsNullOrWhiteSpace(result.StdErr) ? result.StdOut.Trim() : result.StdErr.Trim();
            throw new InvalidOperationException(
                err.Contains("rejected", StringComparison.OrdinalIgnoreCase)
                    ? $"Push rejected (non-fast-forward). Pull first to integrate remote changes. {err}"
                    : $"Push failed. {err}");
        }

        return string.IsNullOrWhiteSpace(result.StdErr) ? result.StdOut.Trim() : result.StdErr.Trim();
    }

    private static readonly char[] SpecialRegexChars = ['*', '+', '?', '|', '{', '[', '(', ')', '\\', '^', '$', '.', ' '];

    public IReadOnlyList<StashDto> ListStashes()
    {
        string root = RequireRoot();
        CommandResult result = Run(
            root,
            "-c", "core.quotepath=false",
            "stash", "list", "--format=%gd\u001f%H\u001f%s");
        List<StashDto> stashes = [];
        foreach (string line in result.StdOut.Split('\n', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
        {
            string[] f = line.Split('\u001f');
            if (f.Length >= 3)
            {
                stashes.Add(new StashDto(f[0], f[1], f[2]));
            }
        }

        return stashes;
    }

    public void StashChanges(string? message, bool keepIndex, bool includeUntracked)
    {
        string root = RequireRoot();
        if (!IsDirty(root))
        {
            throw new InvalidOperationException("There are no local changes to stash.");
        }

        List<string> args = ["stash", "push"];
        if (keepIndex)
        {
            args.Add("-k");
        }

        if (includeUntracked)
        {
            args.Add("-u");
        }

        if (!string.IsNullOrWhiteSpace(message))
        {
            args.AddRange(["-m", message.Trim()]);
        }

        CommandResult result = Run(root, [.. args]);
        if (result.ExitCode != 0)
        {
            throw new InvalidOperationException(string.IsNullOrWhiteSpace(result.StdErr) ? result.StdOut.Trim() : result.StdErr.Trim());
        }
    }

    public void ApplyStash(string reference, bool pop)
    {
        string root = RequireRoot();
        if (string.IsNullOrWhiteSpace(reference))
        {
            throw new InvalidOperationException("stash reference is required");
        }

        CommandResult result = Run(root, "stash", pop ? "pop" : "apply", reference);
        if (result.ExitCode != 0)
        {
            throw new InvalidOperationException(
                "Apply failed" +
                (result.StdOut.Contains("conflict", StringComparison.OrdinalIgnoreCase) ? " (conflicts); your stash was kept." : ".") +
                " " + (string.IsNullOrWhiteSpace(result.StdErr) ? result.StdOut.Trim() : result.StdErr.Trim()));
        }
    }

    public void DropStash(string reference)
    {
        string root = RequireRoot();
        if (string.IsNullOrWhiteSpace(reference))
        {
            throw new InvalidOperationException("stash reference is required");
        }

        CommandResult result = Run(root, "stash", "drop", reference);
        if (result.ExitCode != 0)
        {
            throw new InvalidOperationException(result.StdErr.Trim());
        }
    }

    private static string RegexEscape(char c)
        => SpecialRegexChars.Contains(c) ? "\\" + c : c.ToString();
}
