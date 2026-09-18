using System.Text.Json;
using System.Text.RegularExpressions;

namespace PowerGit.Engine;

/// <summary>
/// Repository-local review documents (v0.19.0). They preserve the UI's line
/// marks and comments for a later agent while git's local exclude keeps the
/// working tree clean; see docs/design/review-mode.md section 2.
/// </summary>
public sealed partial class GitHost
{
    public const string ReviewsDirectory = ".powergit/reviews";

    internal static readonly Regex ReviewKeyPattern = new(
        "^[0-9a-f]{40}([0-9a-f]{24})?(-(worktree|index))?$",
        RegexOptions.Compiled);

    private string ReviewPath(string key)
    {
        string root = RequireRoot();
        if (!ReviewKeyPattern.IsMatch(key))
        {
            throw new InvalidOperationException("invalid review key");
        }

        return ResolveInRoot(root, ReviewsDirectory + "/" + key + ".json");
    }

    public string? ReadReview(string key)
    {
        string path = ReviewPath(key);
        return File.Exists(path) ? File.ReadAllText(path, System.Text.Encoding.UTF8) : null;
    }

    public void WriteReview(string key, string json)
    {
        string path = ReviewPath(key);
        try
        {
            using JsonDocument document = JsonDocument.Parse(json);
            if (document.RootElement.ValueKind != JsonValueKind.Object)
            {
                throw new InvalidOperationException("review must be a JSON object");
            }
        }
        catch (JsonException)
        {
            throw new InvalidOperationException("review must be a JSON object");
        }

        string normalized = json.TrimEnd('\r', '\n') + "\n";
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        string temporary = path + ".tmp-" + Guid.NewGuid().ToString("N");
        try
        {
            File.WriteAllText(temporary, normalized, new System.Text.UTF8Encoding(encoderShouldEmitUTF8Identifier: false));
            File.Move(temporary, path, overwrite: true);
        }
        catch
        {
            File.Delete(temporary);
            throw;
        }

        EnsureExcluded("/.powergit/");
    }

    public bool DeleteReview(string key)
    {
        string path = ReviewPath(key);
        if (!File.Exists(path))
        {
            return false;
        }

        File.Delete(path);
        return true;
    }
}
