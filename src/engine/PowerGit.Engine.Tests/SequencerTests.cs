using Xunit;

namespace PowerGit.Engine.Tests;

/// <summary>
/// v0.15.0 sequencer: merge, rebase (plain and interactive), conflicts,
/// cherry-pick and revert. Every repository here is a throwaway TempRepo with
/// its own identity configured; nothing ever runs against the real work tree.
/// </summary>
public sealed class SequencerTests
{
    private static GitHost Host(TempRepo repo)
    {
        GitHost host = new();
        host.Open(repo.Dir);
        return host;
    }

    // ---------------------------------------------------------------- merge

    [Fact]
    public void Merge_ff_only_on_diverged_branches_is_an_error()
    {
        using TempRepo repo = new();
        repo.Conflict();
        GitHost host = Host(repo);

        InvalidOperationException ex = Assert.Throws<InvalidOperationException>(
            () => host.Merge(new MergeRequest("topic", Ff: "only")));
        Assert.Contains("Merge failed", ex.Message, StringComparison.Ordinal);
        Assert.Equal("none", host.GetStatus().State);
    }

    [Fact]
    public void Merge_no_ff_creates_a_merge_commit()
    {
        using TempRepo repo = new();
        GitHost host = Host(repo);

        RepoStatusDto after = host.Merge(new MergeRequest("feature", Ff: "no"));
        Assert.Equal("none", after.State);
        Assert.Null(after.Operation);

        // Two parents and the feature commit is reachable: a real merge commit.
        Assert.Equal(2, repo.Output("rev-list", "--parents", "-n1", "HEAD").Split(' ').Length - 1);
        Assert.Contains("feature-commit", repo.Subjects());
        Assert.True(File.Exists(Path.Combine(repo.Dir, "b.txt")));
    }

    [Fact]
    public void Merge_squash_leaves_staged_changes_and_no_merge_head()
    {
        using TempRepo repo = new();
        GitHost host = Host(repo);
        string headBefore = repo.HeadId();

        RepoStatusDto after = host.Merge(new MergeRequest("feature", Squash: true));

        Assert.Equal(headBefore, repo.HeadId()); // squash commits nothing itself
        Assert.Contains(after.Staged, f => f.Path == "b.txt");
        Assert.False(File.Exists(Path.Combine(repo.Dir, ".git", "MERGE_HEAD")));
        Assert.True(File.Exists(Path.Combine(repo.Dir, ".git", "SQUASH_MSG")));
        // A stopped squash is still "merging": the banner offers Commit / Abort.
        Assert.Equal("merging", after.State);

        RepoStatusDto committed = host.MergeContinue("squashed feature");
        Assert.Equal("none", committed.State);
        Assert.Equal("squashed feature", repo.Subjects()[0]);
        Assert.False(File.Exists(Path.Combine(repo.Dir, ".git", "SQUASH_MSG")));
    }

    [Fact]
    public void Merge_squash_with_no_ff_is_refused()
    {
        using TempRepo repo = new();
        GitHost host = Host(repo);
        Assert.Throws<InvalidOperationException>(() => host.Merge(new MergeRequest("feature", Ff: "no", Squash: true)));
    }

    [Fact]
    public void Merge_conflict_reports_merging_with_a_both_modified_conflict()
    {
        using TempRepo repo = new();
        repo.Conflict();
        GitHost host = Host(repo);

        RepoStatusDto stopped = host.Merge(new MergeRequest("topic"));

        Assert.Equal("merging", stopped.State);
        Assert.Equal("merge", stopped.Operation?.Kind);
        Assert.Equal("main", stopped.Operation?.HeadName);
        Assert.Equal("topic", stopped.Operation?.OntoName);
        Assert.NotNull(stopped.Conflicts);
        ConflictFileDto conflict = Assert.Single(stopped.Conflicts!);
        Assert.Equal("conflict.txt", conflict.Path);
        Assert.Equal("both-modified", conflict.Kind);
        Assert.True(conflict.HasBase && conflict.HasOurs && conflict.HasTheirs);
        Assert.Contains(stopped.Unstaged, f => f.Path == "conflict.txt" && f.Status == "C");
        // The clean side of the merge is staged, not conflicted.
        Assert.Contains(stopped.Staged, f => f.Path == "topic-only.txt");
    }

