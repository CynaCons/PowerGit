using System.Text.Json;

namespace PowerGit.Engine;

/// <summary>
///  v0.21.10: the per-user index of the repositories an agent review was
///  opened in, so the review panel can list every repository's reviews
///  without opening any of them. One file beside <c>recents.json</c> under
///  <see cref="RecentsStore.DataDir"/>; roots are deduplicated by
///  <see cref="GitHost.IdFor"/> (the same normalisation the sessions use) so
///  a folder never appears twice. Nothing here ever throws at its caller: a
///  failing index must not fail the review that recorded it.
/// </summary>
public static class AgentReviewRepos
{
    private static readonly object Gate = new();
    private static readonly JsonSerializerOptions Json = new() { WriteIndented = true };

    public static string FilePath => Path.Combine(RecentsStore.DataDir, "agent-review-repos.json");

    /// <summary>Adds a root to the index; a root already listed (by id) is left as it is.</summary>
    public static void Remember(string root)
    {
        if (string.IsNullOrWhiteSpace(root))
        {
            return;
        }

        try
        {
            lock (Gate)
            {
                string id = GitHost.IdFor(root);
                List<string> roots = ReadUnlocked();
                if (roots.Any(r => SameRepo(r, id)))
                {
                    return;
                }

                roots.Add(root);
                WriteUnlocked(roots);
            }
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException or ArgumentException or NotSupportedException)
        {
            Console.Error.WriteLine($"[engine] agent review index: could not record {root}: {ex.Message}");
        }
    }

    public static IReadOnlyList<string> List()
    {
        lock (Gate)
        {
            return ReadUnlocked();
        }
    }

    private static bool SameRepo(string root, string id)
    {
        try
        {
            return GitHost.IdFor(root) == id;
        }
        catch (Exception ex) when (ex is ArgumentException or NotSupportedException)
        {
            return false;
        }
    }

    private static List<string> ReadUnlocked()
    {
        if (!File.Exists(FilePath))
        {
            return [];
        }

        try
        {
            return JsonSerializer.Deserialize<List<string>>(File.ReadAllText(FilePath), Json) ?? [];
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException or JsonException)
        {
            return [];
        }
    }

    /// <summary>Temp file + rename, like <c>WriteAgentReview</c>, so a crash never leaves a half-written index.</summary>
    private static void WriteUnlocked(List<string> roots)
    {
        string path = FilePath;
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        string temporary = path + ".tmp-" + Guid.NewGuid().ToString("N");
        try
        {
            File.WriteAllText(temporary, JsonSerializer.Serialize(roots, Json) + "\n", new System.Text.UTF8Encoding(false));
            File.Move(temporary, path, true);
        }
        catch
        {
            File.Delete(temporary);
            throw;
        }
    }
}
