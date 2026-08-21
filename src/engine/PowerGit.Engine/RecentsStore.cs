using System.Text.Json;

namespace PowerGit.Engine;

public static class RecentsStore
{
    private static readonly object Gate = new();
    private static readonly JsonSerializerOptions Json = new() { WriteIndented = true };

    public static string FilePath
    {
        get
        {
            string dir = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "PowerGit");
            Directory.CreateDirectory(dir);
            return Path.Combine(dir, "recents.json");
        }
    }

    public static IReadOnlyList<RepoInfo> List()
    {
        lock (Gate)
        {
            return ReadUnlocked();
        }
    }

    public static void Remember(RepoInfo repo)
    {
        lock (Gate)
        {
            List<RepoInfo> list = [.. ReadUnlocked().Where(r => !string.Equals(r.Root, repo.Root, StringComparison.OrdinalIgnoreCase))];
            list.Insert(0, repo);
            if (list.Count > 20)
            {
                list.RemoveRange(20, list.Count - 20);
            }

            File.WriteAllText(FilePath, JsonSerializer.Serialize(list, Json));
        }
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