    [Fact]
    public void Merge_continue_is_refused_while_conflicts_remain()
    {
        using TempRepo repo = new();
        repo.Conflict();
        GitHost host = Host(repo);
        host.Merge(new MergeRequest("topic"));

        InvalidOperationException ex = Assert.Throws<InvalidOperationException>(() => host.MergeContinue(null));
        Assert.Contains("Unresolved conflicts", ex.Message, StringComparison.Ordinal);
    }

    [Fact]
    public void Resolve_ours_then_continue_commits_the_merge()
    {
        using TempRepo repo = new();
        repo.Conflict();
        GitHost host = Host(repo);
        host.Merge(new MergeRequest("topic"));

        RepoStatusDto resolved = host.ResolveConflicts(["conflict.txt"], "ours");
        Assert.Null(resolved.Conflicts);
        Assert.Equal("merging", resolved.State); // resolved, but not committed yet
        Assert.Equal("main", repo.Read("conflict.txt").Trim());

        RepoStatusDto done = host.MergeContinue(null);
        Assert.Equal("none", done.State);
        Assert.Equal(2, repo.Output("rev-list", "--parents", "-n1", "HEAD").Split(' ').Length - 1);
        Assert.Equal("main", repo.Read("conflict.txt").Trim());
    }

    [Fact]
    public void Resolve_theirs_takes_the_other_side()
    {
        using TempRepo repo = new();
        repo.Conflict();
        GitHost host = Host(repo);
        host.Merge(new MergeRequest("topic"));

        host.ResolveConflicts(["conflict.txt"], "theirs");
        Assert.Equal("topic", repo.Read("conflict.txt").Trim());

        RepoStatusDto done = host.MergeContinue("take theirs");
        Assert.Equal("none", done.State);
        Assert.Equal("take theirs", repo.Subjects()[0]);
        Assert.Equal("topic", repo.Read("conflict.txt").Trim());
    }

    [Fact]
    public void Merge_abort_restores_the_pre_merge_state()
    {
        using TempRepo repo = new();
        repo.Conflict();
        GitHost host = Host(repo);
        string headBefore = repo.HeadId();
        host.Merge(new MergeRequest("topic"));

        RepoStatusDto after = host.MergeAbort();

        Assert.Equal("none", after.State);
        Assert.Null(after.Operation);
        Assert.Null(after.Conflicts);
        Assert.Equal(headBefore, repo.HeadId());
        Assert.Equal("main", repo.Read("conflict.txt").Trim());
        Assert.False(repo.IsDirtyPublic());
    }

    [Fact]
    public void Merge_on_a_dirty_tree_needs_autostash()
    {
        using TempRepo repo = new();
        GitHost host = Host(repo);
        repo.Write("a.txt", "dirty\n");

        Assert.Throws<InvalidOperationException>(() => host.Merge(new MergeRequest("feature")));

        RepoStatusDto after = host.Merge(new MergeRequest("feature", Autostash: true));
        Assert.Equal("none", after.State);
        Assert.Equal("dirty", repo.Read("a.txt").Trim()); // autostash re-applied
        Assert.True(File.Exists(Path.Combine(repo.Dir, "b.txt")));
    }

    // --------------------------------------------------------------- rebase

    [Fact]
    public void Rebase_conflict_reports_step_total_head_name_and_onto()
    {
        using TempRepo repo = new();
        repo.Conflict("topic");
        // A second topic commit so the rebase has two steps to replay.
        repo.Write("second.txt", "second\n");
        repo.StageAndCommit("topic-second");
        GitHost host = Host(repo);
        string onto = repo.Output("rev-parse", "main");

        RepoStatusDto stopped = host.Rebase(new RebaseRequest("main"));

        Assert.Equal("rebasing", stopped.State);
        RepoOperationDto op = Assert.IsType<RepoOperationDto>(stopped.Operation);
        Assert.Equal("rebase", op.Kind);
        Assert.Equal("topic", op.HeadName);
        Assert.Equal(onto, op.Onto);
        Assert.Equal("main", op.OntoName);
        Assert.Equal(1, op.Step);
        Assert.Equal(2, op.Total);
        Assert.False(string.IsNullOrWhiteSpace(op.StoppedSha));
        Assert.Contains(stopped.Unstaged, f => f.Path == "conflict.txt" && f.Status == "C");
        Assert.Equal("both-modified", Assert.Single(stopped.Conflicts!).Kind);
    }

