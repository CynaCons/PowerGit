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
}
