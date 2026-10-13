using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace PowerGit.Engine;

/// <summary>
///  The pure parts of agent review rounds (v0.21.1,
///  docs/design/agent-review-rounds.md §3.2–3.3): a patch split into
///  changes (hunks), a change's identity across rounds, and its verdict
///  from the v0.19 line marks. No git, no files.
/// </summary>
public static class AgentReviewHunks
{
    /// <summary>One hunk of a patch: its header numbers, the review line keys of
    ///  its changed lines (<c>+n</c> added, <c>-n</c> removed) and a hash of them.</summary>
    public sealed record Hunk(string Path, int OldStart, int OldLines, int NewStart, int NewLines, IReadOnlyList<string> Keys, string Hash);

    public static List<Hunk> Parse(string path, string? patch)
    {
        List<Hunk> hunks = [];
        if (string.IsNullOrEmpty(patch)) return hunks;
        int oldStart = 0, oldLines = 0, newStart = 0, newLines = 0, oldNum = 0, newNum = 0;
        List<string>? keys = null;
        StringBuilder changed = new();
        void Close()
        {
            if (keys is null) return;
            if (keys.Count > 0)
            {
                string hash = Convert.ToHexStringLower(SHA1.HashData(Encoding.UTF8.GetBytes(changed.ToString())));
                hunks.Add(new(path, oldStart, oldLines, newStart, newLines, keys, hash));
            }
            keys = null;
            changed.Clear();
        }
        foreach (string raw in patch.Replace("\r", "").Split('\n'))
        {
            if (raw.StartsWith("@@", StringComparison.Ordinal))
            {
                Close();
                if (!TryHeader(raw, out oldStart, out oldLines, out newStart, out newLines)) continue;
                oldNum = oldStart; newNum = newStart; keys = [];
                continue;
            }
            if (keys is null) continue;
            if (raw.StartsWith('+')) { keys.Add($"+{newNum++}"); changed.Append(raw).Append('\n'); }
            else if (raw.StartsWith('-')) { keys.Add($"-{oldNum++}"); changed.Append(raw).Append('\n'); }
            else if (raw.StartsWith(' ') || raw.Length == 0) { oldNum++; newNum++; }
        }
        Close();
        return hunks;
    }

    private static bool TryHeader(string line, out int oldStart, out int oldLines, out int newStart, out int newLines)
    {
        oldStart = oldLines = newStart = newLines = 0;
        string[] parts = line.Split(' ');
        if (parts.Length < 3) return false;
        return Range(parts[1], '-', out oldStart, out oldLines) && Range(parts[2], '+', out newStart, out newLines);
    }

    private static bool Range(string text, char sign, out int start, out int count)
    {
        start = 0; count = 1;
        if (text.Length < 2 || text[0] != sign) return false;
        string[] pieces = text[1..].Split(',');
        if (!int.TryParse(pieces[0], out start)) return false;
        return pieces.Length < 2 || int.TryParse(pieces[1], out count);
    }

    /// <summary>A change of the previous round with its hunk, for matching.</summary>
    public sealed record Previous(AgentReviewChangeDto Change, Hunk Hunk);

    /// <summary>
    ///  The new round's changes, in patch order, and the previous round's
    ///  change ids that matched nothing. Same path and hash → carried (keeps
    ///  id and verdict); else an old-side overlap in the same file → revised
    ///  (new id, <c>from</c> the old one); else new. Ids continue from
    ///  <paramref name="nextId"/>.
    /// </summary>
    public static (List<AgentReviewChangeDto> Changes, List<string> Removed) Match(
        IReadOnlyList<Previous> previous, IReadOnlyList<Hunk> hunks, ref int nextId)
    {
        HashSet<string> used = [];
        List<AgentReviewChangeDto> changes = [];
        foreach (Hunk hunk in hunks)
        {
            Previous? same = previous.FirstOrDefault(p => !used.Contains(p.Change.Id) && p.Hunk.Path == hunk.Path && p.Hunk.Hash == hunk.Hash);
            if (same is not null)
            {
                used.Add(same.Change.Id);
                changes.Add(ToChange(hunk, same.Change.Id, "carried", null, same.Change.Verdict, same.Change.RejectedLines));
                continue;
            }
            Previous? near = previous.FirstOrDefault(p => !used.Contains(p.Change.Id) && p.Hunk.Path == hunk.Path && Overlaps(p.Hunk, hunk));
            if (near is not null) used.Add(near.Change.Id);
            changes.Add(ToChange(hunk, $"h{nextId++}", near is null ? "new" : "revised", near?.Change.Id, "undecided", null));
        }
        List<string> removed = [.. previous.Where(p => !used.Contains(p.Change.Id)).Select(p => p.Change.Id)];
        return (changes, removed);
    }

