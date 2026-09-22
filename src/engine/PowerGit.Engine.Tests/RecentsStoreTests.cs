using System.Runtime.CompilerServices;
using Xunit;

namespace PowerGit.Engine.Tests;

/// <summary>
///  Keeps the whole test run out of the user's real recents.json: the store
///  is per user and shared with the packaged app, and the fixture
///  repositories these tests open used to land in the app's "Recent
///  repositories" (v0.13.21 owner report).
/// </summary>
internal static class TestDataDir
{
    public static readonly string Path = System.IO.Path.Combine(System.IO.Path.GetTempPath(), $"powergit-tests-{Environment.ProcessId}");

    [ModuleInitializer]
    internal static void Init()
    {
        Directory.CreateDirectory(Path);
        Environment.SetEnvironmentVariable(RecentsStore.DataDirEnvVar, Path);
        // v0.20.1: every WebApplicationFactory in this suite would otherwise
        // host the MCP endpoint on the user's real pipe / socket and race the
        // others (and a running PowerGit) for it; McpHostTests build their
        // own host on a unique endpoint.
        Environment.SetEnvironmentVariable("POWERGIT_MCP", "0");
    }
}

public sealed class RecentsStoreTests
{
    [Fact]
    public void Store_lives_under_the_overridden_data_dir()
    {
        Assert.StartsWith(TestDataDir.Path, RecentsStore.FilePath);
    }

    [Fact]
    public void Deleted_roots_are_pruned_on_read()
    {
        string alive = System.IO.Path.Combine(System.IO.Path.GetTempPath(), $"powergit-alive-{Guid.NewGuid():N}");
        Directory.CreateDirectory(alive);
        string gone = System.IO.Path.Combine(System.IO.Path.GetTempPath(), $"powergit-gone-{Guid.NewGuid():N}");
        Directory.CreateDirectory(gone);

        RecentsStore.Remember(new RepoInfo("gone", gone, "main", "g1"));
        RecentsStore.Remember(new RepoInfo("alive", alive, "main", "a1"));
        Assert.Contains(RecentsStore.List(), r => r.Root == gone);

        Directory.Delete(gone, recursive: true);

        IReadOnlyList<RecentInfo> list = RecentsStore.List();
        Assert.DoesNotContain(list, r => r.Root == gone);
        Assert.Contains(list, r => r.Root == alive);
        Directory.Delete(alive, recursive: true);
    }

    [Fact]
    public void Forget_removes_one_entry_and_keeps_the_rest()
    {
        string keep = System.IO.Path.Combine(System.IO.Path.GetTempPath(), $"powergit-keep-{Guid.NewGuid():N}");
        string drop = System.IO.Path.Combine(System.IO.Path.GetTempPath(), $"powergit-drop-{Guid.NewGuid():N}");
        Directory.CreateDirectory(keep);
        Directory.CreateDirectory(drop);
        try
        {
            RecentsStore.Remember(new RepoInfo("keep", keep, "main", "k1"));
            RecentsStore.Remember(new RepoInfo("drop", drop, "main", "d1"));

            RecentsStore.Forget(drop);
            RecentsStore.Forget(drop); // idempotent

            IReadOnlyList<RecentInfo> list = RecentsStore.List();
            Assert.DoesNotContain(list, r => r.Root == drop);
            Assert.Contains(list, r => r.Root == keep);
        }
        finally
        {
            Directory.Delete(keep, recursive: true);
            Directory.Delete(drop, recursive: true);
        }
    }

    [Fact]
    public void Remember_writes_last_opened_and_preserves_pinned()
    {
        string root = Directory.CreateTempSubdirectory("powergit-recent-").FullName;
        try
        {
            RecentsStore.Remember(new RepoInfo("repo", root, "main", "one"));
            Assert.True(RecentsStore.SetPinned(root, true));

            DateTimeOffset before = DateTimeOffset.UtcNow;
            RecentsStore.Remember(new RepoInfo("repo", root, "topic", "two"));
            RecentInfo recent = Assert.Single(RecentsStore.List(), r => r.Root == root);

            Assert.True(recent.Pinned);
            Assert.Equal("topic", recent.Branch);
            Assert.NotNull(recent.LastOpened);
            Assert.True(recent.LastOpened >= before);
        }
        finally
        {
            Directory.Delete(root, recursive: true);
        }
    }

    [Fact]
    public void SetPinned_returns_false_for_a_missing_root()
    {
        Assert.False(RecentsStore.SetPinned(System.IO.Path.Combine(TestDataDir.Path, Guid.NewGuid().ToString("N")), true));
    }

    [Fact]
    public void Old_format_loads_with_defaults()
    {
        string root = Directory.CreateTempSubdirectory("powergit-old-recent-").FullName;
        try
        {
            File.WriteAllText(RecentsStore.FilePath,
                $$"""[{"Name":"repo","Root":"{{root.Replace("\\", "\\\\")}}","Branch":"main","Id":"old"}]""");

            RecentInfo recent = Assert.Single(RecentsStore.List());
            Assert.Null(recent.LastOpened);
            Assert.False(recent.Pinned);
        }
        finally
        {
            Directory.Delete(root, recursive: true);
        }
    }
}
