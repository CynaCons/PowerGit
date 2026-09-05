namespace PowerGit.Engine;

public sealed partial class GitHost
{
    private const char Field = '\u001f';
    private const char Record = '\u001e';

    public IReadOnlyList<RevisionDto> ListRevisions(int max = 800, int skip = 0, CancellationToken ct = default)
    {
        string root = RequireRoot();
        string head = Run(root, "rev-parse", "HEAD").StdOut.Trim();
        bool hasStash = Run(root, "rev-parse", "--verify", "-q", "refs/stash").ExitCode == 0;

        // Ref GLOBS, never explicit tips: a repo can hold thousands of refs,
        // and expanding them into argv blows the 32K Windows command-line
        // limit (killed /revisions outright on heavy repos). --branches
        // --remotes --tags select the same commits (all local + remote branch
        // tips and tags — owner decision 2026-08-24, GE parity); HEAD covers
        // the detached case and refs/stash has no glob, so both stay as
        // single argv entries. skip/max page the ordered stream so the UI
        // can load history incrementally.
        //
        // --date-order, not --topo-order: GE's default (RevisionSortOrder.
        // GitDefault in RevisionReader.BuildArguments) passes neither sort
        // flag, which falls back to git log's own default of reverse-
        // chronological-by-date. --topo-order instead tunnels down whichever
        // branch it starts on and only backs off once that line hits a
        // synchronization wait, so one long-lived branch (typically the
        // current one) fills the entire -n800 page before any other branch's
        // commits are considered, even ones newer than most of that page —
        // this is what made the graph look single-branch-only. --date-order
        // reproduces GE's ordering (verified: identical output to the no-flag
        // default on a diverging-branch repro) while still guaranteeing "no
        // parent shown before its children", which the lane layout in
        // frontend/src/graph/layout.ts relies on (it only ever resolves a
        // segment against the immediately preceding row, so a commit must
        // never be rendered before all of its children).
        List<string> logArgs = [
            "-c", "core.quotepath=false",
            "log", "--date-order", "--decorate=short",
            "--branches", "--remotes", "--tags",
            $"-n{Math.Clamp(max, 1, 5000)}",
        ];
        if (skip > 0)
        {
            logArgs.Add($"--skip={Math.Clamp(skip, 0, 1_000_000)}");
        }

        logArgs.Add($"--pretty=format:%H{Field}%P{Field}%an{Field}%ae{Field}%cn{Field}%ce{Field}%aI{Field}%s{Field}%D{Field}%b{Record}");
        logArgs.Add("HEAD");
        if (hasStash)
        {
            logArgs.Add("refs/stash");
        }

        CommandResult log = RunTimed(root, 120_000, ct, [.. logArgs]);

        if (log.ExitCode != 0)
        {
            throw new InvalidOperationException(log.StdErr.Trim());
        }

        List<RevisionDto> rows = [];
        foreach (string rec in log.StdOut.Split(Record, StringSplitOptions.RemoveEmptyEntries))
        {
            string[] f = rec.TrimStart('\n', '\r').Split(Field);
            if (f.Length < 9)
            {
                continue;
            }

            string id = f[0].Trim();
            string[] parents = string.IsNullOrWhiteSpace(f[1]) ? [] : f[1].Split(' ', StringSplitOptions.RemoveEmptyEntries);
            string[] refs = ParseDecorations(f.Length > 8 ? f[8] : "");
            if (id == head && !refs.Contains("HEAD", StringComparer.Ordinal))
            {
                refs = ["HEAD", .. refs];
            }

            rows.Add(new RevisionDto(
                id,
                parents,
                f[2],
                f[3],
                f[4],
                f[5],
                f[6],
                f[7],
                f.Length > 9 ? f[9].Trim() : "",
                refs,
                id == head));
        }

        return rows;
    }