    [Fact]
    public void Rebase_resolve_then_continue_finishes_the_replay()
    {
        using TempRepo repo = new();
        repo.Conflict("topic");
        GitHost host = Host(repo);
        host.Rebase(new RebaseRequest("main"));

        // Stage 2 during a rebase is the branch being rebased onto ("main"):
        // resolution is stage based, the inverted labelling is the UI's job.
        host.ResolveConflicts(["conflict.txt"], "ours");
        RepoStatusDto done = host.SequencerAction("rebase", "continue");

        Assert.Equal("none", done.State);
        Assert.Equal("main", repo.Read("conflict.txt").Trim());
        Assert.Equal(["topic-change", "main-change", "conflict-base", "init"], repo.Subjects());
    }

    [Fact]
    public void Rebase_skip_drops_the_conflicting_commit()
    {
        using TempRepo repo = new();
        repo.Conflict("topic");
        GitHost host = Host(repo);
        host.Rebase(new RebaseRequest("main"));

        RepoStatusDto done = host.SequencerAction("rebase", "skip");

        Assert.Equal("none", done.State);
        Assert.DoesNotContain("topic-change", repo.Subjects());
        Assert.Equal("main", repo.Read("conflict.txt").Trim());
    }

    [Fact]
    public void Rebase_abort_restores_the_branch()
    {
        using TempRepo repo = new();
        repo.Conflict("topic");
        GitHost host = Host(repo);
        string headBefore = repo.HeadId();
        host.Rebase(new RebaseRequest("main"));

        RepoStatusDto after = host.SequencerAction("rebase", "abort");

        Assert.Equal("none", after.State);
        Assert.Equal(headBefore, repo.HeadId());
        Assert.Equal("topic", repo.Read("conflict.txt").Trim());
        Assert.False(repo.IsDirtyPublic());
    }

    [Fact]
    public void Rebase_autostash_replays_over_local_changes()
    {
        using TempRepo repo = new();
        GitHost host = Host(repo);
        host.Checkout("feature", force: false);
        repo.Write("dirty.txt", "dirty\n");
        repo.Run("add", "dirty.txt");
        repo.Run("commit", "-m", "tracked-dirty");
        repo.Write("dirty.txt", "changed\n");

        Assert.Throws<InvalidOperationException>(() => host.Rebase(new RebaseRequest("main")));

        RepoStatusDto after = host.Rebase(new RebaseRequest("main", Autostash: true));
        Assert.Equal("none", after.State);
        Assert.Equal("changed", repo.Read("dirty.txt").Trim());
    }

    [Fact]
    public void Rebase_while_another_operation_runs_is_refused()
    {
        using TempRepo repo = new();
        repo.Conflict();
        GitHost host = Host(repo);
        host.Merge(new MergeRequest("topic"));

        InvalidOperationException ex = Assert.Throws<InvalidOperationException>(() => host.Rebase(new RebaseRequest("topic")));
        Assert.Contains("merging", ex.Message, StringComparison.Ordinal);
    }

    // --------------------------------------------------- interactive rebase

    [Fact]
    public void Rebase_todo_capture_leaves_no_rebase_state()
    {
        using TempRepo repo = new();
        repo.Conflict("topic");
        repo.Write("second.txt", "second\n");
        repo.StageAndCommit("topic-second");
        GitHost host = Host(repo);
        string headBefore = repo.HeadId();

        RebaseTodoDto todo = host.CaptureRebaseTodo(new RebaseTodoRequest("main"));

        Assert.Equal(["topic-change", "topic-second"], todo.Lines.Select(l => l.Subject ?? "").ToArray());
        Assert.All(todo.Lines, l => Assert.Equal("pick", l.Action));
        Assert.All(todo.Lines, l => Assert.False(string.IsNullOrWhiteSpace(l.Sha)));
        Assert.Equal("topic", todo.HeadName);
        Assert.Equal(repo.Output("rev-parse", "main"), todo.Onto);

        // Capturing must not start anything: no rebase state, HEAD untouched.
        Assert.Equal("none", host.GetStatus().State);
        Assert.Equal(headBefore, repo.HeadId());
        Assert.False(Directory.Exists(Path.Combine(repo.Dir, ".git", "rebase-merge")));
        Assert.False(Directory.Exists(Path.Combine(repo.Dir, ".git", "powergit")));
    }

