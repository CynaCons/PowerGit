using Xunit;

namespace PowerGit.Engine.Tests;

public sealed class QueryTests
{
    private static GitHost Opened()
    {
        GitHost host = new();
        RepoInfo? repo = host.TryDiscover(AppContext.BaseDirectory);
        Assert.NotNull(repo);
        return host;
    }

    [Fact]
    public void ListRevisions_includes_head()
    {
        GitHost host = Opened();
        IReadOnlyList<RevisionDto> revs = host.ListRevisions(50);
        Assert.NotEmpty(revs);
        Assert.Contains(revs, r => r.IsHead);
        Assert.False(string.IsNullOrWhiteSpace(revs[0].Id));
        Assert.Equal(40, revs[0].Id.Length);
    }

    [Fact]
    public void ListFiles_and_diff_for_latest_commit()
    {
        GitHost host = Opened();
        IReadOnlyList<RevisionDto> revs = host.ListRevisions(20);
        RevisionDto? withParents = revs.FirstOrDefault(r => r.Parents.Length > 0);
        Assert.NotNull(withParents);
        IReadOnlyList<FileChangeDto> files = host.ListFiles(withParents.Id);
        Assert.NotEmpty(files);
        DiffDto diff = host.GetDiff(withParents.Id, files[0].Path);
        Assert.False(string.IsNullOrWhiteSpace(diff.Text));
        if (!diff.Binary)
        {
            Assert.Contains("diff", diff.Text, StringComparison.OrdinalIgnoreCase);
        }
    }

    [Fact]
    public void GetChanges_matches_ListFiles_plus_GetDiff()
    {
        // v0.13.14: one round trip for the Diff tab. The combined answer must
        // be byte-identical to what /files and /diff would have returned.
        GitHost host = Opened();
        IReadOnlyList<RevisionDto> revs = host.ListRevisions(40);
        int checked_ = 0;
        foreach (RevisionDto rev in revs.Where(r => r.Parents.Length > 0).Take(8))
        {
            CommitChangesDto changes = host.GetChanges(rev.Id);
            IReadOnlyList<FileChangeDto> files = host.ListFiles(rev.Id);
            Assert.Equal(files, changes.Files);
            if (files.Count == 0)
            {
                Assert.Null(changes.FirstDiff);
                continue;
            }

            DiffDto expected = host.GetDiff(rev.Id, files[0].Path);
            Assert.Equal(expected, changes.FirstDiff);
            checked_++;
        }

        Assert.True(checked_ > 0, "no commit with changes in the first 40 revisions");
    }

    [Fact]
    public void Merge_commit_lists_files_and_first_parent_diff()
    {
        // Owner (v0.14.0): "merge commits are not showing a diff in the diff
        // view". diff-tree/show print nothing for a merge unless told which
        // parent; Git Extensions diffs against the first parent.
        using TempRepo repo = new();
        File.WriteAllText(Path.Combine(repo.Dir, "main.txt"), "main work\n");
        repo.StageAndCommit("main change");
        GitProcess.Run("git", ["merge", "--no-ff", "-m", "Merge branch 'feature'", "feature"], repo.Dir, 30_000);

        GitHost host = new();
        Assert.NotNull(host.TryDiscover(repo.Dir));
        RevisionDto merge = host.ListRevisions(1)[0];
        Assert.Equal(2, merge.Parents.Length);

        // Against the first parent only: the feature branch's one file, not
        // main's own change seen from the second parent.
        IReadOnlyList<FileChangeDto> files = host.ListFiles(merge.Id);
        FileChangeDto file = Assert.Single(files);
        Assert.NotEqual("main.txt", file.Path);
        CommitChangesDto changes = host.GetChanges(merge.Id);
        Assert.Equal(files, changes.Files);
        Assert.NotNull(changes.FirstDiff);
        Assert.Contains("@@", changes.FirstDiff!.Text);
        Assert.Equal(host.GetDiff(merge.Id, files[0].Path), changes.FirstDiff);
    }

