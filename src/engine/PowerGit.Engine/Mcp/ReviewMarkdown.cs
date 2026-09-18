using System.Text;
using System.Text.Json;

namespace PowerGit.Engine.Mcp;

public static class ReviewMarkdown
{
    public static string Render(AgentReviewDto session, string? reviewJsonText, IReadOnlyDictionary<string, string> diffs)
    {
        StringBuilder output = new();
        output.Append("# Review of ").AppendLine(session.Title).AppendLine();
        output.AppendLine(session.Base is not null && session.Head is not null ? $"{session.Base}..{session.Head}" : "working tree").AppendLine();
        if (reviewJsonText is null)
        {
            output.AppendLine("0 / 0 lines reviewed · 0 rejected · 0 comments").AppendLine().AppendLine("no review yet");
            return output.ToString();
        }

        using JsonDocument document = JsonDocument.Parse(reviewJsonText);
        JsonElement root = document.RootElement;
        int reviewed = Number(root, "reviewed"), changed = Number(root, "changed"), rejected = 0, comments = 0;
        JsonElement files = root.TryGetProperty("files", out JsonElement value) && value.ValueKind == JsonValueKind.Object ? value : default;
        if (files.ValueKind == JsonValueKind.Object)
        {
            foreach (JsonProperty file in files.EnumerateObject())
            {
                if (file.Value.TryGetProperty("lines", out JsonElement lines) && lines.ValueKind == JsonValueKind.Object)
                    rejected += lines.EnumerateObject().Count(p => p.Value.GetString() == "rejected");
                if (file.Value.TryGetProperty("comments", out JsonElement notes) && notes.ValueKind == JsonValueKind.Array)
                    comments += notes.GetArrayLength();
            }
        }
        output.Append(reviewed).Append(" / ").Append(changed).Append(" lines reviewed · ").Append(rejected)
            .Append(" rejected · ").Append(comments).AppendLine(" comments");
        if (files.ValueKind != JsonValueKind.Object) return output.ToString();

        foreach (JsonProperty file in files.EnumerateObject())
        {
            output.AppendLine().Append("## ").AppendLine(file.Name).AppendLine();
            Dictionary<string, bool> marks = [];
            if (file.Value.TryGetProperty("lines", out JsonElement lines) && lines.ValueKind == JsonValueKind.Object)
                foreach (JsonProperty line in lines.EnumerateObject()) if (line.Value.GetString() == "rejected") marks[line.Name] = true;
            Dictionary<string, List<string>> notes = [];
            if (file.Value.TryGetProperty("comments", out JsonElement noteArray) && noteArray.ValueKind == JsonValueKind.Array)
                foreach (JsonElement note in noteArray.EnumerateArray())
                {
                    string? key = note.TryGetProperty("line", out JsonElement keyEl) ? keyEl.GetString() : null;
                    string? text = note.TryGetProperty("text", out JsonElement textEl) ? textEl.GetString() : null;
                    if (key is null || text is null) continue;
                    if (!notes.TryGetValue(key, out List<string>? list)) notes[key] = list = [];
                    list.Add(text); marks.TryAdd(key, false);
                }
            if (marks.Count == 0) { output.AppendLine("nothing rejected"); continue; }

            List<DiffRow> rows = diffs.TryGetValue(file.Name, out string? diff) ? ParseRows(diff) : [];
            IEnumerable<string> ordered = rows.Select(r => r.Key).Where(k => k is not null && marks.ContainsKey(k)).Cast<string>()
                .Concat(marks.Keys.Where(k => !rows.Any(r => r.Key == k)));
            foreach (string key in ordered)
            {
                bool isRejected = marks[key]; bool hasNotes = notes.TryGetValue(key, out List<string>? lineNotes);
                output.Append("**").Append(key).Append("** — ").AppendLine(isRejected && hasNotes ? "rejected and comment" : isRejected ? "rejected" : "comment");
                if (lineNotes is not null) foreach (string note in lineNotes) foreach (string line in note.Replace("\r", "").Split('\n')) output.Append("> ").AppendLine(line);
                int index = rows.FindIndex(r => r.Key == key);
                if (index < 0) output.AppendLine().AppendLine("(diff not loaded)").AppendLine();
                else
                {
                    output.AppendLine().AppendLine("```diff");
                    foreach (DiffRow row in rows.Skip(Math.Max(0, index - 2)).Take(5)) output.AppendLine(row.Text);
                    output.AppendLine("```").AppendLine();
                }
            }
        }
        return output.ToString().TrimEnd() + "\n";
    }

    private static int Number(JsonElement root, string name) => root.TryGetProperty(name, out JsonElement value) && value.TryGetInt32(out int number) ? number : 0;

    private static List<DiffRow> ParseRows(string diff)
    {
        List<DiffRow> rows = []; int oldLine = 0, newLine = 0;
        foreach (string raw in diff.Replace("\r", "").Split('\n'))
        {
            if (raw.StartsWith("@@", StringComparison.Ordinal))
            {
                string[] halves = raw.Split(' ');
                oldLine = Start(halves.FirstOrDefault(x => x.StartsWith('-'))); newLine = Start(halves.FirstOrDefault(x => x.StartsWith('+')));
                continue;
            }
            if (raw.StartsWith("diff ") || raw.StartsWith("index ") || raw.StartsWith("---") || raw.StartsWith("+++")) continue;
            if (raw.StartsWith('+')) rows.Add(new($"+{newLine++}", raw));
            else if (raw.StartsWith('-')) rows.Add(new($"-{oldLine++}", raw));
            else if (raw.StartsWith(' ')) { rows.Add(new($"+{newLine}", raw)); oldLine++; newLine++; }
        }
        return rows;
    }

    private static int Start(string? range) => int.TryParse(range?[1..].Split(',')[0], out int value) ? value : 0;
    private sealed record DiffRow(string? Key, string Text);
}