    [Fact]
    public void Interactive_rebase_squashes_two_commits_with_a_new_message()
    {
        using TempRepo repo = new();
        GitHost host = Host(repo);
        host.Checkout("feature", force: false);
        repo.Write("c.txt", "c\n");
        repo.StageAndCommit("second");
        RebaseTodoDto todo = host.CaptureRebaseTodo(new RebaseTodoRequest("main"));
        Assert.Equal(2, todo.Lines.Length);

        RepoStatusDto after = host.Rebase(new RebaseRequest(
            "main",
            Todo:
            [
                new RebaseTodoEntry("pick", todo.Lines[0].Sha),
                new RebaseTodoEntry("squash", todo.Lines[1].Sha, "folded feature"),
            ]));

        Assert.Equal("none", after.State);
        Assert.Equal(["folded feature", "init"], repo.Subjects());
        Assert.True(File.Exists(Path.Combine(repo.Dir, "b.txt")));
        Assert.True(File.Exists(Path.Combine(repo.Dir, "c.txt")));
        Assert.False(Directory.Exists(Path.Combine(repo.Dir, ".git", "powergit")));
    }

    [Fact]
    public void Interactive_rebase_reorders_commits()
    {
        using TempRepo repo = new();
        GitHost host = Host(repo);
        host.Checkout("feature", force: false);
        repo.Write("c.txt", "c\n");
        repo.StageAndCommit("second");
        RebaseTodoDto todo = host.CaptureRebaseTodo(new RebaseTodoRequest("main"));

        host.Rebase(new RebaseRequest(
            "main",
            Todo:
            [
                new RebaseTodoEntry("pick", todo.Lines[1].Sha),
                new RebaseTodoEntry("pick", todo.Lines[0].Sha),
            ]));

        // Newest first: the originally-first commit now sits on top.
        Assert.Equal(["feature-commit", "second", "init"], repo.Subjects());
    }

    [Fact]
    public void Interactive_rebase_rewords_through_an_exec_amend()
    {
        using TempRepo repo = new();
        GitHost host = Host(repo);
        host.Checkout("feature", force: false);
        RebaseTodoDto todo = host.CaptureRebaseTodo(new RebaseTodoRequest("main"));

        RepoStatusDto after = host.Rebase(new RebaseRequest(
            "main",
            Todo: [new RebaseTodoEntry("reword", todo.Lines[0].Sha, "reworded subject\n\nwith a body")]));

        Assert.Equal("none", after.State);
        Assert.Equal("reworded subject", repo.Subjects()[0]);
        Assert.Contains("with a body", repo.Output("log", "-1", "--format=%b"), StringComparison.Ordinal);
    }

    [Fact]
    public void Interactive_rebase_drops_a_commit()
    {
        using TempRepo repo = new();
        GitHost host = Host(repo);
        host.Checkout("feature", force: false);
        repo.Write("c.txt", "c\n");
        repo.StageAndCommit("second");
        RebaseTodoDto todo = host.CaptureRebaseTodo(new RebaseTodoRequest("main"));

        host.Rebase(new RebaseRequest(
            "main",
            Todo:
            [
                new RebaseTodoEntry("pick", todo.Lines[0].Sha),
                new RebaseTodoEntry("drop", todo.Lines[1].Sha),
            ]));

        Assert.Equal(["feature-commit", "init"], repo.Subjects());
        Assert.False(File.Exists(Path.Combine(repo.Dir, "c.txt")));
    }

    [Fact]
    public void Interactive_rebase_edit_stops_and_continue_resumes()
    {
        using TempRepo repo = new();
        GitHost host = Host(repo);
        host.Checkout("feature", force: false);
        repo.Write("c.txt", "c\n");
        repo.StageAndCommit("second");
        RebaseTodoDto todo = host.CaptureRebaseTodo(new RebaseTodoRequest("main"));

        RepoStatusDto stopped = host.Rebase(new RebaseRequest(
            "main",
            Todo:
            [
                new RebaseTodoEntry("edit", todo.Lines[0].Sha),
                new RebaseTodoEntry("pick", todo.Lines[1].Sha),
            ]));

        Assert.Equal("rebasing", stopped.State);
        Assert.True(stopped.Operation?.Interactive);
        Assert.Equal(1, stopped.Operation?.Step);
        Assert.Equal(2, stopped.Operation?.Total);
        Assert.Null(stopped.Conflicts); // stopped to amend, not on a conflict

        RepoStatusDto done = host.SequencerAction("rebase", "continue");
        Assert.Equal("none", done.State);
        Assert.Equal(["second", "feature-commit", "init"], repo.Subjects());
    }

