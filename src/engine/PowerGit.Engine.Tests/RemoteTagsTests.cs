using Xunit;

namespace PowerGit.Engine.Tests;

/// <summary>
///  v0.21.16: which tags each remote has. A fetch asks the remote
///  (ls-remote), a tag push records it, the ref tree marks each tag with the
///  remotes that have the same object, and a remote never asked stays out of
///  RemoteTagsKnown so nothing claims a tag is local before it answered.
/// </summary>
public sealed class RemoteTagsTests
{
    private static string AddOrigin(TempRepo repo)
    {
        string bare = Directory.CreateTempSubdirectory("powergit-tags-origin-").FullName;
        repo.Run("init", "--bare", "-q", bare);
        repo.Run("remote", "add", "origin", bare);
        repo.Run("push", "-q", "origin", "main");
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

    private static RefItemDto Tag(RefTreeDto tree, string name) => Assert.Single(tree.Tags, t => t.Name == name);

    private static string[] TagsOf(string bare)
    {
        System.Diagnostics.ProcessStartInfo psi = new("git") { RedirectStandardOutput = true };
        foreach (string a in new[] { "--git-dir", bare, "tag", "--list" })
        {
            psi.ArgumentList.Add(a);
        }

        using System.Diagnostics.Process p = System.Diagnostics.Process.Start(psi)!;
        string output = p.StandardOutput.ReadToEnd();
        p.WaitForExit();
        return output.Split('\n', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
    }

    [Fact]
    public void Nothing_is_known_until_the_remote_is_asked()
    {
        using TempRepo repo = new();
        string bare = AddOrigin(repo);
        try
        {
            repo.Run("tag", "v1");
            GitHost host = new();
            host.Open(repo.Dir);
            RefTreeDto tree = host.GetRefs();
            Assert.Empty(tree.RemoteTagsKnown!);
            Assert.Empty(Tag(tree, "v1").Remotes!);
            Assert.All(tree.Branches, b => Assert.Null(b.Remotes));
        }
        finally
        {
            DeleteBare(bare);
        }
    }

    [Fact]
    public void A_fetch_records_the_remote_tags_and_a_local_tag_is_not_on_it()
    {
        using TempRepo repo = new();
        string bare = AddOrigin(repo);
        try
        {
            repo.Run("tag", "-a", "v1", "-m", "first");
            repo.Run("push", "-q", "origin", "v1");
            repo.Run("tag", "v2-local");
            GitHost host = new();
            host.Open(repo.Dir);
            host.FetchRemote("origin");

            RefTreeDto tree = host.GetRefs();
            Assert.Equal(["origin"], tree.RemoteTagsKnown!);
            Assert.Equal(["origin"], Tag(tree, "v1").Remotes!);
            Assert.Empty(Tag(tree, "v2-local").Remotes!);
        }
        finally
        {
            DeleteBare(bare);
        }
    }

    [Fact]
    public void A_tag_that_differs_on_the_remote_is_not_marked()
    {
        using TempRepo repo = new();
        string bare = AddOrigin(repo);
        try
        {
            repo.Run("tag", "moved", "main");
            repo.Run("push", "-q", "origin", "moved");
            repo.Run("tag", "-f", "moved", "feature");
            GitHost host = new();
            host.Open(repo.Dir);
            host.FetchRemote("origin");
            Assert.Empty(Tag(host.GetRefs(), "moved").Remotes!);
        }
        finally
        {
            DeleteBare(bare);
        }
    }

    [Fact]
    public void PushTag_pushes_one_tag_and_marks_it()
    {
        using TempRepo repo = new();
        string bare = AddOrigin(repo);
        try
        {
            repo.Run("tag", "v1");
            repo.Run("tag", "v2");
            GitHost host = new();
            host.Open(repo.Dir);
            host.PushTag("v1", "origin");

            RefTreeDto tree = host.GetRefs();
            Assert.Equal(["origin"], Tag(tree, "v1").Remotes!);
            Assert.Empty(Tag(tree, "v2").Remotes!);

            Assert.Equal(["v1"], TagsOf(bare));
        }
        finally
        {
            DeleteBare(bare);
        }
    }

    [Fact]
    public void PushTag_refuses_a_missing_tag_and_a_remote_that_has_another()
    {
        using TempRepo repo = new();
        string bare = AddOrigin(repo);
        try
        {
            repo.Run("tag", "v1", "main");
            repo.Run("push", "-q", "origin", "v1");
            repo.Run("tag", "-f", "v1", "feature");
            GitHost host = new();
            host.Open(repo.Dir);
            Assert.Contains("no tag", Assert.Throws<InvalidOperationException>(() => host.PushTag("nope", "origin")).Message);
            Assert.Contains("already has a different tag", Assert.Throws<InvalidOperationException>(() => host.PushTag("v1", "origin")).Message);
        }
        finally
        {
            DeleteBare(bare);
        }
    }

    [Fact]
    public void A_remote_whose_url_changes_is_asked_again()
    {
        using TempRepo repo = new();
        string bare = AddOrigin(repo);
        string other = Directory.CreateTempSubdirectory("powergit-tags-other-").FullName;
        try
        {
            repo.Run("tag", "v1");
            repo.Run("push", "-q", "origin", "v1");
            GitHost host = new();
            host.Open(repo.Dir);
            host.FetchRemote("origin");
            Assert.Equal(["origin"], host.GetRefs().RemoteTagsKnown!);

            repo.Run("init", "--bare", "-q", other);
            host.SaveRemote("origin", other);
            RefTreeDto tree = host.GetRefs();
            Assert.Empty(tree.RemoteTagsKnown!);
            Assert.Empty(Tag(tree, "v1").Remotes!);
        }
        finally
        {
            DeleteBare(bare);
            DeleteBare(other);
        }
    }
}
