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

    public RepoStatusDto Rebase(string onto)
    {
        string root = RequireRoot();
        if (string.IsNullOrWhiteSpace(onto))
        {
            throw new InvalidOperationException("onto is required");
        }

        if (IsDirty(root))
        {
            throw new InvalidOperationException(
                "The working tree has uncommitted changes. Commit or stash them before rebasing.");
        }

        CommandResult result = RunTimed(root, 300_000, "rebase", onto);
        if (result.ExitCode != 0)
        {
            // Abort a conflicted rebase so the repo is not left mid-rebase.
            Run(root, "rebase", "--abort");
            throw new InvalidOperationException(
                "Rebase stopped (conflicts or errors); the rebase was aborted. " +
                (string.IsNullOrWhiteSpace(result.StdErr) ? result.StdOut.Trim() : result.StdErr.Trim()));
        }

        return GetStatus();
    }

    public RepoStatusDto CherryPick(string commitId)
    {
        string root = RequireRoot();
        if (string.IsNullOrWhiteSpace(commitId))
        {
            throw new InvalidOperationException("commit is required");
        }

        if (IsDirty(root))
        {
            throw new InvalidOperationException(
                "The working tree has uncommitted changes. Commit or stash them before cherry-picking.");
        }

        CommandResult result = Run(root, "cherry-pick", commitId);
        if (result.ExitCode != 0)
        {
            // Abort a conflicted cherry-pick so the repo is not left mid-cherry-pick.
            Run(root, "cherry-pick", "--abort");
            throw new InvalidOperationException(
                "Cherry-pick stopped (conflicts or errors); the cherry-pick was aborted. " +
                (string.IsNullOrWhiteSpace(result.StdErr) ? result.StdOut.Trim() : result.StdErr.Trim()));
        }

        return GetStatus();
    }

    public RepoStatusDto Revert(string commitId)
    {
        string root = RequireRoot();
        if (string.IsNullOrWhiteSpace(commitId))
        {
            throw new InvalidOperationException("commit is required");
        }

        if (IsDirty(root))
        {
            throw new InvalidOperationException(
                "The working tree has uncommitted changes. Commit or stash them before reverting.");
        }

        CommandResult result = Run(root, "revert", "--no-edit", commitId);
        if (result.ExitCode != 0)
        {
            // Abort a conflicted revert so the repo is not left mid-revert.
            Run(root, "revert", "--abort");
            throw new InvalidOperationException(
                "Revert stopped (conflicts or errors); the revert was aborted. " +
                (string.IsNullOrWhiteSpace(result.StdErr) ? result.StdOut.Trim() : result.StdErr.Trim()));
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
    public void OpenDifftool(string commit, string path)
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
        foreach (string arg in new[] { "difftool", "--no-prompt", "-y", $"{commit}^", commit, "--", path })
        {
            psi.ArgumentList.Add(arg);
        }

        using System.Diagnostics.Process? process = System.Diagnostics.Process.Start(psi);
        if (process is null)
        {
            throw new InvalidOperationException("Failed to start git difftool.");
        }
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

    /// <summary>
    /// Git Extensions FormCommit "Reset file(s) to HEAD" (v0.13.14): the index
    /// entry and the working-tree file go back to HEAD. A path HEAD does not
    /// know (untracked, or added only in the index) has nothing to go back to
    /// and is deleted, which is what GE does after its confirmation prompt.
    /// </summary>
    public void ResetFiles(IReadOnlyList<string> paths)
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

            CommandResult inHead = Run(root, "cat-file", "-e", $"HEAD:{path}");
            if (inHead.ExitCode == 0)
            {
                CommandResult unstage = Run(root, "reset", "-q", "HEAD", "--", path);
                CommandResult restore = Run(root, "checkout", "-q", "HEAD", "--", path);
                if (restore.ExitCode != 0)
                {
                    throw new InvalidOperationException(string.IsNullOrWhiteSpace(restore.StdErr) ? unstage.StdErr.Trim() : restore.StdErr.Trim());
                }
            }
            else
            {
                Run(root, "rm", "-f", "-q", "--cached", "--", path);
                if (File.Exists(full))
                {
                    File.Delete(full);
                }
            }
        }
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
