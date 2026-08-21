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
}