    public CommitDetailDto GetCommit(string id, CancellationToken ct = default)
    {
        string root = RequireRoot();
        CommandResult show = RunTimed(
            root,
            30_000,
            ct,
            "-c", "core.quotepath=false",
            "show", "-s",
            $"--format=%H{Field}%P{Field}%an{Field}%ae{Field}%cn{Field}%ce{Field}%aI{Field}%cI{Field}%s{Field}%D{Field}%b",
            id);
        if (show.ExitCode != 0)
        {
            throw new InvalidOperationException(show.StdErr.Trim());
        }

        string[] f = show.StdOut.TrimEnd().Split(Field);
        if (f.Length < 10)
        {
            throw new InvalidOperationException($"unexpected git show format for {id}");
        }

        return new CommitDetailDto(
            f[0],
            string.IsNullOrWhiteSpace(f[1]) ? [] : f[1].Split(' ', StringSplitOptions.RemoveEmptyEntries),
            f[2], f[3], f[4], f[5], f[6], f[7], f[8],
            f.Length > 10 ? f[10].Trim() : "",
            ParseDecorations(f[9]));
    }

    public IReadOnlyList<FileChangeDto> ListFiles(string id, CancellationToken ct = default)
    {
        string root = RequireRoot();
        CommandResult diff = RunTimed(
            root,
            30_000,
            ct,
            "-c", "core.quotepath=false",
            "diff-tree", "--root", "-r", "--no-commit-id", "--name-status", "-M", id);
        if (diff.ExitCode != 0)
        {
            throw new InvalidOperationException(diff.StdErr.Trim());
        }

        List<FileChangeDto> files = [];
        foreach (string line in diff.StdOut.Split('\n', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
        {
            string[] parts = line.Split('\t', StringSplitOptions.RemoveEmptyEntries);
            if (parts.Length < 2)
            {
                continue;
            }

            string status = parts[0];
            string path = parts[^1];
            files.Add(new FileChangeDto(path, status, Binary: false));
        }

        return files;
    }

    public DiffDto GetDiff(string id, string path, int context = 3, bool ignoreWhitespace = false, bool fullFile = false, CancellationToken ct = default)
    {
        string root = RequireRoot();
        int u = fullFile ? 100_000 : Math.Clamp(context, 0, 1000);
        List<string> args = [
            "-c", "core.quotepath=false",
            "show", "--format=", "--find-renames", $"-U{u}",
            id,
        ];
        if (ignoreWhitespace)
        {
            args.Add("-w");
        }

        args.AddRange(["--", path]);
        GitProcess.Result show = RunCapped(root, 30_000, ct, MaxDiffChars, [.. args]);
        if (show.ExitCode != 0)
        {
            throw new InvalidOperationException(show.StdErr.Trim());
        }

        return BoundDiffText(path, show.StdOut, show.StdOutTruncated, "(no textual diff)");
    }

    /// <summary>
    /// File list plus the first file's diff (v0.13.14, owner: "can we make the
    /// diff loading faster?"). The two git calls are independent once the
    /// whole-commit patch is used for the first file: <c>diff-tree</c> for the
    /// list and <c>show</c> for the patch run concurrently, and the first
    /// file's section is cut out of the patch. If the patch was capped, is
    /// binary, or its first section is not the first listed file (rename
    /// ordering, pathological names), fall back to a per-file GetDiff so the
    /// answer is always the same DTO a /diff request would give.
    /// </summary>
    public CommitChangesDto GetChanges(string id, int context = 3, bool ignoreWhitespace = false, bool fullFile = false, CancellationToken ct = default)
    {
        string root = RequireRoot();
        int u = fullFile ? 100_000 : Math.Clamp(context, 0, 1000);
        List<string> patchArgs = ["-c", "core.quotepath=false", "show", "--format=", "--find-renames", $"-U{u}"];
        if (ignoreWhitespace)
        {
            patchArgs.Add("-w");
        }

        patchArgs.Add(id);
        Task<IReadOnlyList<FileChangeDto>> filesTask = Task.Run(() => ListFiles(id, ct), ct);
        Task<GitProcess.Result> patchTask = Task.Run(() => RunCapped(root, 30_000, ct, MaxDiffChars, [.. patchArgs]), ct);
        Task.WaitAll([filesTask, patchTask], ct);
        IReadOnlyList<FileChangeDto> files = filesTask.Result;
        if (files.Count == 0)
        {
            return new CommitChangesDto(files, null);
        }

        string first = files[0].Path;
        GitProcess.Result patch = patchTask.Result;
        string? section = patch.ExitCode == 0 && !patch.StdOutTruncated ? FirstPatchSection(patch.StdOut, first) : null;
        DiffDto firstDiff = section is not null
            ? BoundDiffText(first, section, false, "(no textual diff)")
            : GetDiff(id, first, context, ignoreWhitespace, fullFile, ct);
        return new CommitChangesDto(files, firstDiff);
    }

    /// <summary>
    /// The first <c>diff --git</c> section of a whole-commit patch when it is
    /// the diff of <paramref name="path"/>; null otherwise (caller falls back).
    /// </summary>
    internal static string? FirstPatchSection(string patch, string path)
    {
        const string marker = "diff --git ";
        if (!patch.StartsWith(marker, StringComparison.Ordinal))
        {
            return null;
        }

        int next = patch.IndexOf("\n" + marker, StringComparison.Ordinal);
        string section = next < 0 ? patch : patch[..(next + 1)];
        int eol = section.IndexOf('\n');
        string header = eol < 0 ? section : section[..eol];
        // "diff --git a/<old> b/<new>": the listed path is the new name.
        return header.EndsWith(" b/" + path, StringComparison.Ordinal) || header.EndsWith(" \"b/" + path + "\"", StringComparison.Ordinal)
            ? section
            : null;
    }

    /// <summary>Largest diff text handed to the UI, in UTF-16 chars (~1 MB).</summary>
    public const int MaxDiffChars = 1_000_000;

    /// <summary>Largest blob loaded for preview; bigger objects come back truncated to this.</summary>
    public const long MaxBlobBytes = 2 * 1024 * 1024;

    /// <summary>Line ceiling for any text handed to the UI, independent of byte size.</summary>
    public const int MaxLines = 50_000;

    private static DiffDto BoundDiffText(string path, string text, bool capped, string emptyText)
    {
        bool binary = text.Contains("Binary files ", StringComparison.Ordinal) || text.Contains('\0');
        if (binary)
        {
            return new DiffDto(path, "Binary file (not shown)", true, text.Length);
        }

        if (string.IsNullOrWhiteSpace(text))
        {
            return new DiffDto(path, emptyText, false, 0);
        }

        return BoundLines(path, text, text.Length, capped ? "size" : null);
    }

    /// <summary>Applies <see cref="MaxLines"/> and stamps the truncation metadata.</summary>
    private static DiffDto BoundLines(string path, string text, long sizeBytes, string? reason)
    {
        int lines = 0;
        int cut = -1;
        for (int i = 0; i < text.Length; i++)
        {
            if (text[i] == '\n' && ++lines >= MaxLines)
            {
                cut = i;
                break;
            }
        }

        if (cut >= 0)
        {
            return new DiffDto(path, text[..cut], false, sizeBytes, true, reason ?? "lines");
        }

        return new DiffDto(path, text, false, sizeBytes, reason is not null, reason);
    }

    public IReadOnlyList<TreeEntryDto> ListTree(string id, string? path, CancellationToken ct = default)
    {
        string root = RequireRoot();
        // With a pathspec git ls-tree emits repo-root-relative paths; the DTO
        // contract is names relative to the requested directory, so strip it.
        string? prefix = null;
        List<string> args = ["-c", "core.quotepath=false", "ls-tree", "-z", id];
        if (!string.IsNullOrWhiteSpace(path))
        {
            prefix = path.Trim().Replace('\\', '/').TrimEnd('/') + "/";
            args.Add("--");
            args.Add(prefix);
        }

        // Timed: a hung ls-tree must surface as an error in the UI, not as
        // an expansion that silently stays empty.
        CommandResult result = RunTimed(root, 30_000, ct, [.. args]);
        if (result.ExitCode != 0)
        {
            throw new InvalidOperationException(result.StdErr.Trim());
        }

        List<TreeEntryDto> entries = [];
        foreach (string rec in result.StdOut.Split('\0', StringSplitOptions.RemoveEmptyEntries))
        {
            int tab = rec.IndexOf('\t');
            if (tab < 0)
            {
                continue;
            }

            string[] meta = rec[..tab].Split(' ', StringSplitOptions.RemoveEmptyEntries);
            if (meta.Length < 3)
            {
                continue;
            }

            string name = rec[(tab + 1)..];
            if (prefix is not null && name.StartsWith(prefix, StringComparison.Ordinal))
            {
                name = name[prefix.Length..];
            }

            entries.Add(new TreeEntryDto(name, meta[1], meta[2]));
        }

        return [.. entries.OrderBy(e => e.Type != "tree").ThenBy(e => e.Name, StringComparer.OrdinalIgnoreCase)];
    }

    public DiffDto GetBlob(string id, string path, CancellationToken ct = default)
    {
        string root = RequireRoot();
        string spec = $"{id}:{path.Replace('\\', '/')}";

        // Probe the size before allocating anything: `git show` of a 500 MB
        // asset used to be read into one string and handed to WebKit.
        CommandResult size = RunTimed(root, 30_000, ct, "cat-file", "-s", spec);
        if (size.ExitCode != 0)
        {
            throw new InvalidOperationException(size.StdErr.Trim());
        }

        long bytes = long.TryParse(size.StdOut.Trim(), out long parsed) ? parsed : 0;
        int cap = bytes > MaxBlobBytes ? (int)MaxBlobBytes : int.MaxValue;
        GitProcess.Result result = RunCapped(root, 30_000, ct, cap, "-c", "core.quotepath=false", "show", spec);
        if (!result.StdOutTruncated && result.ExitCode != 0)
        {
            throw new InvalidOperationException(result.StdErr.Trim());
        }

        if (result.StdOut.Contains('\0'))
        {
            return new DiffDto(path, "Binary file (not shown)", true, bytes);
        }

        return BoundLines(path, result.StdOut, bytes, result.StdOutTruncated || bytes > MaxBlobBytes ? "size" : null);
    }

    public DiffDto GetWorkTreeDiff(string path, bool staged, int context = 3, bool ignoreWhitespace = false, bool fullFile = false, CancellationToken ct = default)
    {
        string root = RequireRoot();
        int u = fullFile ? 100_000 : Math.Clamp(context, 0, 1000);

        // `git diff` (without --cached) only ever compares the working tree
        // against the index, so a path git has never seen -- not even
        // staged -- produces no output at all: the "no diff" bug for new,
        // unstaged files. `git ls-files` lists index entries, so a path
        // that has been `git add`ed already shows up there and correctly
        // keeps using the normal diff below (which rightly says "no diff"
        // when there is nothing unstaged left to show for it).
        if (!staged && IsUntracked(root, path))
        {
            return GetUntrackedDiff(root, path, u, ignoreWhitespace);
        }

        List<string> args = ["-c", "core.quotepath=false", "diff", "--no-color", $"-U{u}"];
        if (staged)
        {
            args.Add("--cached");
        }

        if (ignoreWhitespace)
        {
            args.Add("-w");
        }

        args.AddRange(["--", path]);
        GitProcess.Result result = RunCapped(root, 30_000, ct, MaxDiffChars, [.. args]);
        if (result.ExitCode != 0)
        {
            throw new InvalidOperationException(result.StdErr.Trim());
        }

        return BoundDiffText(path, result.StdOut, result.StdOutTruncated, "(no diff)");
    }

    public RepoStatusDto GetStatus()
    {
        string root = RequireRoot();
        string branch = Run(root, "rev-parse", "--abbrev-ref", "HEAD").StdOut.Trim();
        CommandResult porcelain = Run(root, "-c", "core.quotepath=false", "status", "--porcelain=v1", "-uall");
        if (porcelain.ExitCode != 0)
        {
            throw new InvalidOperationException(porcelain.StdErr.Trim());
        }

        List<StatusFileDto> unstaged = [];
        List<StatusFileDto> staged = [];
        foreach (string line in porcelain.StdOut.Split('\n', StringSplitOptions.RemoveEmptyEntries))
        {
            if (line.Length < 4)
            {
                continue;
            }

            char x = line[0];
            char y = line[1];
            string path = line[3..].Trim().Replace(" -> ", "\t").Split('\t')[^1];
            if (x is not ' ' and not '?')
            {
                staged.Add(new StatusFileDto(path, x.ToString(), Staged: true));
            }

            if (y is not ' ')
            {
                unstaged.Add(new StatusFileDto(path, y == '?' ? "U" : y.ToString(), Staged: false));
            }
        }

        (int? ahead, int? behind) = GetAheadBehind(root);
        // v0.13.12: the Pull/Push previews name the upstream explicitly.
        CommandResult up = Run(root, "rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}");
        string? upstream = up.ExitCode == 0 && !string.IsNullOrWhiteSpace(up.StdOut) ? up.StdOut.Trim() : null;
        return new RepoStatusDto(branch, unstaged.Count, staged.Count, [.. unstaged], [.. staged], ahead, behind, upstream);
    }

    // Branches without an upstream (or a detached HEAD) make `@{upstream}`
    // fail to resolve; git's exact wording there varies by version/locale,
    // so any non-zero exit is treated as "no upstream" rather than matching
    // stderr text.
    private (int? Ahead, int? Behind) GetAheadBehind(string root)
    {
        CommandResult result = Run(root, "rev-list", "--left-right", "--count", "HEAD...@{upstream}");
        if (result.ExitCode != 0)
        {
            return (null, null);
        }

        string[] parts = result.StdOut.Trim().Split('\t', StringSplitOptions.RemoveEmptyEntries);
        if (parts.Length == 2 && int.TryParse(parts[0], out int ahead) && int.TryParse(parts[1], out int behind))
        {
            return (ahead, behind);
        }

        return (null, null);
    }

    public RefTreeDto GetRefs()
    {
        string root = RequireRoot();
        string current = Run(root, "rev-parse", "--abbrev-ref", "HEAD").StdOut.Trim();
        CommandResult show = Run(
            root,
            "for-each-ref",
            "--format=%(objectname)%09%(*objectname)%09%(refname)%09%(refname:short)",
            "refs/heads", "refs/remotes", "refs/tags");
        if (show.ExitCode != 0)
        {
            throw new InvalidOperationException(show.StdErr.Trim());
        }

        List<RefItemDto> branches = [];
        List<RefItemDto> remotes = [];
        List<RefItemDto> tags = [];
        foreach (string line in show.StdOut.Split('\n', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
        {
            string[] p = line.Split('\t');
            if (p.Length < 4)
            {
                continue;
            }

            // Annotated tags peel (%(*objectname)) to the commit they tag;
            // the UI jumps to Target in the revision graph, so it must be a
            // commit id, never the tag object id.
            string target = string.IsNullOrWhiteSpace(p[1]) ? p[0] : p[1];
            RefItemDto item = new(p[3], p[2], target, Current: p[3] == current);
            if (p[2].StartsWith("refs/heads/", StringComparison.Ordinal))
            {
                branches.Add(item);
            }
            else if (p[2].StartsWith("refs/remotes/", StringComparison.Ordinal))
            {
                remotes.Add(item);
            }
            else
            {
                tags.Add(item);
            }
        }

        List<SubmoduleDto> submodules = [];
        CommandResult sm = Run(root, "submodule", "status", "--recursive");
        if (sm.ExitCode == 0)
        {
            foreach (string line in sm.StdOut.Split('\n', StringSplitOptions.RemoveEmptyEntries))
            {
                string trimmed = line.TrimStart(' ', '-', '+', 'U');
                string[] bits = trimmed.Split(' ', 3, StringSplitOptions.RemoveEmptyEntries);
                if (bits.Length >= 2)
                {
                    submodules.Add(new SubmoduleDto(Path.GetFileName(bits[1]), bits[1], bits[0]));
                }
            }
        }

        return new RefTreeDto([.. branches], [.. remotes], [.. tags], [.. submodules]);
    }

    public GitConfigDto GetConfig()
    {
        string root = RequireRoot();
        return new GitConfigDto(
            GetConfigValue(root, "user.name"),
            GetConfigValue(root, "user.email"),
            GetConfigValue(root, "core.autocrlf"),
            "local");
    }

    public GitConfigDto SetConfig(GitConfigUpdate update)
    {
        string root = RequireRoot();
        string scope = update.Global ? "--global" : "--local";
        if (update.UserName is not null)
        {
            Run(root, "config", scope, "user.name", update.UserName);
        }

        if (update.UserEmail is not null)
        {
            Run(root, "config", scope, "user.email", update.UserEmail);
        }

        if (update.AutoCrlf is not null)
        {
            Run(root, "config", scope, "core.autocrlf", update.AutoCrlf);
        }

        return GetConfig();
    }

    public VsCodeInfo DetectAndMaybeApplyVsCode()
    {
        VsCodeInfo info = VsCodeLocator.Detect();
        if (!info.Found || info.Path is null)
        {
            return info;
        }

        string root = RequireRoot();
        bool applied = false;
        if (string.IsNullOrWhiteSpace(GetConfigValue(root, "core.editor")))
        {
            Run(root, "config", "--local", "core.editor", VsCodeLocator.EditorCommand(info.Path));
            applied = true;
        }

        if (string.IsNullOrWhiteSpace(GetConfigValue(root, "diff.tool")))
        {
            Run(root, "config", "--local", "diff.tool", "vscode");
            Run(root, "config", "--local", "difftool.vscode.cmd", $"\"{info.Path}\" {VsCodeLocator.DiffCommand}");
            applied = true;
        }

        if (string.IsNullOrWhiteSpace(GetConfigValue(root, "merge.tool")))
        {
            Run(root, "config", "--local", "merge.tool", "vscode");
            Run(root, "config", "--local", "mergetool.vscode.cmd", $"\"{info.Path}\" {VsCodeLocator.MergeCommand}");
            applied = true;
        }

        return info with { Applied = applied };
    }

    public void Stage(IReadOnlyList<string> paths, bool unstage)
    {
        string root = RequireRoot();
        if (paths.Count == 0)
        {
            return;
        }

        List<string> args = unstage ? ["restore", "--staged", "--"] : ["add", "--"];
        args.AddRange(paths);
        CommandResult result = Run(root, [.. args]);
        if (result.ExitCode != 0)
        {
            throw new InvalidOperationException(result.StdErr.Trim());
        }
    }

    public string Commit(string message, bool amend = false)
    {
        string root = RequireRoot();
        if (string.IsNullOrWhiteSpace(message))
        {
            throw new InvalidOperationException("commit message is required");
        }

        List<string> args = amend ? ["commit", "--amend", "-m"] : ["commit", "-m"];
        args.Add(message.Trim());
        CommandResult result = Run(root, [.. args]);
        if (result.ExitCode != 0)
        {
            throw new InvalidOperationException(string.IsNullOrWhiteSpace(result.StdErr) ? result.StdOut.Trim() : result.StdErr.Trim());
        }

        return Run(root, "rev-parse", "HEAD").StdOut.Trim();
    }

    public void CreateBranch(string name, string? commit)
    {
        string root = RequireRoot();
        if (string.IsNullOrWhiteSpace(name))
        {
            throw new InvalidOperationException("branch name is required");
        }

        List<string> args = ["branch", name];
        if (!string.IsNullOrWhiteSpace(commit))
        {
            args.Add(commit.Trim());
        }

        CommandResult result = Run(root, [.. args]);
        if (result.ExitCode != 0)
        {
            throw new InvalidOperationException(result.StdErr.Trim());
        }
    }

    public void CreateTag(string name, string? commit)
    {
        string root = RequireRoot();
        if (string.IsNullOrWhiteSpace(name))
        {
            throw new InvalidOperationException("tag name is required");
        }

        List<string> args = ["tag", name];
        if (!string.IsNullOrWhiteSpace(commit))
        {
            args.Add(commit.Trim());
        }

        CommandResult result = Run(root, [.. args]);
        if (result.ExitCode != 0)
        {
            throw new InvalidOperationException(result.StdErr.Trim());
        }
    }

    private DiffDto GetUntrackedDiff(string root, string path, int context, bool ignoreWhitespace)
    {
        // git diff --no-index treats a literal "/dev/null" ("NUL" on
        // Windows) as an empty file without touching the filesystem, so the
        // real file comes back as one big "added" hunk through the normal
        // diff machinery -- context, -w, and binary detection all keep
        // working exactly like the tracked-file diff path.
        string emptyFile = OperatingSystem.IsWindows() ? "NUL" : "/dev/null";
        List<string> args = ["-c", "core.quotepath=false", "diff", "--no-color", "--no-index", $"-U{context}"];
        if (ignoreWhitespace)
        {
            args.Add("-w");
        }

        args.AddRange(["--", emptyFile, path]);
        CommandResult result = RunTimed(root, 30_000, [.. args]);

        // --no-index exits 1 when the two sides differ, which is true for
        // any new file with content; only >1 signals a real error.
        if (result.ExitCode > 1)
        {
            throw new InvalidOperationException(result.StdErr.Trim());
        }

        string text = result.StdOut;
        if (text.Contains("Binary files ", StringComparison.Ordinal))
        {
            return new DiffDto(path, "Binary file (not shown)", true);
        }

        if (text.Length > 1_000_000)
        {
            text = text[..1_000_000] + "\n… truncated …";
        }

        return new DiffDto(path, string.IsNullOrWhiteSpace(text) ? "(no diff)" : text, false);
    }

    private bool IsUntracked(string root, string path)
    {
        CommandResult result = Run(root, "ls-files", "--error-unmatch", "--", path);
        return result.ExitCode != 0;
    }

    private string? GetConfigValue(string root, string key)
    {
        CommandResult result = Run(root, "config", "--get", key);
        string value = result.StdOut.Trim();
        return result.ExitCode == 0 && value.Length > 0 ? value : null;
    }

    private static string[] ParseDecorations(string raw)
    {
        if (string.IsNullOrWhiteSpace(raw))
        {
            return [];
        }

        List<string> refs = [];
        foreach (string part in raw.Split(',', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries))
        {
            string name = part;
            if (name.StartsWith("HEAD -> ", StringComparison.Ordinal))
            {
                refs.Add("HEAD");
                name = name["HEAD -> ".Length..];
            }

            if (name.StartsWith("tag: ", StringComparison.Ordinal))
            {
                name = name["tag: ".Length..];
            }

            if (name.Length > 0 && name != "HEAD")
            {
                refs.Add(name);
            }
            else if (name == "HEAD")
            {
                refs.Add("HEAD");
            }
        }

        return [.. refs.Distinct(StringComparer.Ordinal)];
    }
}
