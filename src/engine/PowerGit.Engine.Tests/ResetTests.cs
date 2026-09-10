using Xunit;

namespace PowerGit.Engine.Tests;

/// <summary>
/// v0.15.5. Owner: "when I'm in the diff view, I should be able to right click
/// on a file and hit reset… if it's in the diff of the working directory, it
/// should just reset the staged or unstaged changes, basically resetting what
/// the user is looking at."
///
/// The Browse panel shows three different diffs — worktree vs index, index vs
/// HEAD, and a commit vs its parent — and "reset" means undoing exactly the
/// one on screen. Every test below asserts on the working tree and the index,
/// never on a return value alone.
/// </summary>
public sealed class ResetTests
{
    private static (GitHost Host, TempRepo Repo) Open()
    {
        TempRepo repo = new();
        GitHost host = new();
        host.Open(repo.Dir);
        return (host, repo);
    }

    /// <summary>Content of `path` as the index holds it, or "" when it has no entry.</summary>
    private static string Staged(TempRepo repo, string path) => repo.Output("show", $":{path}");

    [Fact]
    public void Worktree_scope_restores_from_the_index_and_keeps_staged_work()
    {
        (GitHost host, TempRepo repo) = Open();
        using (repo)
        {
            // One file, two rounds of edits: the first staged, the second not.
            // The Working directory row shows only the second.
            repo.Write("a.txt", "a\nstaged\n");
            repo.Run("add", "a.txt");
            repo.Write("a.txt", "a\nstaged\nunstaged\n");

            host.ResetFiles(["a.txt"], GitHost.ResetScope.Worktree);

            Assert.Equal("a\nstaged\n", repo.Read("a.txt").Replace("\r\n", "\n"));
            Assert.Equal("a\nstaged", Staged(repo, "a.txt").Replace("\r\n", "\n"));
        }
    }

    [Fact]
    public void Index_scope_unstages_and_leaves_the_file_on_disk()
    {
        (GitHost host, TempRepo repo) = Open();
        using (repo)
        {
            repo.Write("a.txt", "a\nstaged\n");
            repo.Run("add", "a.txt");
            repo.Write("a.txt", "a\nstaged\nunstaged\n");

            host.ResetFiles(["a.txt"], GitHost.ResetScope.Index);

            // The index is back at HEAD; the file on disk keeps every edit.
            Assert.Equal("a", Staged(repo, "a.txt").Replace("\r\n", "\n"));
            Assert.Equal("a\nstaged\nunstaged\n", repo.Read("a.txt").Replace("\r\n", "\n"));
        }
    }

    [Fact]
    public void Head_scope_still_discards_both_sides()
    {
        (GitHost host, TempRepo repo) = Open();
        using (repo)
        {
            repo.Write("a.txt", "a\nstaged\n");
            repo.Run("add", "a.txt");
            repo.Write("a.txt", "a\nstaged\nunstaged\n");

            host.ResetFiles(["a.txt"]);

            Assert.Equal("a\n", repo.Read("a.txt").Replace("\r\n", "\n"));
            Assert.Equal("a", Staged(repo, "a.txt").Replace("\r\n", "\n"));
        }
    }

    [Fact]
    public void An_untracked_file_is_deleted_by_the_two_scopes_that_own_the_disk()
    {
        (GitHost host, TempRepo repo) = Open();
        using (repo)
        {
            repo.Write("new-worktree.txt", "x\n");
            repo.Write("new-index.txt", "y\n");
            repo.Write("new-head.txt", "z\n");

            host.ResetFiles(["new-worktree.txt"], GitHost.ResetScope.Worktree);
            host.ResetFiles(["new-index.txt"], GitHost.ResetScope.Index);
            host.ResetFiles(["new-head.txt"]);

            // Owner's choice for new files: git holds no copy, so the only
            // thing a reset of the working tree can mean is deleting them.
            Assert.False(File.Exists(Path.Combine(repo.Dir, "new-worktree.txt")));
            Assert.False(File.Exists(Path.Combine(repo.Dir, "new-head.txt")));
            // Not the index scope, though: unstaging never touches the disk,
            // and there is nothing staged here to unstage. (The Index row
            // cannot list an untracked path anyway — this is the contract
            // holding at the boundary, not a reachable gesture.)
            Assert.True(File.Exists(Path.Combine(repo.Dir, "new-index.txt")));
        }
    }

