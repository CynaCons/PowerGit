using System.Text.Json;
using System.Text.RegularExpressions;

namespace PowerGit.Engine;

/// <summary>
///  Review files (v0.19.0, docs/design/review-mode.md §2): the UI's line
///  marks and comments, one JSON document per review key, kept in the
///  repository so an agent working there can read them (over MCP, v0.20).
///  The engine stores the text as written and only checks it is a JSON
///  object; git's local exclude keeps the working tree clean.
/// </summary>
public sealed partial class GitHost
{
    /// <summary>
    ///  Where the reviews live, relative to the root. The one place the
    ///  location is spelled: an app-data fallback (owner call 3) is this line.
    /// </summary>
    public const string ReviewsDirectory = ".powergit/reviews";

    /// <summary>
    ///  Set once <c>/.powergit/</c> is known to be in <c>.git/info/exclude</c>
    ///  for this session, so the debounced saves (one every few hundred ms
    ///  while marking) do not each spawn a <c>git rev-parse</c>.
    /// </summary>
    private bool _reviewsExcluded;

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

        if (!_reviewsExcluded)
        {
            EnsureExcluded("/.powergit/");
            _reviewsExcluded = true;
        }
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
