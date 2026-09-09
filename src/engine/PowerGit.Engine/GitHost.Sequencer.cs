using System.Diagnostics;
using System.Text;

namespace PowerGit.Engine;

/// <summary>
/// v0.15.0: merge, rebase (plain and interactive), cherry-pick, revert,
/// conflict resolution, mergetool, compare and archive. The posture changed
/// from "a conflict is an error: abort and answer 400" to Git Extensions':
/// a stopped operation is a state. A non-zero git exit that leaves the repo
/// in a detectable state (GetOperationState) answers 200 with that state in
/// the <see cref="RepoStatusDto"/>; anything else is a 400 with git's stderr.
/// Everything here is synchronous under the 300 s timeout: these finish in
/// well under a second and the UI wants the state, not streamed output.
/// </summary>
public sealed partial class GitHost
{
    private const int SequencerTimeoutMs = 300_000;

    /// <summary>Folder inside the git dir holding the interactive-rebase todo and message files; removed once no operation is left.</summary>
    private const string PowerGitDirName = "powergit";

    private static readonly HashSet<string> CommitActions = new(StringComparer.Ordinal)
    {
        "pick", "reword", "edit", "squash", "fixup", "drop",
    };

    private static readonly Dictionary<string, string> ShortActions = new(StringComparer.Ordinal)
    {
        ["p"] = "pick", ["r"] = "reword", ["e"] = "edit", ["s"] = "squash", ["f"] = "fixup", ["d"] = "drop",
        ["x"] = "exec", ["b"] = "break", ["l"] = "label", ["t"] = "reset", ["m"] = "merge", ["u"] = "update-ref",
    };

    // ---------------------------------------------------------------- merge

    /// <summary>Git Extensions FormMergeBranch: ff only | allow | no, squash, optional message, autostash, no-commit.</summary>
    public RepoStatusDto Merge(MergeRequest request)
    {
        string root = RequireRoot();
        if (string.IsNullOrWhiteSpace(request.Branch))
        {
            throw new InvalidOperationException("branch is required");
        }

        string ff = (request.Ff ?? "allow").Trim().ToLowerInvariant();
        if (ff is not ("only" or "allow" or "no"))
        {
            throw new InvalidOperationException($"unsupported ff mode '{request.Ff}' (only | allow | no)");
        }

        if (request.Squash && ff == "no")
        {
            throw new InvalidOperationException("Squash cannot be combined with no-ff (git refuses --squash --no-ff).");
        }

        RequireNoOperation(root);
        if (!request.Autostash && HasTrackedChanges(root))
        {
            throw new InvalidOperationException(
                "The working tree has uncommitted changes. Commit or stash them first, or merge with autostash.");
        }

        List<string> args = ["merge", ff switch { "only" => "--ff-only", "no" => "--no-ff", _ => "--ff" }];
        if (request.Squash)
        {
            args.Add("--squash");
        }

        if (request.NoCommit)
        {
            args.Add("--no-commit");
        }

        if (request.Autostash)
        {
            args.Add("--autostash");
        }

        if (!string.IsNullOrWhiteSpace(request.Message))
        {
            args.AddRange(["-m", request.Message.Trim()]);
        }

        args.AddRange(["--no-edit", "--", request.Branch.Trim()]);
        return FinishOperation(root, RunTimed(root, SequencerTimeoutMs, [.. args]), "Merge");
    }

    /// <summary>Commits a stopped merge (MERGE_HEAD) or a squash (SQUASH_MSG); 400 while conflicts remain.</summary>
    public RepoStatusDto MergeContinue(string? message)
    {
        string root = RequireRoot();
        (string state, _) = GetOperationState(root);
        if (state != "merging")
        {
            throw new InvalidOperationException("No merge in progress.");
        }

        RequireNoConflicts(root);
        string gitDir = GitDir(root);
        List<string> args = ["commit"];
        if (!string.IsNullOrWhiteSpace(message))
        {
            args.AddRange(["-m", message.Trim()]);
        }
        else if (File.Exists(Path.Combine(gitDir, "MERGE_HEAD")))
        {
            args.Add("--no-edit");
        }
        else
        {
            args.AddRange(["-F", Path.Combine(gitDir, "SQUASH_MSG")]);
        }

        CommandResult result = Run(root, [.. args]);
        if (result.ExitCode != 0)
        {
            throw new InvalidOperationException(ErrorText(result));
        }

        return GetStatus();
    }

