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
        string root = RepoRoot();
        RepoInfo info = host.Open(root);
        string expected = root.TrimEnd(Path.DirectorySeparatorChar, '/').Split('/', '\\')[^1];
        Assert.Equal(expected, info.Name, StringComparer.OrdinalIgnoreCase);
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
    public void CherryPick_applies_commit_onto_current_branch()
    {
        using TempRepo repo = new();
        GitHost host = new();
        host.Open(repo.Dir);

        host.Checkout("feature", force: false);
        string featureCommitId = repo.HeadId();
        host.Checkout("main", force: false);

        RepoStatusDto after = host.CherryPick(featureCommitId);
        Assert.Equal("main", after.Branch);
        Assert.Equal("feature-commit", host.GetCommit(repo.HeadId()).Subject);
        Assert.True(File.Exists(Path.Combine(repo.Dir, "b.txt")));
    }

    [Fact]
    public void CherryPick_conflict_aborts_and_leaves_a_clean_tree()
    {
        using TempRepo repo = new();
        GitHost host = new();
        host.Open(repo.Dir);

        host.Checkout("feature", force: false);
        File.WriteAllText(Path.Combine(repo.Dir, "a.txt"), "feature-edit\n");
        repo.StageAndCommit("feature-conflict");
        string conflictCommitId = repo.HeadId();

        host.Checkout("main", force: false);
        File.WriteAllText(Path.Combine(repo.Dir, "a.txt"), "main-edit\n");
        repo.StageAndCommit("main-conflict");

        InvalidOperationException ex = Assert.Throws<InvalidOperationException>(() => host.CherryPick(conflictCommitId));
        Assert.Contains("Cherry-pick", ex.Message, StringComparison.Ordinal);
        Assert.False(File.Exists(Path.Combine(repo.Dir, ".git", "CHERRY_PICK_HEAD")));
        Assert.False(repo.IsDirtyPublic());
    }

    [Fact]
    public void CherryPick_requires_clean_tree()
    {
        using TempRepo repo = new();
        GitHost host = new();
        host.Open(repo.Dir);
        string featureCommitId = host.ListRevisions(10).First(r => r.Subject == "feature-commit").Id;

        File.WriteAllText(Path.Combine(repo.Dir, "a.txt"), "dirty\n");
        Assert.Throws<InvalidOperationException>(() => host.CherryPick(featureCommitId));
    }

    [Fact]
    public void Revert_creates_an_inverse_commit()
    {
        using TempRepo repo = new();
        GitHost host = new();
        host.Open(repo.Dir);

        File.WriteAllText(Path.Combine(repo.Dir, "a.txt"), "changed\n");
        repo.StageAndCommit("change-a");
        string changeId = repo.HeadId();

        RepoStatusDto after = host.Revert(changeId);
        Assert.Equal("main", after.Branch);
        Assert.StartsWith("Revert \"change-a\"", host.GetCommit(repo.HeadId()).Subject, StringComparison.Ordinal);
        Assert.Equal("a", File.ReadAllText(Path.Combine(repo.Dir, "a.txt")).Trim());
    }

    [Fact]
    public void Revert_conflict_aborts_and_leaves_a_clean_tree()
    {
        using TempRepo repo = new();
        GitHost host = new();
        host.Open(repo.Dir);

        File.WriteAllText(Path.Combine(repo.Dir, "a.txt"), "v2\n");
        repo.StageAndCommit("a-v2");
        string v2Id = repo.HeadId();

        File.WriteAllText(Path.Combine(repo.Dir, "a.txt"), "v3\n");
        repo.StageAndCommit("a-v3");

        InvalidOperationException ex = Assert.Throws<InvalidOperationException>(() => host.Revert(v2Id));
        Assert.Contains("Revert", ex.Message, StringComparison.Ordinal);
        Assert.False(File.Exists(Path.Combine(repo.Dir, ".git", "REVERT_HEAD")));
        Assert.False(repo.IsDirtyPublic());
    }

    [Fact]
    public void OpenDifftool_requires_commit_and_path()
    {
        // Does not exercise the actual process launch: git difftool can spawn
        // a real GUI editor, which must never happen from an automated test.
        using TempRepo repo = new();
        GitHost host = new();
        host.Open(repo.Dir);

        Assert.Throws<InvalidOperationException>(() => host.OpenDifftool("", "a.txt"));
        Assert.Throws<InvalidOperationException>(() => host.OpenDifftool("HEAD", ""));
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
    public void Push_then_pull_roundtrip_via_bare_remote()
    {
        string bare = Directory.CreateTempSubdirectory("powergit-bare-").FullName;
        try
        {
            using TempRepo repo = new();
            RunGit(bare, "init", "--bare", "-b", "main");
            RunGit(repo.Dir, "remote", "add", "origin", bare);

            GitHost host = new();
            host.Open(repo.Dir);
            host.Push(); // no upstream yet -> -u origin HEAD

            string clone = Path.Combine(Path.GetTempPath(), "powergit-clone-" + Guid.NewGuid().ToString("N"));
            RunGit(Path.GetTempPath(), "clone", bare, clone);
            RunGit(clone, "config", "user.email", "test@example.com");
            RunGit(clone, "config", "user.name", "test");
            try
            {
                GitHost cloner = new();
                cloner.Open(clone);

                File.WriteAllText(Path.Combine(repo.Dir, "a.txt"), "origin-edit\n");
                repo.StageAndCommit("origin-change");
                host.Push();

                cloner.Pull(); // fast-forward
                Assert.Equal("origin-change", cloner.ListRevisions(10)[0].Subject);

                // diverge: both sides edit the same file
                File.WriteAllText(Path.Combine(clone, "a.txt"), "clone-edit\n");
                cloner.Stage(["a.txt"], false);
                cloner.Commit("clone-change");

                File.WriteAllText(Path.Combine(repo.Dir, "a.txt"), "second-origin-edit\n");
                repo.StageAndCommit("second-origin-change");
                host.Push();

                Assert.Throws<InvalidOperationException>(() => cloner.Push()); // rejected, non-fast-forward
                Assert.Throws<InvalidOperationException>(() => cloner.Pull()); // ff-only impossible
            }
            finally
            {
                ForceDelete(clone);
            }
        }
        finally
        {
            ForceDelete(bare);
        }
    }

    private static void ForceDelete(string path)
    {
        foreach (string f in Directory.EnumerateFiles(path, "*", SearchOption.AllDirectories))
        {
            File.SetAttributes(f, FileAttributes.Normal);
        }

        Directory.Delete(path, recursive: true);
    }

    private static void RunGit(string workdir, params string[] args)
    {
        System.Diagnostics.ProcessStartInfo psi = new("git", args)
        {
            WorkingDirectory = workdir,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
        };
        using System.Diagnostics.Process? p = System.Diagnostics.Process.Start(psi);
        p?.WaitForExit(60_000);
        if (p is null || p.ExitCode != 0)
        {
            throw new InvalidOperationException($"git {string.Join(' ', args)} failed: {p?.StandardError.ReadToEnd()}");
        }
    }

    [Fact]
    public void Stash_requires_dirty_tree()
    {
        using TempRepo repo = new();
        GitHost host = new();
        host.Open(repo.Dir);
        Assert.Throws<InvalidOperationException>(() => host.StashChanges(null, false, false));
    }

    [Fact]
    public async Task ChangeVersion_bumps_when_a_ref_moves()
    {
        using TempRepo repo = new();
        GitHost host = new();
        host.Open(repo.Dir);
        long before = host.ChangeVersion;

        File.WriteAllText(Path.Combine(repo.Dir, "watched.txt"), "x\n");
        repo.StageAndCommit("watcher-bump");

        // FileSystemWatcher events are async; give it a few seconds.
        for (int i = 0; i < 50 && host.ChangeVersion == before; i++)
        {
            await Task.Delay(100);
        }

        Assert.True(host.ChangeVersion > before, "commit did not bump ChangeVersion");
    }

    [Fact]
    public void CreateBranch_and_CreateTag_at_commit()
    {
        using TempRepo repo = new();
        GitHost host = new();
        host.Open(repo.Dir);

        host.CreateBranch("created-branch", "HEAD");
        host.CreateTag("v9.9", null); // defaults to HEAD
        Assert.Throws<InvalidOperationException>(() => host.CreateBranch("feature", null)); // already exists

        RefTreeDto refs = host.GetRefs();
        Assert.Contains(refs.Branches, b => b.Name == "created-branch");
        Assert.Contains(refs.Tags, t => t.Name == "v9.9");

        // Branch points at the requested commit, not wherever HEAD is now.
        // (Before v0.12.2 this asserted against ListRevisions(1)[0], the newest
        //  row across all branches, which is "feature-commit" no matter what is
        //  checked out — so it passed without ever testing the claim.)
        string target = host.ListRevisions(10).First(r => r.Subject == "feature-commit").Id;
        string headBefore = repo.HeadId();
        Assert.NotEqual(target, headBefore);

        host.CreateBranch("at-feature", target);
        host.Checkout("at-feature", force: true);
        Assert.Equal(target, repo.HeadId());

        // A branch created at "HEAD" tracks where HEAD was, not the newest commit.
        host.Checkout("created-branch", force: true);
        Assert.Equal(headBefore, repo.HeadId());
    }

    [Fact]
    public void Commit_amend_replaces_last_commit()
    {
        using TempRepo repo = new();
        GitHost host = new();
        host.Open(repo.Dir);

        File.WriteAllText(Path.Combine(repo.Dir, "x.txt"), "x\n");
        repo.StageAndCommit("base");
        System.Collections.Generic.IReadOnlyList<RevisionDto> log = host.ListRevisions(10);
        string replacedId = log.First(r => r.Subject == "base").Id;
        string grandparentId = log.First(r => r.Subject == "init").Id;

        host.Commit("amended subject", amend: true);

        RevisionDto amended = host.ListRevisions(10).First(r => r.Subject == "amended subject");
        Assert.NotEqual(replacedId, amended.Id);
        Assert.Equal(grandparentId, amended.Parents[0]);
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

    /// <summary>
    ///  The tip of the checked-out branch. Tests must not assume
    ///  <c>ListRevisions(1)[0]</c> is HEAD: since v0.12.0 the revision stream is
    ///  date-ordered across every branch (Git Extensions parity), so the newest
    ///  row can belong to another branch — and does whenever commits made in the
    ///  same second tie on commit date.
    /// </summary>
    public string HeadId()
    {
        System.Diagnostics.ProcessStartInfo psi = new("git", new[] { "rev-parse", "HEAD" })
        {
            WorkingDirectory = Dir,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
        };
        using System.Diagnostics.Process? p = System.Diagnostics.Process.Start(psi);
        string id = p?.StandardOutput.ReadToEnd().Trim() ?? "";
        p?.WaitForExit(30_000);
        return id;
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
