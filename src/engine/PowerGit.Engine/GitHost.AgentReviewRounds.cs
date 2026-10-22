using System.Text.Json.Nodes;

namespace PowerGit.Engine;

/// <summary>
///  Agent review rounds (v0.21.1, docs/design/agent-review-rounds.md): a
///  session version 2 is a list of rounds. Each round captures its patch when
///  it opens, so an earlier round stays readable after the agent edits the
///  worktree; its changes (hunks) carry ids that survive the next round when
///  the change does; the owner's v0.19 line marks for a round live under the
///  review key <c>&lt;id&gt;</c> (round 1) or <c>&lt;id&gt;-r&lt;n&gt;</c>, and a change's
///  verdict is read from them when the round is sent. The agent drives:
///  open → the owner sends the round → revise → … → approve or cancel.
/// </summary>
public sealed partial class GitHost
{
    /// <summary>Serialises every read-modify-write of a session file (HTTP and MCP share them).</summary>
    private readonly object _agentReviewWriteGate = new();

    public static string RoundKey(string id, int n) => n <= 1 ? id : $"{id}-r{n}";

    /// <summary>The latest round; a version-1 session reads as one round over its live diff.</summary>
    public static AgentReviewRoundDto? LatestRound(AgentReviewDto session) =>
        session.Rounds is { Count: > 0 } rounds ? rounds[^1] : null;

    /// <summary>"user" while the latest round waits for the owner, "agent" once it is sent; null when closed.</summary>
    public static string? TurnOf(AgentReviewDto session)
    {
        if (session.Status != "pending") return null;
        AgentReviewRoundDto? round = LatestRound(session);
        return round?.SentAt is null ? "user" : "agent";
    }

    private AgentReviewRoundDto OpenRound(int n, string? baseSha, string? headSha, bool worktree,
        IReadOnlyList<AgentReviewFileDto> files, IReadOnlyList<AgentReviewHunks.Previous> previous,
        ref int nextId, CancellationToken ct)
    {
        List<AgentReviewFileDto> captured = [];
        List<AgentReviewHunks.Hunk> hunks = [];
        foreach (AgentReviewFileDto file in files)
        {
            string patch = file.Patch ?? CapturePatch(baseSha, headSha, worktree, file.Path, file.Status, ct);
            captured.Add(file with { Patch = patch });
            hunks.AddRange(AgentReviewHunks.Parse(file.Path, patch));
        }
        (List<AgentReviewChangeDto> changes, List<string> removed) = AgentReviewHunks.Match(previous, hunks, ref nextId);
        return new(n, Timestamp(), null, null, captured, changes, removed);
    }

    /// <summary>
    ///  The diff of one file as the round sees it: <c>base..head</c>, or the
    ///  worktree against <c>base</c> (HEAD when none). An untracked file has no
    ///  git diff; its text becomes an all-added patch.
    /// </summary>
    private string CapturePatch(string? baseSha, string? headSha, bool worktree, string path, string status, CancellationToken ct)
    {
        try
        {
            string text = "";
            if (baseSha is not null && headSha is not null) text = ((DiffDto)Compare(baseSha, headSha, path, ct: ct)).Text;
            else if (worktree || baseSha is not null || headSha is not null) text = ((DiffDto)Compare(baseSha ?? headSha ?? "HEAD", null, path, ct: ct)).Text;
            if (text.Contains("@@", StringComparison.Ordinal)) return text;
            if (worktree && status is "A" or "?") return UntrackedPatch(path) ?? text;
            return text;
        }
        catch (InvalidOperationException) { return ""; }
    }

    private string? UntrackedPatch(string path)
    {
        string full = ResolveInRoot(RequireRoot(), path);
        if (!File.Exists(full)) return null;
        string content = File.ReadAllText(full);
        if (content.Contains('\0')) return null;
        string[] lines = content.Replace("\r\n", "\n").Split('\n');
        if (lines.Length > 0 && lines[^1].Length == 0) lines = lines[..^1];
        System.Text.StringBuilder patch = new();
        patch.Append("diff --git a/").Append(path).Append(" b/").Append(path).Append('\n')
            .Append("new file mode 100644\n--- /dev/null\n+++ b/").Append(path).Append('\n')
            .Append("@@ -0,0 +1,").Append(lines.Length).Append(" @@\n");
        foreach (string line in lines) patch.Append('+').Append(line).Append('\n');
        return patch.ToString();
    }

