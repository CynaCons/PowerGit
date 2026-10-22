namespace PowerGit.Engine;

/// <summary>
///  Reviewer agents (v0.21.14, owner: "other agents to plug into a review and
///  drop comments … reviews mixing both agents and humans together on the same
///  review"). Any agent other than the owner can comment on a line of the round
///  the owner is reviewing, and reply in any conversation. A reviewer's comment
///  is a "round" thread with its name as author: it goes to the author agent
///  with the round, like the owner's comments, unless the owner dismisses it
///  first. Verdicts, sending and approval stay the owner's. Each comment and
///  reply is also posted on the review's board under the reviewer's name.
/// </summary>
public sealed partial class GitHost
{
    /// <summary>A reviewer's name: a powerchannel name, never the owner's or PowerGit's own.</summary>
    private static string ReviewerName(string? reviewer)
    {
        string name = reviewer?.Trim().ToLowerInvariant() ?? "";
        if (!PowerChannel.IsName(name) || name is BoardHuman or BoardEvents)
            throw new InvalidOperationException("reviewer must be a short name such as codex-review (letters, digits, . _ -)");
        return name;
    }

    /// <summary>A reviewer's comment on a line of the latest round, while the owner is reviewing it.</summary>
    public AgentReviewThreadDto CommentAgentReviewAsReviewer(string id, string? reviewer, string? path, string? line, string? body)
    {
        string name = ReviewerName(reviewer);
        string text = Clean(body) ?? throw new InvalidOperationException("body is required");
        if (!System.Text.RegularExpressions.Regex.IsMatch(line ?? "", "^[+-][0-9]+$")) throw new InvalidOperationException("line must look like +12 or -12");
        lock (_agentReviewWriteGate)
        {
            AgentReviewDto session = RequireV2Pending(id);
            AgentReviewRoundDto round = LatestRound(session)!;
            if (round.SentAt is not null)
                throw new AgentReviewStateException($"round {round.N} was sent to the author; comment on round {round.N + 1} when it opens");
            if (round.Files.All(f => f.Path != path)) throw new InvalidOperationException($"path is not in round {round.N}: {path}");
            AgentReviewThreadDto thread = new($"c{NextCommentId(session)}", round.N, ChangeOf(round, path!, line!), path!, line!, text, "round", Timestamp(), [], name);
            AgentReviewDto updated = session with { Comments = [.. session.Comments ?? [], thread], UpdatedAt = Timestamp() };
            PostAsReviewer(updated, name, $"{thread.Id} · {thread.Path}:{thread.Line[1..]}\n{text}");
            WriteAgentReview(updated);
            return thread;
        }
    }

    /// <summary>A reviewer's reply in a conversation, at any time while the review is open.</summary>
    public AgentReviewThreadDto ReplyAgentReviewAsReviewer(string id, string? reviewer, string comment, string? body)
    {
        string name = ReviewerName(reviewer);
        string text = Clean(body) ?? throw new InvalidOperationException("body is required");
        lock (_agentReviewWriteGate)
        {
            AgentReviewDto session = RequireV2Pending(id);
            List<AgentReviewThreadDto> threads = [.. session.Comments ?? []];
            int at = threads.FindIndex(t => t.Id == comment);
            if (at < 0) throw new KeyNotFoundException($"no comment {comment}");
            if (threads[at].Kind == "withdrawn") throw new AgentReviewStateException($"{comment} was withdrawn");
            // Posted as "cN: …", the shape the board's intake reads as a reply; the board id keeps it from landing twice.
            long? boardId = PostAsReviewer(session, name, $"{comment}: {text}");
            threads[at] = threads[at] with { Replies = [.. threads[at].Replies, new(name, text, Timestamp(), boardId)] };
            WriteAgentReview(session with { Comments = threads, UpdatedAt = Timestamp() });
            return threads[at];
        }
    }

    /// <summary>A reviewer's post on the review's board; null when there is no board or it failed.</summary>
    private long? PostAsReviewer(AgentReviewDto session, string reviewer, string text)
    {
        if (session.Board is null) return null;
        try { return Board()?.Post(reviewer, session.Board, text).Id; }
        catch (Exception ex) when (ex is Microsoft.Data.Sqlite.SqliteException or InvalidOperationException or IOException)
        {
            Console.Error.WriteLine($"[engine] board: could not post on {session.Board}: {ex.Message}");
            return null;
        }
    }
}
