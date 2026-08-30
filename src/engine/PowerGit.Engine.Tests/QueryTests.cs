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
}
