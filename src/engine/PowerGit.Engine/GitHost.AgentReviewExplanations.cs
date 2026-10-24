namespace PowerGit.Engine;

/// <summary>
///  The author's explanations (v0.21.17, owner: "When agents open the review,
///  i want them to have the posibility to drop "explanatory comments"
///  justifying the changes. These would then be commented by me and the agents
///  further"). With a round (open or revise) the author agent may explain
///  changes on lines of that round's diff. Each becomes a thread of kind
///  "explain" with the agent as author: a conversation under its line that the
///  owner replies to (on the board, like any conversation) and reviewer agents
///  reply to. It is the author's own word, so it never goes back to the author
///  with the round, cannot be dismissed, and carries into later rounds like
///  every conversation.
/// </summary>
public sealed partial class GitHost
{
    /// <summary>The session's threads with the round's explanations added; a bad one refuses the whole call.</summary>
    private static List<AgentReviewThreadDto> WithExplanations(AgentReviewDto session, AgentReviewRoundDto round,
        IReadOnlyList<AgentReviewExplainRequest>? explanations)
    {
        List<AgentReviewThreadDto> threads = [.. session.Comments ?? []];
        if (explanations is not { Count: > 0 }) return threads;
        string author = session.Agent?.Trim() is { Length: > 0 } agent ? agent : "agent";
        int next = NextCommentId(session);
        foreach (AgentReviewExplainRequest e in explanations)
        {
            string body = Clean(e.Body) ?? throw new InvalidOperationException("an explanation needs a body");
            string path = e.Path?.Trim().Replace('\\', '/') ?? "";
            string line = e.Line?.Trim() ?? "";
            if (!System.Text.RegularExpressions.Regex.IsMatch(line, "^[+-][0-9]+$"))
                throw new InvalidOperationException($"explanation line must look like +12 or -12: {e.Line}");
            if (round.Files.All(f => f.Path != path)) throw new InvalidOperationException($"explanation path is not in round {round.N}: {path}");
            string change = ChangeOf(round, path, line) ?? throw new InvalidOperationException($"explanation line {line} is not in the diff of {path}");
            threads.Add(new($"c{next++}", round.N, change, path, line, body, "explain", Timestamp(), [], author));
        }
        return threads;
    }
}
