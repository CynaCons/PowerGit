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
    public void GetDiff_reuses_rename_map_for_repeated_files_in_the_same_commit()
    {
        // v0.18.18: the Diff tab asks for one file at a time. A rename still
        // needs both old and new paths in `git show`, but the whole-commit
        // rename scan is per commit, not per clicked file.
        using TempRepo repo = new();
        repo.Run("mv", "a.txt", "renamed.txt");
        repo.StageAndCommit("rename-a");
        string id = repo.HeadId();
        GitHost host = new();
        host.Open(repo.Dir);

        DiffDto first = host.GetDiff(id, "renamed.txt");
        int misses = host.RenameMapCacheMisses;
        DiffDto second = host.GetDiff(id, "renamed.txt");

        Assert.Equal(first, second);
        Assert.Equal(1, misses);
        Assert.Equal(misses, host.RenameMapCacheMisses);
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
    public void GetWorkTreeBlob_reads_the_disk_for_the_working_tree_and_the_index_when_staged()
    {
        // v0.16.0, owner: "accessing a file in the file tree when selecting
        // the working directory pseudo commit doesn't load." The pending rows'
        // File Tree is HEAD's; a file's content is the disk (Working
        // directory) or the index (Index), as Git Extensions' FileViewer
        // reads its WorkTree and Index revisions.
        using TempRepo repo = new();
        GitHost host = new();
        host.Open(repo.Dir);

        repo.Write("a.txt", "a\nstaged\n");
        RunGit(repo.Dir, "add", "a.txt");
        repo.Write("a.txt", "a\nstaged\nunstaged\n");

        DiffDto disk = host.GetWorkTreeBlob("a.txt", staged: false);
        Assert.False(disk.Binary);
        Assert.False(disk.Truncated);
        Assert.Equal("a\nstaged\nunstaged\n", disk.Text);
        Assert.Equal(disk.Text.Length, disk.SizeBytes);

        DiffDto index = host.GetWorkTreeBlob("a.txt", staged: true);
        Assert.False(index.Binary);
        Assert.Equal("a\nstaged\n", index.Text);

        // The commit the rows are based on is untouched by either.
        Assert.Equal("a\n", host.GetBlob("HEAD", "a.txt").Text);

        // Untracked: on the disk, not in the index.
        repo.Write("new.txt", "brand new\n");
        Assert.Equal("brand new\n", host.GetWorkTreeBlob("new.txt", staged: false).Text);
        Assert.Throws<InvalidOperationException>(() => host.GetWorkTreeBlob("new.txt", staged: true));

        // Binary is detected like a blob; a missing file, a directory and a
        // path outside the repository are refused.
        File.WriteAllBytes(Path.Combine(repo.Dir, "bin.dat"), [0x00, 0x01, 0x02]);
        Assert.True(host.GetWorkTreeBlob("bin.dat", staged: false).Binary);
        Assert.Throws<InvalidOperationException>(() => host.GetWorkTreeBlob("missing.txt", staged: false));
        Assert.Throws<InvalidOperationException>(() => host.GetWorkTreeBlob(".git", staged: false));
        Assert.Throws<InvalidOperationException>(() => host.GetWorkTreeBlob("../outside.txt", staged: false));
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
    public void GetRefs_shortens_names_and_disambiguates_branch_tag_collisions()
    {
        using TempRepo repo = new();
        repo.Run("branch", "topic");
        repo.Run("tag", "topic");
        repo.Run("tag", "release");
        GitHost host = new();
        host.Open(repo.Dir);

        RefTreeDto refs = host.GetRefs();
        Assert.Contains(refs.Branches, r => r.Name == "heads/topic" && r.FullName == "refs/heads/topic");
        Assert.Contains(refs.Tags, r => r.Name == "tags/topic" && r.FullName == "refs/tags/topic");
        Assert.Contains(refs.Tags, r => r.Name == "release");
    }

    [Fact]
    public void GetRefs_handles_five_thousand_packed_refs_within_budget()
    {
        using TempRepo repo = new();
        string head = repo.Output("rev-parse", "HEAD");
        System.Diagnostics.ProcessStartInfo psi = new("git", "update-ref --stdin")
        {
            WorkingDirectory = repo.Dir, RedirectStandardInput = true, RedirectStandardError = true,
        };
        using (System.Diagnostics.Process process = System.Diagnostics.Process.Start(psi)!)
        {
            process.StandardInput.NewLine = "\n";
            for (int i = 0; i < 5000; i++) process.StandardInput.WriteLine($"create refs/heads/perf/{i:D5} {head}");
            process.StandardInput.Close();
            Assert.True(process.WaitForExit(60_000));
            Assert.Equal(0, process.ExitCode);
        }
        repo.Run("pack-refs", "--all");
        GitHost host = new();
        host.Open(repo.Dir);
        long best = long.MaxValue;
        for (int i = 0; i < 3; i++)
        {
            System.Diagnostics.Stopwatch watch = System.Diagnostics.Stopwatch.StartNew();
            RefTreeDto refs = host.GetRefs();
            watch.Stop();
            Assert.Equal(5002, refs.Branches.Length);
            best = Math.Min(best, watch.ElapsedMilliseconds);
        }
        // 130 ms on the audit machine; the budget leaves room for a loaded CI box (the
        // %(refname:short) it replaced took 2,578 ms on 5,577 refs, v0.18.10).
        Assert.True(best < 1000, $"GetRefs best of three was {best} ms");
    }

    [Fact]
    public void GetStatus_uses_four_git_calls_after_open()
    {
        using TempRepo repo = new();
        GitHost host = new();
        host.Open(repo.Dir);
        long before = host.CommandLog().Last().Id;

        RepoStatusDto status = host.GetStatus();
        GitLogEntryDto[] calls = host.CommandLog(before).ToArray();

        Assert.Equal("main", status.Branch);
        Assert.Equal(4, calls.Length);
        Assert.DoesNotContain(calls, c => c.Command.Contains("--absolute-git-dir", StringComparison.Ordinal));
        Assert.DoesNotContain(calls, c => c.Command.Contains("--abbrev-ref HEAD", StringComparison.Ordinal));
    }

    [Fact]
    public void GetStatus_keeps_HEAD_for_detached_head()
    {
        using TempRepo repo = new();
        repo.Run("checkout", "--detach");
        GitHost host = new();
        host.Open(repo.Dir);
        Assert.Equal("HEAD", host.GetStatus().Branch);
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

    /// <summary>
    ///  v0.18.5 ref filter fixture: `main` checked out (init, main-2) with two
    ///  branches diverged from init, `a` (a-only) and `b` (b-only), and a
    ///  tag `x` on b's tip. TempRepo's own `feature` branch stays as a fourth
    ///  line nothing asks for.
    /// </summary>
    private static void RefFilterFixture(TempRepo repo)
    {
        repo.Run("checkout", "-q", "-b", "a");
        repo.Write("a-only.txt", "a\n");
        repo.StageAndCommit("a-only");
        repo.Run("checkout", "-q", "main");
        repo.Run("checkout", "-q", "-b", "b");
        repo.Write("b-only.txt", "b\n");
        repo.StageAndCommit("b-only");
        repo.Run("tag", "x");
        repo.Run("checkout", "-q", "main");
        repo.Write("main-2.txt", "m\n");
        repo.StageAndCommit("main-2");
    }

    [Fact]
    public void ListRevisions_with_refs_lists_those_refs_and_head_only()
    {
        // Owner (v0.18.5): "I need to be able to select which branch I see in
        // the graph." GE FilterInfo "Show filtered branches": explicit revs to
        // git log. The checked-out branch is always in (HEAD stays on the
        // command line), the chosen refs come in, nothing else does.
        using TempRepo repo = new();
        RefFilterFixture(repo);
        GitHost host = new();
        host.Open(repo.Dir);
        string head = repo.HeadId();

        IReadOnlyList<RevisionDto> onlyA = host.ListRevisions(filter: new RevisionFilter(Refs: ["refs/heads/a"]));
        string[] subjects = [.. onlyA.Select(r => r.Subject)];
        Assert.Contains("a-only", subjects);
        Assert.Contains("main-2", subjects);
        Assert.Contains("init", subjects);
        Assert.DoesNotContain("b-only", subjects);
        Assert.DoesNotContain("feature-commit", subjects);
        Assert.Contains(onlyA, r => r.Id == head && r.IsHead);
        // The ref labels are the same as on the unfiltered stream.
        Assert.Contains(onlyA, r => r.Refs.Contains("a"));

        // A tag works the same way (b's tip carries it).
        IReadOnlyList<RevisionDto> tagged = host.ListRevisions(filter: new RevisionFilter(Refs: ["refs/tags/x"]));
        string[] taggedSubjects = [.. tagged.Select(r => r.Subject)];
        Assert.Contains("b-only", taggedSubjects);
        Assert.Contains("main-2", taggedSubjects);
        Assert.DoesNotContain("a-only", taggedSubjects);

        // Two refs: both histories, in one date-ordered stream.
        IReadOnlyList<RevisionDto> both = host.ListRevisions(filter: new RevisionFilter(Refs: ["refs/heads/a", "refs/heads/b"]));
        Assert.Contains(both, r => r.Subject == "a-only");
        Assert.Contains(both, r => r.Subject == "b-only");
        Assert.DoesNotContain(both, r => r.Subject == "feature-commit");

        // An empty set is the mode with nothing ticked: HEAD alone.
        IReadOnlyList<RevisionDto> headOnly = host.ListRevisions(filter: new RevisionFilter(Refs: []));
        Assert.Equal(["main-2", "init"], headOnly.Select(r => r.Subject));

        // The unfiltered list is untouched: every branch, and the command
        // line the console shows is the one from before the ref filter.
        IReadOnlyList<RevisionDto> all = host.ListRevisions();
        Assert.Contains(all, r => r.Subject == "feature-commit");
        GitLogEntryDto plain = host.CommandLog().Last(e => e.Command.Contains(" log ", StringComparison.Ordinal));
        Assert.Contains(" --branches --remotes --tags -n800 ", plain.Command, StringComparison.Ordinal);
        Assert.DoesNotContain("--stdin", plain.Command, StringComparison.Ordinal);
        Assert.EndsWith(" HEAD", plain.Command, StringComparison.Ordinal);
    }

    [Fact]
    public void ListRevisions_with_refs_puts_the_names_on_stdin_and_logs_a_count()
    {
        using TempRepo repo = new();
        RefFilterFixture(repo);
        GitHost host = new();
        host.Open(repo.Dir);

        host.ListRevisions(filter: new RevisionFilter(Refs: ["refs/heads/a", "refs/tags/x"]));
        GitLogEntryDto entry = host.CommandLog().Last(e => e.Command.Contains(" log ", StringComparison.Ordinal));
        Assert.Contains(" --stdin -n800 ", entry.Command, StringComparison.Ordinal);
        Assert.DoesNotContain("--branches", entry.Command, StringComparison.Ordinal);
        // The console says how many, never which: the payload can be thousands of names.
        Assert.EndsWith(" HEAD  (2 refs on stdin)", entry.Command, StringComparison.Ordinal);
        Assert.DoesNotContain("refs/heads/a", entry.Command, StringComparison.Ordinal);
        Assert.True(entry.Ok);
    }

    [Theory]
    [InlineData("refs/heads/nope")]
    [InlineData("-c")]
    [InlineData("--all")]
    [InlineData("a")]
    [InlineData("HEAD")]
    [InlineData("refs/stash")]
    [InlineData("refs/heads/a..refs/heads/b")]
    public void ListRevisions_rejects_a_name_that_is_not_one_of_the_repository_refs(string name)
    {
        // Only full names the repository actually has under refs/heads,
        // refs/remotes and refs/tags reach git: no option, no short name, no
        // revision expression — the route turns the exception into a 400
        // that names the offender.
        using TempRepo repo = new();
        RefFilterFixture(repo);
        GitHost host = new();
        host.Open(repo.Dir);

        ArgumentException ex = Assert.Throws<ArgumentException>(
            () => host.ListRevisions(filter: new RevisionFilter(Refs: ["refs/heads/a", name])));
        Assert.Contains(name, ex.Message, StringComparison.Ordinal);
        // Nothing reached git log.
        Assert.DoesNotContain(host.CommandLog(), e => e.Command.Contains("--stdin", StringComparison.Ordinal));
    }

    [Fact]
    public void ListRevisions_with_a_thousand_refs_succeeds()
    {
        // "Show all" on a heavy repository is every ref: on argv that dies
        // near 900 names on Windows (see ListRevisions_survives_thousands_of_refs);
        // on stdin it is just a longer payload.
        using TempRepo repo = new();
        RefFilterFixture(repo);
        repo.Run("checkout", "-q", "a");
        string aTip = repo.HeadId();
        repo.Run("checkout", "-q", "main");
        System.Diagnostics.ProcessStartInfo psi = new("git", "update-ref --stdin")
        {
            WorkingDirectory = repo.Dir,
            RedirectStandardInput = true,
            RedirectStandardError = true,
        };
        List<string> names = [];
        using (System.Diagnostics.Process p = System.Diagnostics.Process.Start(psi)!)
        {
            p.StandardInput.NewLine = "\n";
            for (int i = 0; i < 1000; i++)
            {
                string name = $"refs/heads/filter-load/very-long-branch-name-{i:D5}";
                names.Add(name);
                p.StandardInput.WriteLine($"create {name} {aTip}");
            }

            p.StandardInput.Close();
            Assert.True(p.WaitForExit(60_000), "update-ref timed out");
            Assert.Equal(0, p.ExitCode);
        }

        GitHost host = new();
        host.Open(repo.Dir);
        IReadOnlyList<RevisionDto> revs = host.ListRevisions(filter: new RevisionFilter(Refs: names));
        Assert.Contains(revs, r => r.Subject == "a-only");
        Assert.Contains(revs, r => r.Subject == "main-2");
        Assert.DoesNotContain(revs, r => r.Subject == "b-only");
        GitLogEntryDto entry = host.CommandLog().Last(e => e.Command.Contains(" log ", StringComparison.Ordinal));
        Assert.EndsWith("(1000 refs on stdin)", entry.Command, StringComparison.Ordinal);
    }

    [Fact]
    public void ListRevisions_combines_a_ref_filter_with_a_path_filter()
    {
        using TempRepo repo = new();
        RefFilterFixture(repo);
        GitHost host = new();
        host.Open(repo.Dir);

        // a-only.txt only ever changed on `a`; asking for it on `b`'s history
        // lists nothing, on `a`'s history the one commit.
        IReadOnlyList<RevisionDto> onA = host.ListRevisions(filter: new RevisionFilter("a-only.txt", Refs: ["refs/heads/a"]));
        Assert.Equal(["a-only"], onA.Select(r => r.Subject));
        Assert.Equal("a-only.txt", onA[0].Path);
        IReadOnlyList<RevisionDto> onB = host.ListRevisions(filter: new RevisionFilter("a-only.txt", Refs: ["refs/heads/b"]));
        Assert.Empty(onB);
        // The path a.txt is in every branch's root commit: still listed with
        // a ref filter, and paging still works on the combined filter.
        RevisionFilter combined = new("a.txt", Refs: ["refs/heads/a", "refs/heads/b"]);
        IReadOnlyList<RevisionDto> rooted = host.ListRevisions(filter: combined);
        Assert.Equal(["init"], rooted.Select(r => r.Subject));
        Assert.Empty(host.ListRevisions(1, 1, filter: combined));
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