    /// <summary>The files a worktree review covers now: tracked changes against
    ///  <paramref name="from"/> plus untracked files (the v0.20 open used the
    ///  unstaged list; a revise must also see what the agent staged).</summary>
    private List<AgentReviewFileDto> WorktreeFiles(string from, CancellationToken ct)
    {
        Dictionary<string, AgentReviewFileDto> files = [];
        foreach (FileChangeDto f in ((CommitChangesDto)Compare(from, null, null, ct: ct)).Files) files[f.Path] = new(f.Path, NormalStatus(f.Status), null);
        CommandResult untracked = RunTimed(RequireRoot(), 30_000, ct, ["-c", "core.quotepath=false", "ls-files", "--others", "--exclude-standard", "-z"]);
        if (untracked.ExitCode == 0)
            foreach (string path in untracked.StdOut.Split('\0', StringSplitOptions.RemoveEmptyEntries)) files.TryAdd(path, new(path, "A", null));
        return [.. files.Values.OrderBy(f => f.Path, StringComparer.Ordinal)];
    }

    private static string NormalStatus(string status) => status is "M" or "A" or "D" or "R" or "T" ? status : status == "C" ? "A" : "M";

    private static int NextChangeId(AgentReviewDto session) =>
        1 + (session.Rounds ?? []).SelectMany(r => r.Changes).Select(c => int.TryParse(c.Id.AsSpan(1), out int n) ? n : 0).DefaultIfEmpty(0).Max();

    private static int NextCommentId(AgentReviewDto session) =>
        1 + (session.Comments ?? []).Select(c => int.TryParse(c.Id.AsSpan(1), out int n) ? n : 0).DefaultIfEmpty(0).Max();

    private JsonNode? ReadReviewNode(string key)
    {
        try { return ReadReview(key) is { } text ? JsonNode.Parse(text) : null; }
        catch (System.Text.Json.JsonException) { return null; }
    }

    /// <summary>The round with each change's verdict read from the owner's marks.</summary>
    private AgentReviewRoundDto StampVerdicts(AgentReviewDto session, AgentReviewRoundDto round)
    {
        JsonNode? doc = ReadReviewNode(RoundKey(session.Id, round.N));
        Dictionary<string, List<AgentReviewHunks.Hunk>> byPath = round.Files.ToDictionary(f => f.Path, f => AgentReviewHunks.Parse(f.Path, f.Patch));
        List<AgentReviewChangeDto> changes = [];
        foreach (AgentReviewChangeDto change in round.Changes)
        {
            AgentReviewHunks.Hunk? hunk = byPath.GetValueOrDefault(change.Path)?.FirstOrDefault(h => h.Hash == change.Hash && h.OldStart == change.OldStart && h.NewStart == change.NewStart);
            if (hunk is null) { changes.Add(change); continue; }
            (string verdict, List<string>? rejected) = AgentReviewHunks.Verdict(hunk.Keys, AgentReviewHunks.Marks(doc, change.Path));
            changes.Add(change with { Verdict = verdict, RejectedLines = rejected });
        }
        return round with { Changes = changes };
    }

    /// <summary>The comments of the round's review file that are not threads yet become
    ///  "round" threads, each on the change that holds its line.</summary>
    private List<AgentReviewThreadDto> CollectRoundComments(AgentReviewDto session, AgentReviewRoundDto round)
    {
        List<AgentReviewThreadDto> threads = [.. session.Comments ?? []];
        int next = NextCommentId(session);
        JsonNode? doc = ReadReviewNode(RoundKey(session.Id, round.N));
        foreach ((string path, string line, string text) in AgentReviewHunks.Comments(doc))
        {
            if (threads.Any(t => t.Round == round.N && t.Path == path && t.Line == line && t.Body == text)) continue;
            threads.Add(new($"c{next++}", round.N, ChangeOf(round, path, line), path, line, text, "round", Timestamp(), []));
        }
        return threads;
    }

    private static string? ChangeOf(AgentReviewRoundDto round, string path, string line)
    {
        AgentReviewFileDto? file = round.Files.FirstOrDefault(f => f.Path == path);
        if (file is null) return null;
        AgentReviewHunks.Hunk? hunk = AgentReviewHunks.Parse(path, file.Patch).FirstOrDefault(h => h.Keys.Contains(line));
        if (hunk is null)
        {
            // A comment on a context line belongs to the hunk around it.
            int n = int.TryParse(line.AsSpan(1), out int v) ? v : -1;
            hunk = AgentReviewHunks.Parse(path, file.Patch).FirstOrDefault(h => line[0] == '+'
                ? n >= h.NewStart && n < h.NewStart + Math.Max(h.NewLines, 1)
                : n >= h.OldStart && n < h.OldStart + Math.Max(h.OldLines, 1));
        }
        return hunk is null ? null : round.Changes.FirstOrDefault(c => c.Path == path && c.Hash == hunk.Hash && c.NewStart == hunk.NewStart)?.Id;
    }