    [Fact]
    public void Index_scope_on_a_staged_add_leaves_the_file_untracked()
    {
        (GitHost host, TempRepo repo) = Open();
        using (repo)
        {
            repo.Write("added.txt", "new\n");
            repo.Run("add", "added.txt");

            host.ResetFiles(["added.txt"], GitHost.ResetScope.Index);

            // Unstaging an add cannot delete the file: HEAD never had it, so
            // the content only exists on disk.
            Assert.True(File.Exists(Path.Combine(repo.Dir, "added.txt")));
            Assert.Equal("new\n", repo.Read("added.txt").Replace("\r\n", "\n"));
            Assert.Contains("?? added.txt", repo.Output("status", "--porcelain=v1"), StringComparison.Ordinal);
        }
    }

    [Fact]
    public void Worktree_scope_on_a_staged_add_restores_the_staged_content()
    {
        (GitHost host, TempRepo repo) = Open();
        using (repo)
        {
            repo.Write("added.txt", "new\n");
            repo.Run("add", "added.txt");
            repo.Write("added.txt", "new\nand more\n");

            host.ResetFiles(["added.txt"], GitHost.ResetScope.Worktree);

            Assert.Equal("new\n", repo.Read("added.txt").Replace("\r\n", "\n"));
            Assert.Equal("new", Staged(repo, "added.txt").Replace("\r\n", "\n"));
        }
    }

    [Fact]
    public void A_staged_deletion_is_not_mistaken_for_an_untracked_file()
    {
        // The trap: `git rm --cached` leaves no index entry, so a check for
        // "is this path in the index" says no — while HEAD still has the file
        // and a reset to HEAD must bring it back, not delete it.
        (GitHost host, TempRepo repo) = Open();
        using (repo)
        {
            repo.Run("rm", "--cached", "-q", "a.txt");

            host.ResetFiles(["a.txt"]);

            Assert.True(File.Exists(Path.Combine(repo.Dir, "a.txt")), "reset to HEAD must restore a staged deletion");
            Assert.Equal("a", Staged(repo, "a.txt").Replace("\r\n", "\n"));
        }
    }

    [Fact]
    public void Index_scope_puts_a_staged_deletion_back_in_the_index()
    {
        (GitHost host, TempRepo repo) = Open();
        using (repo)
        {
            repo.Run("rm", "-q", "a.txt"); // staged delete, gone from disk too

            host.ResetFiles(["a.txt"], GitHost.ResetScope.Index);

            // Unstaging the deletion restores the index entry from HEAD; the
            // working tree keeps whatever it had, which here is nothing — the
            // file now shows as an unstaged deletion.
            Assert.Equal("a", Staged(repo, "a.txt").Replace("\r\n", "\n"));
            Assert.Equal("a.txt", repo.Output("diff", "--name-only"));
            Assert.Equal("", repo.Output("diff", "--cached", "--name-only"));
        }
    }

    [Fact]
    public void Worktree_scope_makes_a_staged_deletion_true_on_disk()
    {
        (GitHost host, TempRepo repo) = Open();
        using (repo)
        {
            // `rm --cached` stages the deletion but leaves the file, so the
            // Working directory row shows it as an untracked file.
            repo.Run("rm", "--cached", "-q", "a.txt");
            Assert.True(File.Exists(Path.Combine(repo.Dir, "a.txt")));

            host.ResetFiles(["a.txt"], GitHost.ResetScope.Worktree);

            // Matching the index means the file goes: the index says it is
            // not there. HEAD is untouched, so nothing is actually lost.
            Assert.False(File.Exists(Path.Combine(repo.Dir, "a.txt")));
            Assert.Equal("a", repo.Output("show", "HEAD:a.txt").Replace("\r\n", "\n"));
        }
    }