    public static AgentReviewChangeDto ToChange(Hunk hunk, string id, string origin, string? from, string verdict, IReadOnlyList<string>? rejected) =>
        new(id, hunk.Path, hunk.OldStart, hunk.OldLines, hunk.NewStart, hunk.NewLines, hunk.Hash, origin, from, verdict, rejected);

    // An empty side (a pure insertion has OldLines 0) still sits at a
    // position; treat it as one line wide so two insertions at the same place
    // overlap.
    private static bool Overlaps(Hunk a, Hunk b)
    {
        int aEnd = a.OldStart + Math.Max(a.OldLines, 1), bEnd = b.OldStart + Math.Max(b.OldLines, 1);
        return a.OldStart < bEnd && b.OldStart < aEnd;
    }

    /// <summary>
    ///  A change's verdict from its lines' marks: all rejected → reject; some
    ///  rejected → mixed; all ok → accept; else undecided. Returns the
    ///  rejected keys for mixed.
    /// </summary>
    public static (string Verdict, List<string>? Rejected) Verdict(IReadOnlyList<string> keys, IReadOnlyDictionary<string, string> marks)
    {
        List<string> rejected = [.. keys.Where(k => marks.TryGetValue(k, out string? s) && s == "rejected")];
        int ok = keys.Count(k => marks.TryGetValue(k, out string? s) && s == "ok");
        if (keys.Count == 0) return ("undecided", null);
        if (rejected.Count == keys.Count) return ("reject", null);
        if (rejected.Count > 0) return ("mixed", rejected);
        return ok == keys.Count ? ("accept", null) : ("undecided", null);
    }

    /// <summary>The marks of one file in a v0.19 review document; empty when absent.</summary>
    public static Dictionary<string, string> Marks(JsonNode? doc, string path)
    {
        Dictionary<string, string> marks = [];
        if (doc?["files"]?[path]?["lines"] is JsonObject lines)
            foreach (KeyValuePair<string, JsonNode?> line in lines)
                if (line.Value is JsonValue value && value.TryGetValue(out string? state)) marks[line.Key] = state;
        return marks;
    }

    /// <summary>The comments of a v0.19 review document as (path, line, text).</summary>
    public static List<(string Path, string Line, string Text)> Comments(JsonNode? doc)
    {
        List<(string, string, string)> comments = [];
        if (doc?["files"] is not JsonObject files) return comments;
        foreach (KeyValuePair<string, JsonNode?> file in files)
        {
            if (file.Value?["comments"] is not JsonArray list) continue;
            foreach (JsonNode? item in list)
            {
                string? line = item?["line"]?.GetValue<string>(), text = item?["text"]?.GetValue<string>();
                if (line is not null && text is not null) comments.Add((file.Key, line, text));
            }
        }
        return comments;
    }

    /// <summary>
    ///  The marks of carried changes, moved to the new round's line numbers:
    ///  removed lines keep their key (both rounds diff against the same base),
    ///  added lines shift by the change of the hunk's new start.
    /// </summary>
    public static string CarryMarks(string key, JsonNode? previousDoc, IReadOnlyList<(Hunk Old, Hunk New)> carried)
    {
        JsonObject files = [];
        foreach ((Hunk old, Hunk now) in carried)
        {
            Dictionary<string, string> marks = Marks(previousDoc, old.Path);
            int shift = now.NewStart - old.NewStart;
            foreach (string k in old.Keys)
            {
                if (!marks.TryGetValue(k, out string? state)) continue;
                string moved = k[0] == '+' ? $"+{int.Parse(k.AsSpan(1)) + shift}" : k;
                if (files[old.Path] is not JsonObject file) files[old.Path] = file = new JsonObject { ["lines"] = new JsonObject(), ["comments"] = new JsonArray() };
                ((JsonObject)file["lines"]!)[moved] = state;
            }
        }
        int reviewed = files.Sum(f => ((JsonObject)f.Value!["lines"]!).Count);
        JsonObject doc = new()
        {
            ["version"] = 1, ["commit"] = key, ["reviewed"] = reviewed, ["changed"] = 0,
            ["status"] = "in-progress", ["files"] = files,
        };
        return doc.ToJsonString(new JsonSerializerOptions { WriteIndented = true });
    }
}