    /// <summary>`git merge --abort`; a stopped squash has no MERGE_HEAD, so it is `reset --merge` plus removing SQUASH_MSG.</summary>
    public RepoStatusDto MergeAbort()
    {
        string root = RequireRoot();
        string gitDir = GitDir(root);
        if (File.Exists(Path.Combine(gitDir, "MERGE_HEAD")))
        {
            CommandResult result = Run(root, "merge", "--abort");
            if (result.ExitCode != 0)
            {
                throw new InvalidOperationException(ErrorText(result));
            }
        }
        else if (File.Exists(Path.Combine(gitDir, "SQUASH_MSG")))
        {
            CommandResult result = Run(root, "reset", "--merge");
            if (result.ExitCode != 0)
            {
                throw new InvalidOperationException(ErrorText(result));
            }

            File.Delete(Path.Combine(gitDir, "SQUASH_MSG"));
        }
        else
        {
            throw new InvalidOperationException("No merge in progress.");
        }

        return GetStatus();
    }

    // --------------------------------------------------------------- rebase

    public RepoStatusDto Rebase(string onto) => Rebase(new RebaseRequest(onto));

    /// <summary>
    /// `git rebase [--autostash] [--rebase-merges] [--autosquash] -- onto`.
    /// Autosquash is only honoured by the interactive path in git 2.38, so it
    /// runs `-i` with a sequence editor that accepts git's own todo. With
    /// <see cref="RebaseRequest.Todo"/> the UI's list is run instead.
    /// </summary>
    public RepoStatusDto Rebase(RebaseRequest request)
    {
        string root = RequireRoot();
        if (string.IsNullOrWhiteSpace(request.Onto))
        {
            throw new InvalidOperationException("onto is required");
        }

        RequireNoOperation(root);
        if (!request.Autostash && HasTrackedChanges(root))
        {
            throw new InvalidOperationException(
                "The working tree has uncommitted changes. Commit or stash them before rebasing, or rebase with autostash.");
        }

        if (request.Todo is not null)
        {
            return RunInteractiveRebase(root, request);
        }

        List<string> args = ["rebase"];
        Dictionary<string, string> env = [];
        if (request.Autostash)
        {
            args.Add("--autostash");
        }

        if (request.RebaseMerges)
        {
            args.Add("--rebase-merges");
        }

        if (request.Autosquash)
        {
            args.AddRange(["-i", "--autosquash"]);
            env["GIT_SEQUENCE_EDITOR"] = "true";
        }

        args.AddRange(["--", request.Onto.Trim()]);
        return FinishOperation(root, RunTimedWithEnv(root, SequencerTimeoutMs, env, [.. args]), "Rebase");
    }