    /// <summary>
    ///  The owner sends the round back: verdicts stamped from the marks, the
    ///  review file's comments become threads, the note is kept, and the
    ///  agent's wait wakes. The session stays pending; it is the agent's turn.
    /// </summary>
    public AgentReviewDto SendAgentReviewRound(string id, string? note)
    {
        lock (_agentReviewWriteGate)
        {
            AgentReviewDto session = RequireV2Pending(id);
            AgentReviewRoundDto round = LatestRound(session)!;
            if (round.SentAt is not null) throw new AgentReviewStateException($"round {round.N} was already sent");
            AgentReviewRoundDto sent = StampVerdicts(session, round) with { SentAt = Timestamp(), Note = Clean(note) };
            AgentReviewDto updated = session with
            {
                Rounds = [.. session.Rounds!.Take(session.Rounds!.Count - 1), sent],
                Comments = CollectRoundComments(session, sent),
                UpdatedAt = Timestamp(),
            };
            WriteAgentReview(updated);
            AfterRoundSent(updated, sent);
            return updated;
        }
    }

    /// <summary>
    ///  The agent's next round: the files as they are now (or as given), the
    ///  changes matched against the previous round, the owner's marks on
    ///  carried changes moved across, and the agent's replies on the threads.
    /// </summary>
    public AgentReviewDto ReviseAgentReview(string id, AgentReviewReviseRequest req, CancellationToken ct)
    {
        lock (_agentReviewWriteGate)
        {
            AgentReviewDto session = RequireV2Pending(id);
            AgentReviewRoundDto previous = LatestRound(session)!;
            string? head = string.IsNullOrWhiteSpace(req.Head) ? session.Head : req.Head.Trim();
            IReadOnlyList<AgentReviewFileDto> files = req.Files is { Count: > 0 }
                ? ValidateAgentReviewRequest(new(session.Mode, session.Title, null, null, null, null, null, null, req.Files)).Files!
                : session.Base is not null && head is not null
                    ? [.. ((CommitChangesDto)Compare(session.Base, head, null, ct: ct)).Files.Select(f => new AgentReviewFileDto(f.Path, NormalStatus(f.Status), null))]
                    : session.Worktree ? WorktreeFiles(session.Base ?? "HEAD", ct) : previous.Files.Select(f => f with { Patch = null }).ToList();
            List<AgentReviewHunks.Previous> before = [];
            foreach (AgentReviewFileDto file in previous.Files)
                foreach (AgentReviewHunks.Hunk hunk in AgentReviewHunks.Parse(file.Path, file.Patch))
                    if (previous.Changes.FirstOrDefault(c => c.Path == hunk.Path && c.Hash == hunk.Hash && c.NewStart == hunk.NewStart) is { } change)
                        before.Add(new(change, hunk));
            int nextId = NextChangeId(session);
            AgentReviewRoundDto round = OpenRound(previous.N + 1, session.Base, head, session.Worktree, files, before, ref nextId, ct);
            round = round with { Note = Clean(req.Note) };

            // The owner's marks on carried changes follow them into the new round.
            List<(AgentReviewHunks.Hunk, AgentReviewHunks.Hunk)> carried = [];
            foreach (AgentReviewChangeDto change in round.Changes.Where(c => c.Origin == "carried"))
            {
                AgentReviewHunks.Previous? old = before.FirstOrDefault(p => p.Change.Id == change.Id);
                AgentReviewHunks.Hunk? now = AgentReviewHunks.Parse(change.Path, round.Files.First(f => f.Path == change.Path).Patch)
                    .FirstOrDefault(h => h.Hash == change.Hash && h.NewStart == change.NewStart);
                if (old is not null && now is not null) carried.Add((old.Hunk, now));
            }
            if (carried.Count > 0) WriteReview(RoundKey(id, round.N), AgentReviewHunks.CarryMarks(RoundKey(id, round.N), ReadReviewNode(RoundKey(id, previous.N)), carried));

            List<AgentReviewThreadDto> threads = [.. session.Comments ?? []];
            foreach (AgentReviewReplyRequest reply in req.Replies ?? [])
            {
                int at = threads.FindIndex(t => t.Id == reply.Comment);
                if (at < 0 || string.IsNullOrWhiteSpace(reply.Body)) continue;
                threads[at] = threads[at] with { Replies = [.. threads[at].Replies, new(session.Agent ?? "agent", reply.Body.Trim(), Timestamp(), null)] };
            }
            AgentReviewDto updated = session with
            {
                Rounds = [.. session.Rounds!, round],
                Files = round.Files,
                Head = head,
                Comments = threads,
                Unread = true,
                UpdatedAt = Timestamp(),
            };
            WriteAgentReview(updated);
            AfterRoundOpened(updated, round);
            return updated;
        }
    }