    [Fact]
    public void Rebase_autosquash_folds_a_fixup_commit()
    {
        using TempRepo repo = new();
        GitHost host = Host(repo);
        host.Checkout("feature", force: false);
        string target = repo.HeadId();
        repo.Write("b.txt", "fixed\n");
        repo.Run("add", "-A");
        repo.Run("commit", "--fixup", target);
        Assert.Equal(3, repo.Subjects().Length);

        RepoStatusDto after = host.Rebase(new RebaseRequest("main", Autosquash: true));

        Assert.Equal("none", after.State);
        Assert.Equal(["feature-commit", "init"], repo.Subjects());
        Assert.Equal("fixed", repo.Read("b.txt").Trim());
    }

    // ------------------------------------------------------------ conflicts

    [Fact]
    public void Untracked_files_still_report_status_U()
    {
        // The unmerged codes are "C"; "??" must keep the historical "U" that
        // the file lists and their colours are keyed on.
        using TempRepo repo = new();
        repo.Conflict();
        GitHost host = Host(repo);
        repo.Write("brand-new.txt", "new\n");
        host.Merge(new MergeRequest("topic"));

        RepoStatusDto status = host.GetStatus();
        Assert.Contains(status.Unstaged, f => f.Path == "brand-new.txt" && f.Status == "U");
        Assert.Contains(status.Unstaged, f => f.Path == "conflict.txt" && f.Status == "C");
        Assert.DoesNotContain(status.Conflicts!, c => c.Path == "brand-new.txt");
    }

    [Fact]
    public void Conflict_kinds_cover_delete_and_add_cases()
    {
        using TempRepo repo = new();
        GitHost host = Host(repo);

        // main deletes a.txt; topic modifies it -> deleted-by-us.
        // Both branches add the same new path with different content -> added-by-both.
        repo.Run("checkout", "-b", "delete-topic");
        repo.Write("a.txt", "topic-edit\n");
        repo.Write("both.txt", "topic\n");
        repo.StageAndCommit("topic-edits");
        repo.Run("checkout", "main");
        repo.Run("rm", "-q", "a.txt");
        repo.Write("both.txt", "main\n");
        repo.StageAndCommit("main-deletes-a");

        RepoStatusDto stopped = host.Merge(new MergeRequest("delete-topic"));

        Assert.Equal("merging", stopped.State);
        ConflictFileDto deleted = Assert.Single(stopped.Conflicts!, c => c.Path == "a.txt");
        Assert.Equal("deleted-by-us", deleted.Kind);
        Assert.True(deleted.HasBase);
        Assert.False(deleted.HasOurs);
        Assert.True(deleted.HasTheirs);
        ConflictFileDto both = Assert.Single(stopped.Conflicts!, c => c.Path == "both.txt");
        Assert.Equal("added-by-both", both.Kind);
        Assert.False(both.HasBase);

        // "delete" resolves the deleted-by-us side the way GE's dialog does.
        RepoStatusDto after = host.ResolveConflicts(["a.txt"], "delete");
        Assert.DoesNotContain(after.Conflicts ?? [], c => c.Path == "a.txt");
        Assert.False(File.Exists(Path.Combine(repo.Dir, "a.txt")));
    }

    [Fact]
    public void Conflict_blob_reads_each_stage()
    {
        using TempRepo repo = new();
        repo.Conflict();
        GitHost host = Host(repo);
        host.Merge(new MergeRequest("topic"));

        Assert.Equal("base", host.GetConflictBlob("conflict.txt", 1).Text.Trim());
        Assert.Equal("main", host.GetConflictBlob("conflict.txt", 2).Text.Trim());
        Assert.Equal("topic", host.GetConflictBlob("conflict.txt", 3).Text.Trim());
        Assert.Throws<InvalidOperationException>(() => host.GetConflictBlob("conflict.txt", 4));
    }