    /// <summary>
    /// Captures the todo list git would offer for `rebase -i` without starting
    /// a rebase: the sequence editor copies the file out and exits 1, so git
    /// removes its own state (and re-applies the autostash). Git's ordering
    /// (autosquash) and its label/reset/merge lines (rebase-merges) come for
    /// free. Runs through `sh`, which Git for Windows ships along with `cp`.
    /// </summary>
    public RebaseTodoDto CaptureRebaseTodo(RebaseTodoRequest request)
    {
        string root = RequireRoot();
        if (string.IsNullOrWhiteSpace(request.Onto))
        {
            throw new InvalidOperationException("onto is required");
        }

        RequireNoOperation(root);
        string folder = PowerGitDir(root, create: true);
        string capture = Path.Combine(folder, "todo-capture.txt");
        File.Delete(capture);

        Dictionary<string, string> env = new()
        {
            ["GIT_SEQUENCE_EDITOR"] = $"f(){{ cp \"$1\" '{ShellPath(capture)}'; exit 1; }}; f",
        };
        // The UI expects subjects, regardless of the user's instructionFormat
        // or Git versions whose default includes a comment prefix.
        List<string> args = ["-c", "rebase.instructionFormat=%s", "rebase", "-i", "--autostash"];
        if (request.Autosquash)
        {
            args.Add("--autosquash");
        }

        if (request.RebaseMerges)
        {
            args.Add("--rebase-merges");
        }

        args.AddRange(["--", request.Onto.Trim()]);
        CommandResult result = RunTimedWithEnv(root, SequencerTimeoutMs, env, [.. args]);

        // Belt and braces: the editor failing makes git drop its state, but a
        // captured todo must never leave a rebase behind.
        if (GetOperationState(root).State == "rebasing")
        {
            Run(root, "rebase", "--abort");
        }

        if (!File.Exists(capture))
        {
            CleanupPowergitDir(root);
            throw new InvalidOperationException($"Could not build the rebase todo. {ErrorText(result)}".Trim());
        }

        string text = File.ReadAllText(capture);
        File.Delete(capture);
        CleanupPowergitDir(root);

        string onto = Run(root, "rev-parse", "--verify", request.Onto.Trim() + "^{commit}").StdOut.Trim();
        string head = Run(root, "rev-parse", "--abbrev-ref", "HEAD").StdOut.Trim();
        return new RebaseTodoDto([.. ParseTodo(text)], onto, head);
    }

    internal static IEnumerable<RebaseTodoLine> ParseTodo(string text)
    {
        foreach (string raw in text.Replace("\r\n", "\n").Split('\n'))
        {
            string line = raw.Trim();
            if (line.Length == 0 || line[0] == '#')
            {
                continue;
            }

            string[] parts = line.Split(' ', 3, StringSplitOptions.RemoveEmptyEntries);
            string action = ShortActions.TryGetValue(parts[0], out string? full) ? full : parts[0];
            if (CommitActions.Contains(action) && parts.Length >= 2 && !parts[1].StartsWith('-'))
            {
                yield return new RebaseTodoLine(action, parts[1], parts.Length > 2 ? parts[2] : null, line);
            }
            else
            {
                yield return new RebaseTodoLine(action, null, null, line);
            }
        }
    }

    /// <summary>
    /// Runs the UI's todo. Reword and squash-with-message become
    /// `pick`/`squash sha` followed by `exec git commit --amend -q -F msg-n`
    /// once the squash chain ends; `edit` stops in the rebasing state. The
    /// folder holding todo and messages lives until no operation remains.
    /// </summary>
    private RepoStatusDto RunInteractiveRebase(string root, RebaseRequest request)
    {
        string folder = PowerGitDir(root, create: true);
        StringBuilder todo = new();
        string? pendingExec = null;
        int n = 0;
        RebaseTodoEntry[] entries = request.Todo ?? [];
        for (int i = 0; i < entries.Length; i++)
        {
            RebaseTodoEntry entry = entries[i];
            string action = (entry.Action ?? "").Trim().ToLowerInvariant();
            action = ShortActions.TryGetValue(action, out string? full) ? full : action;
            bool folds = action is "squash" or "fixup";
            if (pendingExec is not null && !folds)
            {
                todo.Append(pendingExec).Append('\n');
                pendingExec = null;
            }

            if (CommitActions.Contains(action))
            {
                if (string.IsNullOrWhiteSpace(entry.Sha))
                {
                    throw new InvalidOperationException($"todo line {i + 1}: '{action}' needs a sha");
                }

                if (action == "drop")
                {
                    continue;
                }

                todo.Append(action == "reword" ? "pick" : action).Append(' ').Append(entry.Sha.Trim()).Append('\n');
                if (action is "reword" or "squash" && !string.IsNullOrWhiteSpace(entry.Message))
                {
                    string msg = Path.Combine(folder, $"msg-{++n}.txt");
                    File.WriteAllText(msg, entry.Message.Replace("\r\n", "\n").TrimEnd() + "\n", new UTF8Encoding(false));
                    pendingExec = $"exec git commit --amend -q -F '{ShellPath(msg)}'";
                }
            }
            else if (!string.IsNullOrWhiteSpace(entry.Raw))
            {
                todo.Append(entry.Raw.Trim()).Append('\n');
            }
            else
            {
                throw new InvalidOperationException($"todo line {i + 1}: unsupported action '{entry.Action}'");
            }
        }

        if (pendingExec is not null)
        {
            todo.Append(pendingExec).Append('\n');
        }

        string todoFile = Path.Combine(folder, "todo.txt");
        File.WriteAllText(todoFile, todo.ToString(), new UTF8Encoding(false));

        Dictionary<string, string> env = new()
        {
            ["GIT_SEQUENCE_EDITOR"] = $"cp '{ShellPath(todoFile)}'",
        };
        List<string> args = ["rebase", "-i"];
        if (request.Autostash)
        {
            args.Add("--autostash");
        }

        if (request.RebaseMerges)
        {
            args.Add("--rebase-merges");
        }

        args.AddRange(["--", request.Onto.Trim()]);
        return FinishOperation(root, RunTimedWithEnv(root, SequencerTimeoutMs, env, [.. args]), "Rebase");
    }