    [Fact]
    public void An_unknown_scope_is_rejected()
    {
        Assert.Throws<InvalidOperationException>(() => GitHost.ParseResetScope("everything"));
        Assert.Equal(GitHost.ResetScope.Head, GitHost.ParseResetScope(null));
        Assert.Equal(GitHost.ResetScope.Head, GitHost.ParseResetScope("head"));
        Assert.Equal(GitHost.ResetScope.Worktree, GitHost.ParseResetScope("WorkTree"));
        Assert.Equal(GitHost.ResetScope.Index, GitHost.ParseResetScope(" index "));
    }

    [Fact]
    public void A_reverse_three_way_apply_lands_in_the_working_tree_and_the_index()
    {
        (GitHost host, TempRepo repo) = Open();
        using (repo)
        {
            repo.Write("f.txt", "1\n2\n3\n");
            repo.StageAndCommit("base");
            repo.Write("f.txt", "1x\n2x\n3x\n");
            repo.StageAndCommit("edit");

            // The diff the Browse panel shows for the "edit" commit, undone
            // whole: --index --3way, which is what Git Extensions' FileViewer
            // runs for "reset selected lines" on a revision.
            string patch = host.GetDiff("HEAD", "f.txt").Text;
            host.ApplyPatch(patch, cached: false, reverse: true, index: true, threeWay: true);

            Assert.Equal("1\n2\n3\n", repo.Read("f.txt").Replace("\r\n", "\n"));
            Assert.Equal("1\n2\n3", Staged(repo, "f.txt").Replace("\r\n", "\n"));
            // Undone in both, so nothing is left unstaged for the same file.
            Assert.DoesNotContain(" M f.txt", repo.Output("status", "--porcelain=v1"), StringComparison.Ordinal);
        }
    }

    [Fact]
    public void A_three_way_apply_survives_the_file_having_moved_on()
    {
        (GitHost host, TempRepo repo) = Open();
        using (repo)
        {
            repo.Write("f.txt", "1\n2\n3\n4\n5\n6\n7\n8\n9\n");
            repo.StageAndCommit("base");
            repo.Write("f.txt", "1\n2\n3\n4\nFIVE\n6\n7\n8\n9\n");
            repo.StageAndCommit("edit");
            // An unrelated later edit far from the hunk, committed: plain
            // `git apply --reverse` still finds its context here, but the
            // recorded blobs are what make the 3-way path safe in general.
            repo.Write("f.txt", "ONE\n2\n3\n4\nFIVE\n6\n7\n8\nNINE\n");
            repo.StageAndCommit("later");

            string patch = host.GetDiff("HEAD~1", "f.txt").Text;
            host.ApplyPatch(patch, cached: false, reverse: true, index: true, threeWay: true);

            Assert.Equal("ONE\n2\n3\n4\n5\n6\n7\n8\nNINE\n", repo.Read("f.txt").Replace("\r\n", "\n"));
            Assert.Equal("ONE\n2\n3\n4\n5\n6\n7\n8\nNINE", Staged(repo, "f.txt").Replace("\r\n", "\n"));
        }
    }

    [Fact]
    public void Cached_and_index_together_are_refused()
    {
        (GitHost host, TempRepo repo) = Open();
        using (repo)
        {
            InvalidOperationException error = Assert.Throws<InvalidOperationException>(
                () => host.ApplyPatch("diff --git a/x b/x\n", cached: true, reverse: false, index: true));
            Assert.Contains("mutually exclusive", error.Message, StringComparison.OrdinalIgnoreCase);
        }
    }

    [Fact]
    public void An_oversized_patch_is_refused_before_it_reaches_git()
    {
        (GitHost host, TempRepo repo) = Open();
        using (repo)
        {
            string huge = new('x', GitHost.MaxPatchChars + 1);
            InvalidOperationException error = Assert.Throws<InvalidOperationException>(
                () => host.ApplyPatch(huge, cached: false, reverse: false));
            Assert.Contains("too large", error.Message, StringComparison.OrdinalIgnoreCase);
        }
    }
}
