using System.Text;
using System.Text.RegularExpressions;

namespace PowerGit.Engine;

/// <summary>
///  The review's PowerChannel channel (v0.21.2, docs/design/agent-review-rounds.md
///  §4): a session opened while PowerChannel is installed gets a channel; every
///  round, question and close is posted there (events as <c>powergit</c>, what
///  the owner does as <c>human</c>), and an agent's post that starts with
///  <c>c&lt;n&gt;:</c> becomes a reply on that comment. A board that fails never
///  fails the review: the error is logged and the review goes on.
/// </summary>
public sealed partial class GitHost
{
    private static readonly Regex ReplyPattern = new(@"^\s*(c[0-9]+)\s*:\s*(.+)$", RegexOptions.Compiled | RegexOptions.Singleline);
    public const string BoardEvents = "powergit";
    public const string BoardHuman = "human";

    /// <summary>PowerChannel's file; tests point it at a temporary one.</summary>
    public string BoardPath { get; set; } = PowerChannel.DefaultPath();

    private PowerChannel? Board() => PowerChannel.Open(BoardPath).Board;

    public PowerChannel.Status BoardStatus() => PowerChannel.Open(BoardPath).Status;

    private static string Short(string id) => id[..8];

    partial void BoardChannelFor(AgentReviewDto session, string? requested, ref string? board)
    {
        if (Board() is null) return;
        string? name = requested?.Trim().ToLowerInvariant();
        if (PowerChannel.IsName(name)) { board = name; return; }
        string repo = Path.GetFileName(RequireRoot().TrimEnd('/', '\\'));
        board = $"review-{PowerChannel.Slug(repo, 40)}-{session.Id[..4]}";
    }

    private void PostToBoard(AgentReviewDto session, string author, string text)
    {
        if (session.Board is null) return;
        try { Board()?.Post(author, session.Board, text); }
        catch (Exception ex) when (ex is Microsoft.Data.Sqlite.SqliteException or InvalidOperationException or IOException)
        {
            Console.Error.WriteLine($"[engine] board: could not post on {session.Board}: {ex.Message}");
        }
    }

    partial void AfterRoundOpened(AgentReviewDto session, AgentReviewRoundDto round)
    {
        StringBuilder text = new();
        int files = round.Files.Count, changes = round.Changes.Count;
        if (round.N == 1)
        {
            text.Append($"Round 1 opened · review {Short(session.Id)} · {files} file{S(files)}, {changes} change{S(changes)}\n{session.Title}");
            if (!string.IsNullOrWhiteSpace(session.Why)) text.Append('\n').Append(session.Why.Trim());
        }
        else
        {
            int carried = round.Changes.Count(c => c.Origin == "carried"), revised = round.Changes.Count(c => c.Origin == "revised"), fresh = round.Changes.Count(c => c.Origin == "new");
            text.Append($"Round {round.N} opened · review {Short(session.Id)} · {carried} unchanged, {revised} revised, {fresh} new, {round.Removed.Count} removed");
            if (round.Note is not null) text.Append('\n').Append(round.Note);
            foreach (AgentReviewThreadDto thread in session.Comments ?? [])
                if (thread.Replies.LastOrDefault() is { BoardId: null } reply && thread.Round == round.N - 1)
                    text.Append($"\n{thread.Id} answered: {reply.Body}");
        }
        if (round.N == 1) text.Append("\nReply with `cN: <answer>`; Markdown is shown.");
        text.Append($"\nreview_id={session.Id}");
        PostToBoard(session, BoardEvents, text.ToString());
    }

    partial void AfterRoundSent(AgentReviewDto session, AgentReviewRoundDto round) =>
        PostToBoard(session, BoardHuman, RoundText(session, round));

    /// <summary>The round as the agent reads it on the board (design §4.3).</summary>
    public static string RoundText(AgentReviewDto session, AgentReviewRoundDto round)
    {
        List<AgentReviewChangeDto> changes = [.. round.Changes];
        int Count(string verdict) => changes.Count(c => c.Verdict == verdict);
        List<AgentReviewThreadDto> comments = [.. (session.Comments ?? []).Where(c => c.Round == round.N && c.Kind == "round")];
        StringBuilder text = new($"Round {round.N} sent · review {Short(session.Id)} · {Count("accept")} accepted, {Count("reject")} rejected");
        if (Count("mixed") > 0) text.Append($", {Count("mixed")} mixed");
        text.Append($", {Count("undecided")} undecided, {comments.Count} comment{S(comments.Count)}");
        if (round.Note is not null) text.Append('\n').Append(round.Note);
        foreach (AgentReviewChangeDto change in changes.Where(c => c.Verdict != "accept"))
        {
            string mark = change.Verdict switch { "reject" => "✗", "mixed" => "~", _ => "?" };
            int line = change.NewLines > 0 ? change.NewStart : change.OldStart;
            List<AgentReviewThreadDto> on = [.. comments.Where(c => c.Change == change.Id)];
            if (on.Count == 0) text.Append($"\n{mark} {change.Id}  {change.Path}:{line}");
            foreach (AgentReviewThreadDto c in on) text.Append($"\n{mark} {change.Id}  {c.Path}:{c.Line[1..]}  {c.Id}  {c.Body}");
            if (change.RejectedLines is { Count: > 0 } rejected) text.Append($"\n  rejected lines: {string.Join(' ', rejected)}");
        }
        foreach (AgentReviewThreadDto c in comments.Where(c => c.Change is null || changes.Any(x => x.Id == c.Change && x.Verdict == "accept")))
            text.Append($"\n  {c.Id}  {c.Path}:{c.Line[1..]}  {c.Body}");
        List<string> accepted = [.. changes.Where(c => c.Verdict == "accept").Select(c => c.Id)];
        if (accepted.Count > 0) text.Append("\n✓ ").Append(string.Join(' ', accepted));
        text.Append($"\ndetails: agent_review_get review_id={session.Id} round={round.N}");
        return text.ToString();
    }

