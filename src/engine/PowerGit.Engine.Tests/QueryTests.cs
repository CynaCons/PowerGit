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
