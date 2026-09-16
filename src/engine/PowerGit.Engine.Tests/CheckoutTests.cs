using Xunit;

namespace PowerGit.Engine.Tests;

/// <summary>
///  v0.18.11: Git Extensions FormCheckoutBranch on the engine — the three ways
///  to check a remote branch out, what happens to the local changes, the
///  divergence the dialog quotes, and Create branch / tag's new options.
///  Every test builds its own repository with a bare "origin" so a remote
///  branch really is one (refs/remotes/origin/*).
/// </summary>
public sealed class CheckoutTests
{
    /// <summary>A bare origin with main and feature pushed; the work tree back on main.</summary>
    private static string AddOrigin(TempRepo repo)
    {
        string bare = Directory.CreateTempSubdirectory("powergit-origin-").FullName;
        repo.Run("init", "--bare", "-q", bare);
        repo.Run("remote", "add", "origin", bare);
        repo.Run("push", "-q", "origin", "main", "feature");
        return bare;
    }

    private static void DeleteBare(string bare)
    {
        try
        {
            Directory.Delete(bare, recursive: true);
        }
        catch
        {
            // best effort
        }
    }

    [Fact]
    public void Track_creates_a_local_branch_on_the_remote_and_tracks_it()
    {
        using TempRepo repo = new();
        string bare = AddOrigin(repo);
        try
        {
            repo.Run("branch", "-D", "feature");
            GitHost host = new();
            host.Open(repo.Dir);

            RepoStatusDto after = host.Checkout(new CheckoutRequest("origin/feature", As: "track", Name: "feature", LocalChanges: "keep"));

            Assert.Equal("feature", after.Branch);
            Assert.Equal("origin/feature", after.Upstream);
            Assert.Equal(repo.Output("rev-parse", "origin/feature"), repo.HeadId());
        }
        finally
        {
            DeleteBare(bare);
        }
    }

    [Fact]
    public void Reset_moves_the_existing_local_branch_onto_the_remote()
    {
        using TempRepo repo = new();
        string bare = AddOrigin(repo);
        try
        {
            // The local feature gains a commit origin/feature does not have.
            repo.Run("checkout", "-q", "feature");
            repo.Write("local-only.txt", "x\n");
            repo.StageAndCommit("local-only");
            string localOnly = repo.HeadId();
            repo.Run("checkout", "-q", "main");
            GitHost host = new();
            host.Open(repo.Dir);

            DivergenceDto before = host.Divergence("feature", "origin/feature");
            Assert.Equal(1, before.Ahead);
            Assert.Equal(0, before.Behind);

            RepoStatusDto after = host.Checkout(new CheckoutRequest("origin/feature", As: "reset", Name: "feature", LocalChanges: "keep"));

            Assert.Equal("feature", after.Branch);
            Assert.Equal(repo.Output("rev-parse", "origin/feature"), repo.HeadId());
            Assert.NotEqual(localOnly, repo.HeadId());
            Assert.Equal("0\t0", repo.Output("rev-list", "--left-right", "--count", "feature...origin/feature"));
        }
        finally
        {
            DeleteBare(bare);
        }
    }

    [Fact]
    public void Detached_checks_the_commit_out_without_a_branch()
    {
        using TempRepo repo = new();
        string bare = AddOrigin(repo);
        try
        {
            GitHost host = new();
            host.Open(repo.Dir);

            RepoStatusDto after = host.Checkout(new CheckoutRequest("origin/feature", As: "detached", LocalChanges: "keep"));

            Assert.Equal("HEAD", repo.Output("rev-parse", "--abbrev-ref", "HEAD"));
            Assert.Equal(repo.Output("rev-parse", "origin/feature"), repo.HeadId());
            Assert.Equal("HEAD", after.Branch);
        }
        finally
        {
            DeleteBare(bare);
        }
    }

    [Fact]
    public void Stash_sets_the_changes_aside_and_restores_them_after()
    {
        using TempRepo repo = new();
        GitHost host = new();
        host.Open(repo.Dir);
        // feature changes b.txt (adds it); a.txt exists on both sides — a
        // dirty a.txt would carry over with "keep", so stash is proven by
        // the stash list staying empty and the change surviving the switch.
        File.WriteAllText(Path.Combine(repo.Dir, "a.txt"), "dirty\n");

        RepoStatusDto after = host.Checkout(new CheckoutRequest("feature", LocalChanges: "stash"));

        Assert.Equal("feature", after.Branch);
        // Trimmed: core.autocrlf on the dev box rewrites the line ending on checkout.
        Assert.Equal("dirty", repo.Read("a.txt").Trim());
        Assert.Equal("", repo.Output("stash", "list"));
        Assert.Equal(1, after.UnstagedCount);
    }