    // ------------------------------------------------- cherry-pick / revert

    public RepoStatusDto CherryPick(string commitId)
    {
        string root = RequireRoot();
        if (string.IsNullOrWhiteSpace(commitId))
        {
            throw new InvalidOperationException("commit is required");
        }

        RequireNoOperation(root);
        if (HasTrackedChanges(root))
        {
            throw new InvalidOperationException(
                "The working tree has uncommitted changes. Commit or stash them before cherry-picking.");
        }

        return FinishOperation(root, RunTimed(root, SequencerTimeoutMs, "cherry-pick", commitId), "Cherry-pick");
    }

    public RepoStatusDto Revert(string commitId)
    {
        string root = RequireRoot();
        if (string.IsNullOrWhiteSpace(commitId))
        {
            throw new InvalidOperationException("commit is required");
        }

        RequireNoOperation(root);
        if (HasTrackedChanges(root))
        {
            throw new InvalidOperationException(
                "The working tree has uncommitted changes. Commit or stash them before reverting.");
        }

        return FinishOperation(root, RunTimed(root, SequencerTimeoutMs, "revert", "--no-edit", commitId), "Revert");
    }

    /// <summary>
    /// `git rebase|cherry-pick|revert --continue|--skip|--abort`. Continue is
    /// refused while conflicts remain (git would say the same, less clearly);
    /// a continue that stops again on the next commit is a state, not an error.
    /// </summary>
    public RepoStatusDto SequencerAction(string op, string action)
    {
        string root = RequireRoot();
        if (op is not ("rebase" or "cherry-pick" or "revert"))
        {
            throw new InvalidOperationException($"unsupported operation '{op}'");
        }

        if (action is not ("continue" or "skip" or "abort"))
        {
            throw new InvalidOperationException($"unsupported action '{action}' (continue | skip | abort)");
        }

        (string state, _) = GetOperationState(root);
        string expected = op switch { "rebase" => "rebasing", "cherry-pick" => "cherry-picking", _ => "reverting" };
        if (state != expected)
        {
            throw new InvalidOperationException(state == "none" ? $"No {op} in progress." : $"The repository is {state}, not {expected}.");
        }

        if (action == "continue")
        {
            RequireNoConflicts(root);
        }

        CommandResult result = RunTimed(root, SequencerTimeoutMs, "-c", "core.editor=true", op, $"--{action}");
        if (result.ExitCode != 0 && action == "abort")
        {
            throw new InvalidOperationException(ErrorText(result));
        }

        return FinishOperation(root, result, $"{op} --{action}");
    }

    // ------------------------------------------------------------ conflicts

    public IReadOnlyList<ConflictFileDto> ListConflicts() => ListConflicts(RequireRoot());