    [Fact]
    public void Resolve_mark_stages_a_hand_edited_file()
    {
        using TempRepo repo = new();
        repo.Conflict();
        GitHost host = Host(repo);
        host.Merge(new MergeRequest("topic"));

        // What a mergetool would leave behind.
        repo.Write("conflict.txt", "merged by hand\n");
        RepoStatusDto after = host.ResolveConflicts(["conflict.txt"], "mark");

        Assert.Null(after.Conflicts);
        Assert.Equal("none", host.MergeContinue(null).State);
        Assert.Equal("merged by hand", repo.Read("conflict.txt").Trim());
    }

    [Fact]
    public void Mergetool_without_a_configured_tool_is_an_error()
    {
        // Never launches a tool: with merge.tool unset the guard fires first.
        using TempRepo repo = new();
        GitHost host = Host(repo);
        InvalidOperationException ex = Assert.Throws<InvalidOperationException>(() => host.OpenMergetool("a.txt"));
        Assert.Contains("No mergetool configured", ex.Message, StringComparison.Ordinal);
    }

    [Fact]
    public void Sequencer_action_rejects_unknown_arguments_and_idle_repos()
    {
        using TempRepo repo = new();
        GitHost host = Host(repo);
        Assert.Throws<InvalidOperationException>(() => host.SequencerAction("merge", "continue"));
        Assert.Throws<InvalidOperationException>(() => host.SequencerAction("rebase", "finish"));
        InvalidOperationException idle = Assert.Throws<InvalidOperationException>(() => host.SequencerAction("rebase", "abort"));
        Assert.Contains("No rebase in progress", idle.Message, StringComparison.Ordinal);
    }

    // --------------------------------------------------- compare / archive

    [Fact]
    public void Compare_lists_changes_between_two_revisions_and_against_the_worktree()
    {
        using TempRepo repo = new();
        GitHost host = Host(repo);

        CommitChangesDto changes = Assert.IsType<CommitChangesDto>(host.Compare("main", "feature", null));
        Assert.Contains(changes.Files, f => f.Path == "b.txt" && f.Status == "A");
        Assert.NotNull(changes.FirstDiff);

        DiffDto one = Assert.IsType<DiffDto>(host.Compare("main", "feature", "b.txt"));
        Assert.Contains("+b", one.Text, StringComparison.Ordinal);

        repo.Write("a.txt", "worktree\n");
        CommitChangesDto vsWorktree = Assert.IsType<CommitChangesDto>(host.Compare("HEAD", null, null));
        Assert.Contains(vsWorktree.Files, f => f.Path == "a.txt" && f.Status == "M");
    }

    [Fact]
    public void Archive_streams_a_zip_of_a_commit()
    {
        using TempRepo repo = new();
        GitHost host = Host(repo);

        using Stream stream = host.OpenArchive("HEAD", "zip", out string fileName, out string contentType);
        using MemoryStream buffer = new();
        stream.CopyTo(buffer);

        Assert.Equal("application/zip", contentType);
        Assert.EndsWith(".zip", fileName, StringComparison.Ordinal);
        Assert.True(buffer.Length > 0);
        Assert.Equal([0x50, 0x4B], buffer.ToArray()[..2]); // "PK"
        using System.IO.Compression.ZipArchive zip = new(new MemoryStream(buffer.ToArray()));
        Assert.Contains(zip.Entries, e => e.FullName.EndsWith("a.txt", StringComparison.Ordinal));
        Assert.Throws<InvalidOperationException>(() => host.OpenArchive("HEAD", "rar", out _, out _));
    }

    // ------------------------------------------------------- todo parsing

    [Fact]
    public void ParseTodo_keeps_non_commit_lines_raw()
    {
        RebaseTodoLine[] lines =
        [
            .. GitHost.ParseTodo(
                "pick 1a2b3c4 first subject\n" +
                "# a comment\n" +
                "s deadbee squashed one\n" +
                "label onto\n" +
                "exec git commit --amend -q\n" +
                "\n"),
        ];

        Assert.Equal(4, lines.Length);
        Assert.Equal(("pick", "1a2b3c4", "first subject"), (lines[0].Action, lines[0].Sha, lines[0].Subject));
        Assert.Equal(("squash", "deadbee", "squashed one"), (lines[1].Action, lines[1].Sha, lines[1].Subject));
        Assert.Equal("label", lines[2].Action);
        Assert.Null(lines[2].Sha);
        Assert.Equal("label onto", lines[2].Raw);
        Assert.Equal("exec", lines[3].Action);
        Assert.Null(lines[3].Sha);
    }
}