    [Fact]
    public void Stash_pop_conflict_is_reported_and_the_stash_kept()
    {
        using TempRepo repo = new();
        // feature has a.txt = "feature-edit"; the work tree on main edits a.txt too.
        repo.Run("checkout", "-q", "feature");
        repo.Write("a.txt", "feature-edit\n");
        repo.StageAndCommit("feature-edit");
        repo.Run("checkout", "-q", "main");
        GitHost host = new();
        host.Open(repo.Dir);
        repo.Write("a.txt", "main-dirty\n");

        InvalidOperationException ex = Assert.Throws<InvalidOperationException>(
            () => host.Checkout(new CheckoutRequest("feature", LocalChanges: "stash")));

        Assert.Contains("conflicts", ex.Message, StringComparison.Ordinal);
        Assert.Equal("feature", repo.Output("rev-parse", "--abbrev-ref", "HEAD"));
        Assert.Contains("stash@{0}", repo.Output("stash", "list"), StringComparison.Ordinal);
    }

    [Fact]
    public void Discard_forces_the_checkout_over_a_dirty_tree()
    {
        using TempRepo repo = new();
        GitHost host = new();
        host.Open(repo.Dir);
        File.WriteAllText(Path.Combine(repo.Dir, "a.txt"), "dirty\n");

        RepoStatusDto after = host.Checkout(new CheckoutRequest("feature", LocalChanges: "discard"));

        Assert.Equal("feature", after.Branch);
        Assert.Equal("a", repo.Read("a.txt").Trim());
        Assert.Equal(0, after.UnstagedCount);
    }

    [Fact]
    public void Keep_carries_a_change_that_does_not_conflict_and_refuses_one_that_does()
    {
        using TempRepo repo = new();
        repo.Run("checkout", "-q", "feature");
        repo.Write("a.txt", "feature-edit\n");
        repo.StageAndCommit("feature-edit");
        repo.Run("checkout", "-q", "main");
        GitHost host = new();
        host.Open(repo.Dir);

        // c.txt is on neither branch: git carries it over.
        repo.Write("c.txt", "new\n");
        RepoStatusDto after = host.Checkout(new CheckoutRequest("feature", LocalChanges: "keep"));
        Assert.Equal("feature", after.Branch);
        Assert.True(File.Exists(Path.Combine(repo.Dir, "c.txt")));

        // a.txt differs between the branches: git refuses, and says so.
        repo.Write("a.txt", "dirty\n");
        InvalidOperationException ex = Assert.Throws<InvalidOperationException>(
            () => host.Checkout(new CheckoutRequest("main", LocalChanges: "keep")));
        Assert.Contains("a.txt", ex.Message, StringComparison.Ordinal);
    }

    [Fact]
    public void Legacy_shape_keeps_the_dirty_guard_and_force()
    {
        using TempRepo repo = new();
        GitHost host = new();
        host.Open(repo.Dir);
        File.WriteAllText(Path.Combine(repo.Dir, "a.txt"), "dirty\n");

        Assert.Throws<InvalidOperationException>(() => host.Checkout(new CheckoutRequest("feature")));
        Assert.Equal("feature", host.Checkout(new CheckoutRequest("feature", Force: true)).Branch);
    }

    [Fact]
    public void Divergence_counts_both_sides_and_refuses_an_unknown_ref()
    {
        using TempRepo repo = new();
        // main: init; feature: init + feature-commit. main gains one more.
        repo.Write("m.txt", "m\n");
        repo.StageAndCommit("main-only");
        GitHost host = new();
        host.Open(repo.Dir);

        DivergenceDto d = host.Divergence("feature", "main");
        Assert.Equal(1, d.Ahead);
        Assert.Equal(1, d.Behind);

        // The delete question: is feature merged into main? Ahead 0 says yes.
        repo.Run("merge", "-q", "--no-edit", "feature");
        Assert.Equal(0, host.Divergence("feature", "main").Ahead);

        Assert.Throws<InvalidOperationException>(() => host.Divergence("feature", "no-such-branch"));
    }

    [Fact]
    public void CreateBranch_can_check_out_and_can_start_an_orphan()
    {
        using TempRepo repo = new();
        GitHost host = new();
        host.Open(repo.Dir);
        string mainTip = repo.HeadId();

        host.CreateBranch("wt/v18-x", mainTip, checkout: true);
        Assert.Equal("wt/v18-x", repo.Output("rev-parse", "--abbrev-ref", "HEAD"));
        Assert.Equal(mainTip, repo.HeadId());

        host.CreateBranch("fresh", null, checkout: false, orphan: true);
        // An unborn branch: rev-parse cannot abbreviate HEAD yet, symbolic-ref names it.
        Assert.Equal("refs/heads/fresh", repo.Output("symbolic-ref", "HEAD"));
        // No history yet: HEAD does not resolve until the first commit.
        Assert.Equal("", repo.Output("rev-parse", "-q", "--verify", "HEAD"));
        // The start point's tree stays in the index (GE keeps it unless "clear working directory").
        Assert.Contains("a.txt", repo.Output("ls-files"), StringComparison.Ordinal);
    }

    [Fact]
    public void CreateTag_with_a_message_is_annotated()
    {
        using TempRepo repo = new();
        GitHost host = new();
        host.Open(repo.Dir);

        host.CreateTag("v1", null, "the first one");
        Assert.Equal("tag", repo.Output("cat-file", "-t", "v1"));
        Assert.Contains("the first one", repo.Output("tag", "-n1", "-l", "v1"), StringComparison.Ordinal);

        host.CreateTag("light", null, null);
        Assert.Equal("commit", repo.Output("cat-file", "-t", "light"));
    }
}
