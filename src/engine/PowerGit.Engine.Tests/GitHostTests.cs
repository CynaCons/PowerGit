using Xunit;

namespace PowerGit.Engine.Tests;

public sealed class GitHostTests
{
    private static string RepoRoot()
    {
        string dir = AppContext.BaseDirectory;
        DirectoryInfo? cursor = new(dir);
        while (cursor is not null)
        {
            if (Directory.Exists(Path.Combine(cursor.FullName, ".git")))
            {
                return cursor.FullName;
            }

            cursor = cursor.Parent;
        }

        throw new DirectoryNotFoundException("Could not locate the PowerGit work tree from the test host.");
    }

    [Fact]
    public void Version_returns_git_version()
    {
        GitHost host = new();
        GitVersion version = host.Version();
        Assert.Contains("git version", version.Raw, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void Open_this_repo_sets_current()
    {
        GitHost host = new();
        RepoInfo info = host.Open(RepoRoot());
        Assert.Equal("PowerGit", info.Name);
        Assert.False(string.IsNullOrWhiteSpace(info.Branch));
        Assert.Equal(info, host.Current);
        Assert.True(Directory.Exists(Path.Combine(info.Root, ".git")) || File.Exists(Path.Combine(info.Root, ".git")));
    }

    [Fact]
    public void Open_non_repo_throws()
    {
        GitHost host = new();
        string temp = Directory.CreateTempSubdirectory("powergit-not-a-repo-").FullName;
        try
        {
            InvalidOperationException ex = Assert.Throws<InvalidOperationException>(() => host.Open(temp));
            Assert.Contains("Not a git work tree", ex.Message, StringComparison.Ordinal);
        }
        finally
        {
            Directory.Delete(temp, recursive: true);
        }
    }

    [Fact]
    public void Open_missing_path_throws()
    {
        GitHost host = new();
        Assert.Throws<DirectoryNotFoundException>(() => host.Open(Path.Combine(Path.GetTempPath(), Guid.NewGuid().ToString("N"))));
    }

    [Fact]
    public void Checkout_moves_head_and_guards_dirty_tree()
    {
        using TempRepo repo = new();
        GitHost host = new();
        host.Open(repo.Dir);

        RepoStatusDto onFeature = host.Checkout("feature", force: false);
        Assert.Equal("feature", onFeature.Branch);

        File.WriteAllText(Path.Combine(repo.Dir, "a.txt"), "dirty\n");
        Assert.Throws<InvalidOperationException>(() => host.Checkout("main", force: false));

        RepoStatusDto forced = host.Checkout("main", force: true);
        Assert.Equal("main", forced.Branch);
    }

    [Fact]
    public void ResetTo_moves_branch()
    {
        using TempRepo repo = new();
        GitHost host = new();
        host.Open(repo.Dir);
        host.Checkout("feature", force: false);

        RepoStatusDto after = host.ResetTo("HEAD~1", "mixed");
        Assert.Equal("feature", after.Branch);
        Assert.Equal("init", host.ListRevisions(10)[0].Subject);
    }

    [Fact]
    public void Rebase_replays_branch_onto_target()
    {
        using TempRepo repo = new();
        GitHost host = new();
        host.Open(repo.Dir);
        host.Checkout("feature", force: false);
        host.Checkout("main", force: false);
        File.WriteAllText(Path.Combine(repo.Dir, "c.txt"), "c\n");
        repo.StageAndCommit("main-advance");
        host.Checkout("feature", force: false);

        host.Rebase("main");

        System.Collections.Generic.IReadOnlyList<RevisionDto> log = host.ListRevisions(10);
        Assert.Contains(log, r => r.Subject == "main-advance");
        Assert.Equal(log[0].Parents[0], log.First(r => r.Subject == "main-advance").Id);
    }
    [Fact]
    public void Stash_lifecycle_works()
    {
        using TempRepo repo = new();
        GitHost host = new();
        host.Open(repo.Dir);
        Assert.Empty(host.ListStashes());

        File.WriteAllText(Path.Combine(repo.Dir, "a.txt"), "changed\n");
        host.StashChanges("wip change", keepIndex: false, includeUntracked: true);
        Assert.Single(host.ListStashes());
        Assert.False(repo.IsDirtyPublic());

        System.Collections.Generic.IReadOnlyList<RevisionDto> log = host.ListRevisions(50);
        Assert.Contains(log, r => r.Subject == "On main: wip change");

        host.ApplyStash("stash@{0}", pop: true);
        Assert.True(repo.IsDirtyPublic());
        Assert.Equal("changed", File.ReadAllText(Path.Combine(repo.Dir, "a.txt")).Trim());
        Assert.Empty(host.ListStashes());

        File.WriteAllText(Path.Combine(repo.Dir, "a.txt"), "again\n");
        host.StashChanges(null, false, false);
        Assert.Single(host.ListStashes());
        host.DropStash("stash@{0}");
        Assert.Empty(host.ListStashes());
    }

    [Fact]
    public void Stash_requires_dirty_tree()
    {
        using TempRepo repo = new();
        GitHost host = new();
        host.Open(repo.Dir);
        Assert.Throws<InvalidOperationException>(() => host.StashChanges(null, false, false));
    }
}

internal sealed partial class TempRepo : IDisposable
{
    public bool IsDirtyPublic()
    {
        System.Diagnostics.ProcessStartInfo psi = new("git", "status --porcelain=v1")
        {
            WorkingDirectory = Dir,
            RedirectStandardOutput = true,
        };
        using System.Diagnostics.Process? p = System.Diagnostics.Process.Start(psi);
        p?.WaitForExit(30_000);
        return !string.IsNullOrWhiteSpace(p?.StandardOutput.ReadToEnd());
    }

    public TempRepo()
    {
        Dir = Directory.CreateTempSubdirectory("powergit-ops-").FullName;
        Git("init", "-b", "main");
        Git("config", "user.email", "test@example.com");
        Git("config", "user.name", "test");
        File.WriteAllText(Path.Combine(Dir, "a.txt"), "a\n");
        StageAndCommit("init");
        Git("checkout", "-b", "feature");
        File.WriteAllText(Path.Combine(Dir, "b.txt"), "b\n");
        StageAndCommit("feature-commit");
        Git("checkout", "main");
    }

    public string Dir { get; }

    public void StageAndCommit(string message)
    {
        Git("add", "-A");
        Git("commit", "-m", message);
    }

    private void Git(params string[] args)
    {
        System.Diagnostics.ProcessStartInfo psi = new("git", args)
        {
            WorkingDirectory = Dir,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
        };
        using System.Diagnostics.Process? p = System.Diagnostics.Process.Start(psi);
        p?.WaitForExit(30_000);
        if (p is null || p.ExitCode != 0)
        {
            throw new InvalidOperationException($"git {string.Join(' ', args)} failed: {p?.StandardError.ReadToEnd()}");
        }
    }

    public void Dispose()
    {
        try
        {
            Directory.Delete(Dir, recursive: true);
        }
        catch
        {
            // best effort
        }
    }
}