    partial void AfterAsk(AgentReviewDto session, AgentReviewThreadDto thread) =>
        PostToBoard(session, BoardHuman, $"{thread.Id} · {thread.Path}:{thread.Line[1..]}\n{thread.Body}");

    partial void AfterWithdraw(AgentReviewDto session, AgentReviewThreadDto thread) =>
        PostToBoard(session, BoardHuman, $"{thread.Id} withdrawn");

    partial void AfterClosed(AgentReviewDto session)
    {
        AgentReviewRoundDto? round = LatestRound(session);
        if (session.Status == "approved")
        {
            int accepted = round?.Changes.Count(c => c.Verdict == "accept") ?? 0, total = round?.Changes.Count ?? 0;
            PostToBoard(session, BoardHuman, $"Approved · review {Short(session.Id)} · round {round?.N ?? 1} · {accepted} of {total} changes accepted"
                + (session.Resolution?.Summary is { Length: > 0 } note ? "\n" + note : ""));
        }
        else if (session.Status == "cancelled" && session.Reason == "owner") PostToBoard(session, BoardHuman, $"Cancelled · review {Short(session.Id)}");
        else PostToBoard(session, BoardEvents, $"Review closed · {session.Status}" + (session.Reason is { } reason ? $" ({reason})" : ""));
    }

    private static string S(int n) => n == 1 ? "" : "s";

    /// <summary>The inbox's presence dot: each open review's agent's last read of its channel.
    ///  Static (v0.21.10) so the cross-repository list reads the same data without a host.</summary>
    private static void WithLastReads(AgentReviewSummaryDto[] summaries, List<AgentReviewDto> sessions, string boardPath)
    {
        if (!sessions.Any(s => s.Board is not null && s.Status == "pending")) return;
        PowerChannel? board = PowerChannel.Open(boardPath).Board;
        if (board is null) return;
        for (int i = 0; i < summaries.Length; i++)
        {
            AgentReviewDto s = sessions[i];
            string? agent = s.Agent?.Trim().ToLowerInvariant();
            if (s.Board is null || s.Status != "pending" || !PowerChannel.IsName(agent)) continue;
            try { if (board.LastRead(agent!, s.Board) is { } t) summaries[i] = summaries[i] with { LastRead = Iso(t) }; }
            catch (Microsoft.Data.Sqlite.SqliteException) { return; }
        }
    }

    /// <summary>
    ///  The channel's messages after <paramref name="after"/>, with the agent's
    ///  presence; replies (<c>c&lt;n&gt;: …</c>) from the agent are copied into the
    ///  review file on the way.
    /// </summary>
    public AgentReviewBoardDto GetAgentReviewBoard(string id, long after)
    {
        AgentReviewDto session = GetAgentReview(id) ?? throw new KeyNotFoundException("agent review session not found");
        (PowerChannel? board, PowerChannel.Status status) = PowerChannel.Open(BoardPath);
        if (session.Board is null || board is null)
            return new(false, session.Board, session.Board is null ? "this review has no board channel" : status.Reason, [], session.Agent, null, false);
        List<PowerChannel.Message> messages = board.Read(session.Board, after);
        foreach (PowerChannel.Message message in messages)
        {
            if (message.Author is BoardHuman or BoardEvents || message.Id <= session.BoardCursor) continue;
            if (ReplyPattern.Match(message.Text) is { Success: true } m)
                ReplyAgentReview(id, m.Groups[1].Value, message.Author, m.Groups[2].Value.Trim(), message.Id);
        }
        if (messages.Count > 0 && messages[^1].Id > session.BoardCursor)
        {
            lock (_agentReviewWriteGate)
            {
                AgentReviewDto latest = GetAgentReview(id)!;
                if (messages[^1].Id > latest.BoardCursor) WriteAgentReview(latest with { BoardCursor = messages[^1].Id }, bump: false);
            }
        }
        string? agent = session.Agent is { } a && PowerChannel.IsName(a.Trim().ToLowerInvariant()) ? a.Trim().ToLowerInvariant() : null;
        double? lastRead = agent is null ? null : board.LastRead(agent, session.Board);
        double now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() / 1000.0;
        return new(true, session.Board, null,
            [.. messages.Select(m => new BoardMessageDto(m.Id, m.Author, m.Text, Iso(m.Created)))],
            agent, lastRead is { } t ? Iso(t) : null, lastRead is { } r && now - r < 15);
    }

    public BoardMessageDto PostAgentReviewBoard(string id, string text)
    {
        AgentReviewDto session = GetAgentReview(id) ?? throw new KeyNotFoundException("agent review session not found");
        if (session.Board is null) throw new InvalidOperationException("this review has no board channel");
        PowerChannel board = Board() ?? throw new InvalidOperationException(BoardStatus().Reason ?? "powerchannel not available");
        PowerChannel.Message posted = board.Post(BoardHuman, session.Board, text);
        return new(posted.Id, posted.Author, posted.Text, Iso(posted.Created));
    }

    private static string Iso(double unixSeconds) =>
        DateTimeOffset.FromUnixTimeMilliseconds((long)(unixSeconds * 1000)).UtcDateTime.ToString("yyyy-MM-dd'T'HH:mm:ss.fff'Z'", System.Globalization.CultureInfo.InvariantCulture);
}
