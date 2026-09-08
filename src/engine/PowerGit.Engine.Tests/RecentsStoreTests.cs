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

        IReadOnlyList<RepoInfo> list = RecentsStore.List();
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

            IReadOnlyList<RepoInfo> list = RecentsStore.List();
            Assert.DoesNotContain(list, r => r.Root == drop);
            Assert.Contains(list, r => r.Root == keep);
        }
        finally
        {
            Directory.Delete(keep, recursive: true);
            Directory.Delete(drop, recursive: true);
        }
    }
}