    /// <summary>A comment posted at once (Ask now): a thread of kind "ask" on the round.</summary>
    public AgentReviewThreadDto AskAgentReview(string id, AgentReviewAskRequest req)
    {
        lock (_agentReviewWriteGate)
        {
            AgentReviewDto session = RequireV2Pending(id);
            AgentReviewRoundDto round = session.Rounds!.FirstOrDefault(r => r.N == req.Round) ?? throw new InvalidOperationException($"no round {req.Round}");
            string body = Clean(req.Body) ?? throw new InvalidOperationException("body is required");
            if (!System.Text.RegularExpressions.Regex.IsMatch(req.Line ?? "", "^[+-][0-9]+$")) throw new InvalidOperationException("line must look like +12 or -12");
            if (round.Files.All(f => f.Path != req.Path)) throw new InvalidOperationException($"path is not in round {round.N}: {req.Path}");
            AgentReviewThreadDto thread = new($"c{NextCommentId(session)}", round.N, ChangeOf(round, req.Path, req.Line!), req.Path, req.Line!, body, "ask", Timestamp(), []);
            AgentReviewDto updated = session with { Comments = [.. session.Comments ?? [], thread], UpdatedAt = Timestamp() };
            WriteAgentReview(updated);
            AfterAsk(updated, thread);
            return thread;
        }
    }

    /// <summary>
    ///  v0.21.12: the owner takes back a question asked on the board while its round is
    ///  still open. The thread stays, as kind "withdrawn", so its id is never reused.
    ///  v0.21.14: the same for a reviewer agent's comment the owner dismisses before
    ///  the round goes to the author.
    /// </summary>
    public AgentReviewThreadDto WithdrawAgentReviewComment(string id, string comment)
    {
        lock (_agentReviewWriteGate)
        {
            AgentReviewDto session = RequireV2Pending(id);
            List<AgentReviewThreadDto> threads = [.. session.Comments ?? []];
            int at = threads.FindIndex(t => t.Id == comment);
            if (at < 0) throw new KeyNotFoundException($"no comment {comment}");
            AgentReviewRoundDto? round = session.Rounds!.FirstOrDefault(r => r.N == threads[at].Round);
            bool reviewer = threads[at].Author is not null && threads[at].Kind == "round";
            if ((threads[at].Kind != "ask" && !reviewer) || round is null || round.N != LatestRound(session)!.N || round.SentAt is not null)
                throw new AgentReviewStateException($"{comment} can no longer be withdrawn");
            threads[at] = threads[at] with { Kind = "withdrawn" };
            AgentReviewDto updated = session with { Comments = threads, UpdatedAt = Timestamp() };
            WriteAgentReview(updated);
            AfterWithdraw(updated, threads[at]);
            return threads[at];
        }
    }

    /// <summary>A reply from the agent on a thread (from the board, v0.21.2).</summary>
    public AgentReviewDto? ReplyAgentReview(string id, string comment, string author, string body, long? boardId)
    {
        lock (_agentReviewWriteGate)
        {
            AgentReviewDto? session = GetAgentReview(id);
            if (session?.Comments is null) return null;
            List<AgentReviewThreadDto> threads = [.. session.Comments];
            int at = threads.FindIndex(t => t.Id == comment);
            if (at < 0) return null;
            if (boardId is not null && threads[at].Replies.Any(r => r.BoardId == boardId)) return session;
            threads[at] = threads[at] with { Replies = [.. threads[at].Replies, new(author, body, Timestamp(), boardId)] };
            AgentReviewDto updated = session with { Comments = threads, UpdatedAt = Timestamp() };
            WriteAgentReview(updated);
            return updated;
        }
    }

    private AgentReviewDto RequireV2Pending(string id)
    {
        AgentReviewDto session = GetAgentReview(id) ?? throw new KeyNotFoundException("agent review session not found");
        if (session.Rounds is not { Count: > 0 }) throw new AgentReviewStateException("this review has no rounds (opened before v0.21)");
        if (session.Status != "pending") throw new AgentReviewStateException("agent review session is not pending");
        return session;
    }

    private static string? Clean(string? text) => string.IsNullOrWhiteSpace(text) ? null : text.Trim();

    // The board (v0.21.2) hooks in here; until then rounds work without it.
    partial void AfterRoundOpened(AgentReviewDto session, AgentReviewRoundDto round);
    partial void AfterRoundSent(AgentReviewDto session, AgentReviewRoundDto round);
    partial void AfterAsk(AgentReviewDto session, AgentReviewThreadDto thread);
    partial void AfterWithdraw(AgentReviewDto session, AgentReviewThreadDto thread);
    partial void AfterClosed(AgentReviewDto session);
}