    /// <summary>Stage 1 (base), 2 (ours) or 3 (theirs) of a conflicted path, bounded like any blob.</summary>
    public DiffDto GetConflictBlob(string path, int stage, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(path))
        {
            throw new InvalidOperationException("path is required");
        }

        if (stage is < 1 or > 3)
        {
            throw new InvalidOperationException("stage must be 1 (base), 2 (ours) or 3 (theirs)");
        }

        return GetBlob($":{stage}", path, ct);
    }

    /// <summary>
    /// Git Extensions GitModule.HandleConflictSelectSide: take ours / theirs /
    /// base is `checkout-index -f --stage=N` plus `add`; a side that does not
    /// exist (deleted on that side) means the file goes; `delete` is `rm`;
    /// `mark` stages whatever the working tree holds (after a mergetool).
    /// Stage based, so a rebase's inverted ours/theirs is only a labelling
    /// matter for the UI.
    /// </summary>
    public RepoStatusDto ResolveConflicts(IReadOnlyList<string> paths, string take)
    {
        string root = RequireRoot();
        if (paths.Count == 0)
        {
            throw new InvalidOperationException("paths are required");
        }

        int? stage = take switch { "base" => 1, "ours" => 2, "theirs" => 3, "mark" or "delete" => null, _ => throw new InvalidOperationException($"unsupported take '{take}' (ours | theirs | base | mark | delete)") };
        Dictionary<string, ConflictFileDto> conflicts = ListConflicts(root).ToDictionary(c => c.Path, StringComparer.Ordinal);
        foreach (string raw in paths)
        {
            string path = raw.Replace('\\', '/').Trim();
            if (path.Length == 0)
            {
                continue;
            }

            CommandResult result;
            if (take == "delete")
            {
                result = Run(root, "rm", "-q", "-f", "--", path);
            }
            else if (take == "mark")
            {
                result = Run(root, "add", "--", path);
            }
            else
            {
                bool exists = conflicts.TryGetValue(path, out ConflictFileDto? c) && stage switch { 1 => c.HasBase, 2 => c.HasOurs, _ => c.HasTheirs };
                if (!exists)
                {
                    result = Run(root, "rm", "-q", "-f", "--", path);
                }
                else
                {
                    result = Run(root, "checkout-index", "-f", $"--stage={stage}", "--", path);
                    if (result.ExitCode == 0)
                    {
                        result = Run(root, "add", "--", path);
                    }
                }
            }

            if (result.ExitCode != 0)
            {
                throw new InvalidOperationException($"{path}: {ErrorText(result)}");
            }
        }

        return GetStatus();
    }

    /// <summary>Detached `git mergetool --no-prompt -y -- path` (like <see cref="OpenWorkTreeDifftool"/>); 400 when merge.tool is unset.</summary>
    public void OpenMergetool(string path)
    {
        string root = RequireRoot();
        if (string.IsNullOrWhiteSpace(path))
        {
            throw new InvalidOperationException("path is required");
        }

        if (string.IsNullOrWhiteSpace(GetConfigValue(root, "merge.tool")))
        {
            throw new InvalidOperationException("No mergetool configured. Settings ▸ Tools.");
        }

        ProcessStartInfo psi = new()
        {
            FileName = _gitPath,
            WorkingDirectory = root,
            UseShellExecute = false,
            CreateNoWindow = true,
        };
        psi.Environment["GIT_OPTIONAL_LOCKS"] = "0";
        foreach (string arg in new[] { "mergetool", "--no-prompt", "-y", "--", path })
        {
            psi.ArgumentList.Add(arg);
        }

        using Process? process = Process.Start(psi);
        if (process is null)
        {
            throw new InvalidOperationException("Failed to start git mergetool.");
        }

        RecordDetached([.. psi.ArgumentList], DetachedToolNote);
    }

    // ------------------------------------------------------ compare / archive

    /// <summary>
    /// `git diff from to` (or `from` against the working tree when
    /// <paramref name="to"/> is null): the changed files and the first one's
    /// diff, or the diff of <paramref name="path"/> when given.
    /// </summary>
    public object Compare(string from, string? to, string? path, int context = 3, bool ignoreWhitespace = false, bool fullFile = false, CancellationToken ct = default)
    {
        string root = RequireRoot();
        if (string.IsNullOrWhiteSpace(from))
        {
            throw new InvalidOperationException("from is required");
        }

        List<string> revs = [from.Trim()];
        if (!string.IsNullOrWhiteSpace(to))
        {
            revs.Add(to.Trim());
        }

        if (!string.IsNullOrWhiteSpace(path))
        {
            return CompareDiff(root, revs, path, context, ignoreWhitespace, fullFile, ct);
        }

        CommandResult list = RunTimed(root, 30_000, ct, ["-c", "core.quotepath=false", "diff", "--name-status", "-M", .. revs, "--"]);
        if (list.ExitCode != 0)
        {
            throw new InvalidOperationException(list.StdErr.Trim());
        }

        List<FileChangeDto> files = [];
        foreach (string line in list.StdOut.Split('\n', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
        {
            string[] parts = line.Split('\t', StringSplitOptions.RemoveEmptyEntries);
            if (parts.Length >= 2)
            {
                files.Add(new FileChangeDto(parts[^1], parts[0][..1], Binary: false));
            }
        }

        DiffDto? first = files.Count > 0 ? CompareDiff(root, revs, files[0].Path, context, ignoreWhitespace, fullFile, ct) : null;
        return new CommitChangesDto(files, first);
    }

    private DiffDto CompareDiff(string root, List<string> revs, string path, int context, bool ignoreWhitespace, bool fullFile, CancellationToken ct)
    {
        int u = fullFile ? 100_000 : Math.Clamp(context, 0, 1000);
        List<string> args = ["-c", "core.quotepath=false", "diff", "--no-color", "--find-renames", $"-U{u}"];
        if (ignoreWhitespace)
        {
            args.Add("-w");
        }

        args.AddRange(revs);
        args.AddRange(["--", path]);
        GitProcess.Result result = RunCapped(root, 30_000, ct, MaxDiffChars, [.. args]);
        if (result.ExitCode != 0)
        {
            throw new InvalidOperationException(result.StdErr.Trim());
        }

        return BoundDiffText(path, result.StdOut, result.StdOutTruncated, "(no diff)");
    }

    /// <summary>
    /// `git archive` of a commit, streamed: the returned stream is git's
    /// stdout and disposing it ends the process. Format is zip or tar.gz.
    /// </summary>
    public Stream OpenArchive(string id, string format, out string fileName, out string contentType)
    {
        string root = RequireRoot();
        if (string.IsNullOrWhiteSpace(id))
        {
            throw new InvalidOperationException("commit is required");
        }

        format = string.IsNullOrWhiteSpace(format) ? "zip" : format.Trim().ToLowerInvariant();
        if (format is not ("zip" or "tar.gz"))
        {
            throw new InvalidOperationException("format must be zip or tar.gz");
        }

        CommandResult sha = Run(root, "rev-parse", "--verify", "--short", id + "^{commit}");
        if (sha.ExitCode != 0)
        {
            throw new InvalidOperationException(sha.StdErr.Trim());
        }

        fileName = $"{Current!.Name}-{sha.StdOut.Trim()}.{format}";
        contentType = format == "zip" ? "application/zip" : "application/gzip";
        ProcessStartInfo psi = new()
        {
            FileName = _gitPath,
            WorkingDirectory = root,
            UseShellExecute = false,
            CreateNoWindow = true,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
        };
        foreach ((string key, string value) in GitEnvironment)
        {
            psi.Environment[key] = value;
        }

        foreach (string arg in new[] { "archive", $"--format={format}", $"--prefix={Current!.Name}/", id })
        {
            psi.ArgumentList.Add(arg);
        }

        Process process = Process.Start(psi) ?? throw new InvalidOperationException("Failed to start git archive.");
        process.BeginErrorReadLine();
        RecordDetached([.. psi.ArgumentList], "(streamed to the download; exit code not observed)");
        return new ProcessOutputStream(process);
    }

    /// <summary>A process's stdout as a read-only stream; disposing kills what is left of the process.</summary>
    private sealed class ProcessOutputStream(Process process) : Stream
    {
        private readonly Stream _inner = process.StandardOutput.BaseStream;

        public override bool CanRead => true;
        public override bool CanSeek => false;
        public override bool CanWrite => false;
        public override long Length => throw new NotSupportedException();
        public override long Position { get => throw new NotSupportedException(); set => throw new NotSupportedException(); }
        public override void Flush() { }
        public override int Read(byte[] buffer, int offset, int count) => _inner.Read(buffer, offset, count);
        public override Task<int> ReadAsync(byte[] buffer, int offset, int count, CancellationToken ct) => _inner.ReadAsync(buffer, offset, count, ct);
        public override ValueTask<int> ReadAsync(Memory<byte> buffer, CancellationToken ct = default) => _inner.ReadAsync(buffer, ct);
        public override long Seek(long offset, SeekOrigin origin) => throw new NotSupportedException();
        public override void SetLength(long value) => throw new NotSupportedException();
        public override void Write(byte[] buffer, int offset, int count) => throw new NotSupportedException();

        protected override void Dispose(bool disposing)
        {
            if (disposing)
            {
                try
                {
                    if (!process.HasExited)
                    {
                        process.Kill(entireProcessTree: true);
                    }
                }
                catch
                {
                    // already gone
                }

                process.Dispose();
            }

            base.Dispose(disposing);
        }
    }

    // -------------------------------------------------------------- helpers

    private static string ErrorText(CommandResult result)
        => string.IsNullOrWhiteSpace(result.StdErr) ? result.StdOut.Trim() : result.StdErr.Trim();

    /// <summary>Tracked-file changes only: untracked files never block a merge or rebase (and autostash would not stash them).</summary>
    private bool HasTrackedChanges(string root)
        => !string.IsNullOrWhiteSpace(Run(root, "status", "--porcelain=v1", "-uno").StdOut);

    private void RequireNoOperation(string root)
    {
        (string state, _) = GetOperationState(root);
        if (state != "none")
        {
            throw new InvalidOperationException($"The repository is {state}. Continue, skip or abort that operation first.");
        }
    }

    private void RequireNoConflicts(string root)
    {
        int count = ListConflicts(root).Count;
        if (count > 0)
        {
            throw new InvalidOperationException($"Unresolved conflicts remain ({count} file{(count == 1 ? "" : "s")}). Resolve them first.");
        }
    }

    /// <summary>
    /// The contract of every operation here: a non-zero exit that left a
    /// detectable state is answered with that state; a non-zero exit that
    /// left nothing (ff-only refused, bad ref, …) is the error. The
    /// interactive-rebase folder is dropped once no operation remains.
    /// </summary>
    private RepoStatusDto FinishOperation(string root, CommandResult result, string what)
    {
        if (result.ExitCode != 0 && GetOperationState(root).State == "none")
        {
            CleanupPowergitDir(root);
            throw new InvalidOperationException($"{what} failed. {ErrorText(result)}".Trim());
        }

        RepoStatusDto status = GetStatus();
        if (status.State == "none")
        {
            CleanupPowergitDir(root);
        }

        return status;
    }

    private string PowerGitDir(string root, bool create)
    {
        string dir = Path.Combine(GitDir(root), PowerGitDirName);
        if (create)
        {
            Directory.CreateDirectory(dir);
        }

        return dir;
    }

    private void CleanupPowergitDir(string root)
    {
        try
        {
            string dir = PowerGitDir(root, create: false);
            if (Directory.Exists(dir))
            {
                Directory.Delete(dir, recursive: true);
            }
        }
        catch
        {
            // best effort; the next interactive rebase overwrites the files
        }
    }

    /// <summary>Forward slashes for the MSYS `sh` that runs GIT_SEQUENCE_EDITOR; the caller single-quotes it.</summary>
    private static string ShellPath(string path) => path.Replace('\\', '/').Replace("'", "'\\''");
}