    [Fact]
    public void FirstPatchSection_cuts_the_first_file_only()
    {
        string patch = "diff --git a/a.txt b/a.txt\nindex 1..2 100644\n--- a/a.txt\n+++ b/a.txt\n@@ -1 +1 @@\n-x\n+y\ndiff --git a/b.txt b/b.txt\n+z\n";
        Assert.Equal("diff --git a/a.txt b/a.txt\nindex 1..2 100644\n--- a/a.txt\n+++ b/a.txt\n@@ -1 +1 @@\n-x\n+y\n", GitHost.FirstPatchSection(patch, "a.txt"));
        Assert.Null(GitHost.FirstPatchSection(patch, "b.txt"));
        Assert.Null(GitHost.FirstPatchSection("Binary files differ\n", "a.txt"));
        Assert.Equal("diff --git a/only b/only\n+1\n", GitHost.FirstPatchSection("diff --git a/only b/only\n+1\n", "only"));
    }

    [Fact]
    public void GetWorkTreeDiff_untracked_file_shows_full_added_diff()
    {
        // Regression: `git diff` (without --cached) only ever compares the
        // working tree to the index, so a file git has never seen -- not
        // even staged -- produced empty output, and the UI rendered "no
        // diff" for a brand-new file. GetWorkTreeDiff now falls back to
        // `git diff --no-index` for untracked paths so the full content
        // shows as one "added" hunk.
        using TempRepo repo = new();
        GitHost host = new();
        host.Open(repo.Dir);

        File.WriteAllText(Path.Combine(repo.Dir, "new-untracked.txt"), "line1\nline2\nline3\n");

        DiffDto diff = host.GetWorkTreeDiff("new-untracked.txt", staged: false);

        Assert.False(diff.Binary);
        Assert.Contains("+line1", diff.Text, StringComparison.Ordinal);
        Assert.Contains("+line2", diff.Text, StringComparison.Ordinal);
        Assert.Contains("+line3", diff.Text, StringComparison.Ordinal);
        Assert.DoesNotContain("no diff", diff.Text, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void GetWorkTreeDiff_staged_new_file_keeps_normal_behavior()
    {
        // Once `git add`ed, the path is tracked in the index (git ls-files
        // sees it), so the untracked fallback must not kick in: --cached
        // already renders the "added" diff, and the unstaged view correctly
        // still says "no diff" since nothing is left unstaged for it.
        using TempRepo repo = new();
        GitHost host = new();
        host.Open(repo.Dir);

        File.WriteAllText(Path.Combine(repo.Dir, "staged-new.txt"), "hello\n");
        RunGit(repo.Dir, "add", "staged-new.txt");

        DiffDto staged = host.GetWorkTreeDiff("staged-new.txt", staged: true);
        Assert.Contains("+hello", staged.Text, StringComparison.Ordinal);

        DiffDto unstaged = host.GetWorkTreeDiff("staged-new.txt", staged: false);
        Assert.Equal("(no diff)", unstaged.Text);
    }

    [Fact]
    public void GetRefs_lists_heads()
    {
        GitHost host = Opened();
        RefTreeDto tree = host.GetRefs();
        Assert.NotEmpty(tree.Branches);
        Assert.Contains(tree.Branches, b => b.Current);
    }

    [Fact]
    public void GetConfig_returns_identity_or_nulls()
    {
        GitHost host = Opened();
        GitConfigDto cfg = host.GetConfig();
        Assert.NotNull(cfg);
    }

    [Fact]
    public void GetStatus_does_not_throw()
    {
        GitHost host = Opened();
        RepoStatusDto status = host.GetStatus();
        Assert.False(string.IsNullOrWhiteSpace(status.Branch));
        Assert.True(status.UnstagedCount >= 0);
        Assert.True(status.StagedCount >= 0);
    }

    [Fact]
    public void VsCodeLocator_detects_without_throwing()
    {
        VsCodeInfo info = VsCodeLocator.Detect();
        Assert.NotNull(info);
    }

    [Fact]
    public void ListRevisions_pages_consistently()
    {
        GitHost host = Opened();
        IReadOnlyList<RevisionDto> full = host.ListRevisions(30);
        Assert.True(full.Count > 10, "dev repo should have more than 10 commits");

        List<RevisionDto> paged = [];
        for (int skip = 0; skip < 30 && paged.Count < full.Count; skip += 10)
        {
            paged.AddRange(host.ListRevisions(10, skip));
        }

        Assert.Equal(full.Select(r => r.Id), paged.Take(full.Count).Select(r => r.Id));
    }

    [Fact]
    public void ListRevisions_uses_date_order_so_other_branches_surface_in_first_page()
    {
        // Regression: --topo-order tunnels down whichever branch it starts
        // on and only backs off once that line hits a synchronization wait,
        // so one long-lived branch (main, here) fills the entire first page
        // before a shorter branch's commit is even considered -- even one
        // newer than most of that page. That is exactly what made the graph
        // look single-branch-only. --date-order fixes it by always picking
        // the single next-newest ready commit across every branch.
        //
        // Layout: main gets 50 commits one minute apart; "side" forks after
        // main-4 and gets one commit dated between main-40 and main-41. The
        // 10 newest commits by pure date are main-49..main-41 (9 commits)
        // then side-commit -- verified against --topo-order (drops
        // side-commit from -n10) and --date-order (keeps it) on a live repo.
        string dir = Directory.CreateTempSubdirectory("powergit-order-").FullName;
        try
        {
            RunGit(dir, "init", "-q", "-b", "main");
            RunGit(dir, "config", "user.email", "test@example.com");
            RunGit(dir, "config", "user.name", "test");

            const long BaseTime = 1_700_000_000;
            for (int i = 0; i < 5; i++)
            {
                CommitAt(dir, $"main-{i}", BaseTime + (i * 60));
            }

            RunGit(dir, "checkout", "-q", "-b", "side");
            CommitAt(dir, "side-commit", BaseTime + (40 * 60) + 30);
            RunGit(dir, "checkout", "-q", "main");

            for (int i = 5; i < 50; i++)
            {
                CommitAt(dir, $"main-{i}", BaseTime + (i * 60));
            }

            GitHost host = new();
            host.Open(dir);
            IReadOnlyList<RevisionDto> top = host.ListRevisions(10);

            Assert.Contains(top, r => r.Subject == "side-commit");
        }
        finally
        {
            try
            {
                Directory.Delete(dir, recursive: true);
            }
            catch
            {
                // best effort; a lingering repo watcher handle should not fail the test
            }
        }
    }

    [Fact]
    public void ListRevisions_survives_thousands_of_refs()
    {
        // Regression: /revisions once expanded every ref into git-log argv,
        // which exceeds the 32K Windows command-line limit at roughly 900
        // refs. 2500 long-named branches ≈ 120K chars of ref names.
        using TempRepo repo = new();
        string head;
        {
            GitHost host = new();
            host.Open(repo.Dir);
            head = host.ListRevisions(1)[0].Id;
        }

        System.Diagnostics.ProcessStartInfo psi = new("git", "update-ref --stdin")
        {
            WorkingDirectory = repo.Dir,
            RedirectStandardInput = true,
            RedirectStandardError = true,
        };
        using (System.Diagnostics.Process p = System.Diagnostics.Process.Start(psi)!)
        {
            p.StandardInput.NewLine = "\n"; // \r\n would corrupt the ref values
            for (int i = 0; i < 2500; i++)
            {
                p.StandardInput.WriteLine($"create refs/heads/load-test/very-long-branch-name-{i:D5} {head}");
            }

            p.StandardInput.Close();
            Assert.True(p.WaitForExit(60_000), "update-ref timed out");
            Assert.Equal(0, p.ExitCode);
        }

        GitHost reopened = new();
        reopened.Open(repo.Dir);
        IReadOnlyList<RevisionDto> revs = reopened.ListRevisions(50);
        Assert.NotEmpty(revs);
        Assert.Contains(revs, r => r.Refs.Any(name => name.StartsWith("load-test/", StringComparison.Ordinal)));
        Assert.Equal(2500 + 2, reopened.GetRefs().Branches.Length); // main + feature + generated
    }

    /// <summary>
    ///  A file changed in three commits and renamed once, with unrelated
    ///  commits in between and an unrelated branch. Returns the subjects of
    ///  the commits that touched it, newest first.
    /// </summary>
    private static string[] FileHistoryFixture(TempRepo repo)
    {
        repo.Write("doc.txt", "one\n");
        repo.StageAndCommit("doc-1");
        repo.Write("other.txt", "x\n");
        repo.StageAndCommit("other-1");
        repo.Write("doc.txt", "one\ntwo\n");
        repo.StageAndCommit("doc-2");
        repo.Run("mv", "doc.txt", "renamed.txt");
        repo.StageAndCommit("doc-rename");
        repo.Write("other.txt", "y\n");
        repo.StageAndCommit("other-2");
        repo.Write("renamed.txt", "one\ntwo\nthree\n");
        repo.StageAndCommit("doc-3");
        return ["doc-3", "doc-rename", "doc-2", "doc-1"];
    }

    [Fact]
    public void ListRevisions_with_path_follows_the_file_across_a_rename()
    {
        // Owner (v0.16.0): "right click a file and show the file history ...
        // functionally equivalent to GE". GE's FormFileHistory lists the
        // commits touching the path under every name it had (follow renames
        // on by default) and nothing else.
        using TempRepo repo = new();
        string[] expected = FileHistoryFixture(repo);
        GitHost host = new();
        host.Open(repo.Dir);

        IReadOnlyList<RevisionDto> history = host.ListRevisions(filter: new RevisionFilter("renamed.txt"));

        Assert.Equal(expected, history.Select(r => r.Subject));
        // Each row names the file as it was at that commit.
        Assert.Equal(["renamed.txt", "renamed.txt", "doc.txt", "doc.txt"], history.Select(r => r.Path));
        // --parents rewrites the parents to the previous row of the filtered
        // list, so the lane layout draws one connected line (the unrelated
        // commits between them are not in the list).
        for (int i = 0; i + 1 < history.Count; i++)
        {
            Assert.Equal([history[i + 1].Id], history[i].Parents);
        }

        Assert.Empty(history[^1].Parents);
        Assert.True(history[0].IsHead);
        Assert.Contains("HEAD", history[0].Refs);
        // An unfiltered list still has no Path.
        Assert.All(host.ListRevisions(10), r => Assert.Null(r.Path));
    }

    [Fact]
    public void ListRevisions_with_path_without_follow_stops_at_the_rename_and_pages()
    {
        using TempRepo repo = new();
        FileHistoryFixture(repo);
        GitHost host = new();
        host.Open(repo.Dir);

        // GE "Detect and follow renames" off: the new name only exists from
        // the rename on; the old name's history ends with the rename.
        IReadOnlyList<RevisionDto> plain = host.ListRevisions(filter: new RevisionFilter("renamed.txt", Follow: false));
        Assert.Equal(["doc-3", "doc-rename"], plain.Select(r => r.Subject));
        Assert.All(plain, r => Assert.Equal("renamed.txt", r.Path));
        IReadOnlyList<RevisionDto> old = host.ListRevisions(filter: new RevisionFilter("doc.txt", Follow: false));
        Assert.Equal(["doc-rename", "doc-2", "doc-1"], old.Select(r => r.Subject));

        // Paging works on the filtered stream like on the full one.
        RevisionFilter follow = new("renamed.txt");
        IReadOnlyList<RevisionDto> first = host.ListRevisions(3, 0, filter: follow);
        IReadOnlyList<RevisionDto> rest = host.ListRevisions(3, 3, filter: follow);
        Assert.Equal(["doc-3", "doc-rename", "doc-2"], first.Select(r => r.Subject));
        Assert.Equal(["doc-1"], rest.Select(r => r.Subject));

        // A folder filters by prefix and never follows.
        repo.Write("dir/inner.txt", "i\n");
        repo.StageAndCommit("dir-1");
        IReadOnlyList<RevisionDto> folder = host.ListRevisions(filter: new RevisionFilter("dir/"));
        Assert.Equal(["dir-1"], folder.Select(r => r.Subject));
        Assert.Equal("dir/", folder[0].Path);
    }

    private static void CommitAt(string dir, string message, long unixSeconds)
    {
        string date = $"{unixSeconds} +0000";
        System.Diagnostics.ProcessStartInfo psi = new("git", ["commit", "-q", "--allow-empty", "-m", message])
        {
            WorkingDirectory = dir,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
        };
        psi.Environment["GIT_AUTHOR_DATE"] = date;
        psi.Environment["GIT_COMMITTER_DATE"] = date;
        using System.Diagnostics.Process? p = System.Diagnostics.Process.Start(psi);
        p?.WaitForExit(30_000);
        if (p is null || p.ExitCode != 0)
        {
            throw new InvalidOperationException($"git commit failed: {p?.StandardError.ReadToEnd()}");
        }
    }

    private static void RunGit(string workDir, params string[] args)
    {
        System.Diagnostics.ProcessStartInfo psi = new("git", args)
        {
            WorkingDirectory = workDir,
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
}
