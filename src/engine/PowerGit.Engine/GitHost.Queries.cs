namespace PowerGit.Engine;

public sealed partial class GitHost
{
    private const char Field = '\u001f';
    private const char Record = '\u001e';

    public IReadOnlyList<RevisionDto> ListRevisions(int max = 800)
    {
        string root = RequireRoot();
        string head = Run(root, "rev-parse", "HEAD").StdOut.Trim();
        CommandResult log = RunTimed(
            root,
            60_000,
            "-c", "core.quotepath=false",
            "log", "--topo-order", "--branches",
            $"-n{Math.Clamp(max, 1, 5000)}",
            $"--pretty=format:%H{Field}%P{Field}%an{Field}%ae{Field}%cn{Field}%ce{Field}%aI{Field}%s{Field}%D{Field}%b{Record}");

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

    public CommitDetailDto GetCommit(string id)
    {
        string root = RequireRoot();
        CommandResult show = Run(
            root,
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

    public IReadOnlyList<FileChangeDto> ListFiles(string id)
    {
        string root = RequireRoot();
        CommandResult diff = Run(
            root,
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

    public DiffDto GetDiff(string id, string path)
    {
        string root = RequireRoot();
        CommandResult show = RunTimed(
            root,
            30_000,
            "-c", "core.quotepath=false",
            "show", "--format=", "--find-renames", id, "--", path);
        if (show.ExitCode != 0)
        {
            throw new InvalidOperationException(show.StdErr.Trim());
        }

        string text = show.StdOut;
        bool binary = text.Contains("Binary files ", StringComparison.Ordinal) || text.Contains("\0", StringComparison.Ordinal);
        if (binary)
        {
            return new DiffDto(path, "Binary file (not shown)", true);
        }

        if (text.Length > 1_000_000)
        {
            text = text[..1_000_000] + "\n… truncated …";
        }

        return new DiffDto(path, string.IsNullOrWhiteSpace(text) ? "(no textual diff)" : text, false);
    }

    public IReadOnlyList<TreeEntryDto> ListTree(string id, string? path)
    {
        string root = RequireRoot();
        List<string> args = ["-c", "core.quotepath=false", "ls-tree", "-z", id];
        if (!string.IsNullOrWhiteSpace(path))
        {
            args.Add("--");
            args.Add(path.Trim().TrimEnd('/') + "/");
        }

        CommandResult result = Run(root, [.. args]);
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

            entries.Add(new TreeEntryDto(rec[(tab + 1)..], meta[1], meta[2]));
        }

        return [.. entries.OrderBy(e => e.Type != "tree").ThenBy(e => e.Name, StringComparer.OrdinalIgnoreCase)];
    }

    public DiffDto GetWorkTreeDiff(string path, bool staged)
    {
        string root = RequireRoot();
        List<string> args = ["-c", "core.quotepath=false", "diff", "--no-color"];
        if (staged)
        {
            args.Add("--cached");
        }

        args.AddRange(["--", path]);
        CommandResult result = Run(root, [.. args]);
        if (result.ExitCode != 0)
        {
            throw new InvalidOperationException(result.StdErr.Trim());
        }

        string text = result.StdOut;
        if (text.Length > 1_000_000)
        {
            text = text[..1_000_000] + "\n… truncated …";
        }

        return new DiffDto(path, string.IsNullOrWhiteSpace(text) ? "(no diff)" : text, false);
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

        return new RepoStatusDto(branch, unstaged.Count, staged.Count, [.. unstaged], [.. staged]);
    }

    public RefTreeDto GetRefs()
    {
        string root = RequireRoot();
        string current = Run(root, "rev-parse", "--abbrev-ref", "HEAD").StdOut.Trim();
        CommandResult show = Run(
            root,
            "for-each-ref",
            "--format=%(objectname)%09%(refname)%09%(refname:short)",
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
            if (p.Length < 3)
            {
                continue;
            }

            RefItemDto item = new(p[2], p[1], p[0], Current: p[2] == current);
            if (p[1].StartsWith("refs/heads/", StringComparison.Ordinal))
            {
                branches.Add(item);
            }
            else if (p[1].StartsWith("refs/remotes/", StringComparison.Ordinal))
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

    public string Commit(string message)
    {
        string root = RequireRoot();
        if (string.IsNullOrWhiteSpace(message))
        {
            throw new InvalidOperationException("commit message is required");
        }

        CommandResult result = Run(root, "commit", "-m", message.Trim());
        if (result.ExitCode != 0)
        {
            throw new InvalidOperationException(string.IsNullOrWhiteSpace(result.StdErr) ? result.StdOut.Trim() : result.StdErr.Trim());
        }

        return Run(root, "rev-parse", "HEAD").StdOut.Trim();
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
