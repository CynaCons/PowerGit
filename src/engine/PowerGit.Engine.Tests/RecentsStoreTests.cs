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
}
