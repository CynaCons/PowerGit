using System.Text.Json;

namespace PowerGit.Engine;

/// <summary>
///  The per-user "recent repositories" list (v0.13.21 owner report: the
///  shipped app listed development fixture repositories).
///  <para>
///  The store is one file per user, shared by every engine process on the
///  machine: the packaged app's sidecar, <c>npm run engine</c>, and the
///  engines the e2e suites drive — whose disposable fixture repositories
///  used to fill all twenty slots. Two guards: entries whose root no longer
///  exists are dropped on every read (fixtures are deleted after each
///  spec), and <c>POWERGIT_DATA_DIR</c> moves the whole store, which the
///  dev script and the harnesses set so they never touch the user's list.
///  </para>
/// </summary>
public static class RecentsStore
{
    /// <summary>Overrides the data directory (dev script, harnesses, tests).</summary>
    public const string DataDirEnvVar = "POWERGIT_DATA_DIR";

    private static readonly object Gate = new();
    private static readonly JsonSerializerOptions Json = new() { WriteIndented = true };

    public static string DataDir
    {
        get
        {
            string? overridden = Environment.GetEnvironmentVariable(DataDirEnvVar);
            string dir = string.IsNullOrWhiteSpace(overridden)
                ? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "PowerGit")
                : overridden;
            Directory.CreateDirectory(dir);
            return dir;
        }
    }

    public static string FilePath => Path.Combine(DataDir, "recents.json");

    public static IReadOnlyList<RepoInfo> List()
    {
        lock (Gate)
        {
            return Prune(ReadUnlocked());
        }
    }

    public static void Remember(RepoInfo repo)
    {
        lock (Gate)
        {
            List<RepoInfo> list = [.. Prune(ReadUnlocked()).Where(r => !string.Equals(r.Root, repo.Root, StringComparison.OrdinalIgnoreCase))];
            list.Insert(0, repo);
            if (list.Count > 20)
            {
                list.RemoveRange(20, list.Count - 20);
            }

            File.WriteAllText(FilePath, JsonSerializer.Serialize(list, Json));
        }
    }

    /// <summary>Removes one entry for good (the cross on a Recents card, v0.14.2).</summary>
    public static void Forget(string root)
    {
        lock (Gate)
        {
            List<RepoInfo> list = [.. Prune(ReadUnlocked()).Where(r => !string.Equals(r.Root, root, StringComparison.OrdinalIgnoreCase))];
            File.WriteAllText(FilePath, JsonSerializer.Serialize(list, Json));
        }
    }

    /// <summary>Drops entries whose root directory is gone (deleted fixtures, unplugged drives).</summary>
    private static List<RepoInfo> Prune(List<RepoInfo> list)
    {
        return [.. list.Where(r => !string.IsNullOrEmpty(r.Root) && Directory.Exists(r.Root))];
    }

    private static List<RepoInfo> ReadUnlocked()
    {
        if (!File.Exists(FilePath))
        {
            return [];
        }

        try
        {
            return JsonSerializer.Deserialize<List<RepoInfo>>(File.ReadAllText(FilePath), Json) ?? [];
        }
        catch
        {
            return [];
        }
    }
}
