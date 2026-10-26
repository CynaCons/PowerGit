using System.Text.Json;

namespace PowerGit.Engine.Mcp;

public sealed class McpTools(RepoRegistry registry)
{
    public static readonly string[] Names = ["agent_review_open", "agent_review_wait", "agent_review_get", "agent_review_list", "agent_review_cancel", "agent_review_close", "agent_review_revise", "agent_review_comment",
        "branch_plan_preview", "branch_plan_open", "branch_plan_wait", "branch_plan_get", "branch_plan_revise", "branch_plan_cancel", "branch_plan_pr"];

    private static readonly JsonSerializerOptions StepJson = new(JsonSerializerDefaults.Web);

    // v0.22.0: branch plans (docs/agents/mcp-agent-review.md "Branch plans").
    // A plan is an agent review of kind "plan"; these tools speak in steps.

    public object PlanPreview(JsonElement args)
    {
        GitHost host = Host(args, out _);
        return PreviewPayload(host.PreviewBranchPlan(Steps(args)));
    }

    public object PlanOpen(JsonElement args)
    {
        GitHost host = Host(args, out _);
        AgentReviewDto session = host.CreateBranchPlan(new(Required(args, "mode"), Required(args, "title"), String(args, "why"),
            String(args, "agent"), Steps(args), String(args, "board"), PlanExplanations(args), Prs(args)));
        return PlanPayload(host, session, false);
    }

    public async Task<object> PlanWait(JsonElement args, CancellationToken ct)
    {
        GitHost host = Host(args, out _);
        int timeout = args.TryGetProperty("timeout_ms", out JsonElement value) && value.TryGetInt32(out int parsed) ? parsed : 120_000;
        AgentReviewWaitDto waited = await host.WaitAgentReview(Required(args, "plan_id"), timeout, ct);
        return PlanPayload(host, waited.Session, waited.TimedOut);
    }

    public object PlanGet(JsonElement args)
    {
        GitHost host = Host(args, out _);
        AgentReviewDto session = host.GetAgentReview(Required(args, "plan_id")) ?? throw new KeyNotFoundException("branch plan not found");
        return PlanPayload(host, session, false);
    }

    public object PlanRevise(JsonElement args)
    {
        GitHost host = Host(args, out _);
        List<AgentReviewReplyRequest> replies = [];
        if (args.TryGetProperty("replies", out JsonElement list) && list.ValueKind == JsonValueKind.Array)
            foreach (JsonElement reply in list.EnumerateArray()) replies.Add(new(Required(reply, "comment"), Required(reply, "body")));
        IReadOnlyList<BranchPlanStepRequest>? steps = args.TryGetProperty("steps", out _) ? Steps(args) : null;
        AgentReviewDto session = host.ReviseBranchPlan(Required(args, "plan_id"), new(String(args, "note"), steps, replies, PlanExplanations(args), Prs(args)));
        return PlanPayload(host, session, false);
    }

    public object PlanCancel(JsonElement args)
    {
        GitHost host = Host(args, out _);
        AgentReviewDto session = host.ResolveAgentReview(Required(args, "plan_id"), new("cancel", null, String(args, "reason") ?? "agent"));
        return PlanPayload(host, session, false);
    }

    // v0.22.5: a pull request on any host, as the agent describes it.
    public object PlanPr(JsonElement args)
    {
        GitHost host = Host(args, out _);
        BranchPlanPrDto pr = JsonSerializer.Deserialize<BranchPlanPrDto>(args.GetRawText(), StepJson)!;
        AgentReviewDto session = host.SetBranchPlanPr(Required(args, "plan_id"), pr);
        return PlanPayload(host, session, false);
    }

    private static IReadOnlyList<BranchPlanPrDto>? Prs(JsonElement args)
    {
        if (!args.TryGetProperty("prs", out JsonElement list)) return null;
        if (list.ValueKind != JsonValueKind.Array) throw new InvalidOperationException("prs must be an array");
        return JsonSerializer.Deserialize<BranchPlanPrDto[]>(list.GetRawText(), StepJson);
    }

    private static IReadOnlyList<BranchPlanStepRequest> Steps(JsonElement args)
    {
        if (!args.TryGetProperty("steps", out JsonElement steps) || steps.ValueKind != JsonValueKind.Array) throw new InvalidOperationException("steps must be an array");
        return JsonSerializer.Deserialize<BranchPlanStepRequest[]>(steps.GetRawText(), StepJson) ?? [];
    }

    private static IReadOnlyList<BranchPlanExplainRequest>? PlanExplanations(JsonElement args)
    {
        if (!args.TryGetProperty("explanations", out JsonElement list)) return null;
        if (list.ValueKind != JsonValueKind.Array) throw new InvalidOperationException("explanations must be an array");
        return [.. list.EnumerateArray().Select(e => new BranchPlanExplainRequest(
            e.TryGetProperty("step", out JsonElement n) && n.TryGetInt32(out int step) ? step : 0, Required(e, "body")))];
    }

    private static object StepPayload(BranchPlanStepDto x) => new
    {
        x.N, x.Op, x.Text, x.Result, x.Because, x.Commands, x.Done,
        conflicts = x.Conflicts?.Select(c => c.Path),
    };

    private static object PreviewPayload(BranchPlanPreviewDto plan) => new
    {
        steps = plan.Steps.Select(StepPayload),
        branches_after = plan.Refs.Where(r => r.Kind is "local" or "tag").Select(r => new
        {
            name = r.Name, kind = r.Kind,
            at = r.At[^1].Node is { } node ? plan.Nodes.FirstOrDefault(x => x.Id == node) is { } n ? n.Sha ?? $"planned: {n.Subject}" : node : null,
        }),
        truncated = plan.Truncated,
    };

    private static object PlanPayload(GitHost host, AgentReviewDto session, bool timedOut)
    {
        if (session.Kind != "plan") throw new InvalidOperationException("this agent review is not a branch plan; use agent_review_get");
        AgentReviewDto state = host.WithBranchPlanState(session);
        AgentReviewRoundDto round = state.Rounds![^1];
        BranchPlanPreviewDto plan = round.Plan!;
        return new
        {
            plan_id = state.Id, state.Status, closed_at = state.ClosedAt, state.Mode, state.Title,
            round = round.N, rounds = state.Rounds!.Count, turn = GitHost.TurnOf(state), board = state.Board,
            timed_out = timedOut, note = round.Note, sent_at = round.SentAt,
            steps = plan.Steps.Select(StepPayload),
            moved = plan.Moved,
            prs = plan.Prs,
            comments = (state.Comments ?? []).Select(t => new
            {
                t.Id, t.Round, step = t.Path == "plan" && int.TryParse(t.Line.AsSpan(1), out int s) ? s : (int?)null, t.Body, t.Kind,
                author = t.Author ?? GitHost.BoardHuman,
                replies = t.Replies.Select(r => new { r.Author, r.Body, r.At }),
            }),
        };
    }

    public object Open(JsonElement args, CancellationToken ct)
    {
        GitHost host = Host(args, out _);
        string? baseSha = String(args, "base_sha"), headSha = String(args, "head_sha");
        bool worktree = Bool(args, "worktree");
        IReadOnlyList<AgentReviewFileDto>? files = Files(args);
        if (files is null && baseSha is not null && headSha is not null)
            files = ((CommitChangesDto)host.Compare(baseSha, headSha, null, ct: ct)).Files.Select(f => new AgentReviewFileDto(f.Path, f.Status, null)).ToArray();
        if (files is null && worktree)
        {
            RepoStatusDto status = host.GetStatus();
            files = status.Unstaged.Select(f => new AgentReviewFileDto(f.Path, f.Status, null)).ToArray();
        }
        AgentReviewDto session = host.CreateAgentReview(new(
            Required(args, "mode"), Required(args, "title"), String(args, "why"), String(args, "agent"),
            String(args, "branch") ?? host.Current?.Branch, baseSha, headSha, worktree, files, String(args, "board"),
            Explanations(args)), ct);
        return Payload(host, session, false, ct);
    }

    public async Task<object> Wait(JsonElement args, CancellationToken ct)
    {
        GitHost host = Host(args, out _);
        int timeout = args.TryGetProperty("timeout_ms", out JsonElement value) && value.TryGetInt32(out int parsed) ? parsed : 120_000;
        AgentReviewWaitDto waited = await host.WaitAgentReview(Required(args, "review_id"), timeout, ct);
        return Payload(host, waited.Session, waited.TimedOut, ct);
    }

    public object Get(JsonElement args, CancellationToken ct)
    {
        GitHost host = Host(args, out _);
        AgentReviewDto session = host.GetAgentReview(Required(args, "review_id")) ?? throw new KeyNotFoundException("agent review session not found");
        int? round = args.TryGetProperty("round", out JsonElement value) && value.TryGetInt32(out int parsed) ? parsed : null;
        return Payload(host, session, false, ct, round, Bool(args, "patches"));
    }

    /// <summary>
    ///  v0.21.14: a reviewer agent's comment on a line of the round the owner is
    ///  reviewing, or with reply_to its reply in a comment's conversation.
    /// </summary>
    public object Comment(JsonElement args)
    {
        GitHost host = Host(args, out _);
        string id = Required(args, "review_id");
        AgentReviewThreadDto thread = String(args, "reply_to") is { Length: > 0 } replyTo
            ? host.ReplyAgentReviewAsReviewer(id, Required(args, "reviewer"), replyTo, Required(args, "body"))
            : host.CommentAgentReviewAsReviewer(id, Required(args, "reviewer"), Required(args, "file"), Required(args, "line"), Required(args, "body"));
        return new
        {
            thread.Id, thread.Round, change = thread.Change, file = thread.Path, thread.Line, thread.Body, thread.Kind,
            author = thread.Author ?? GitHost.BoardHuman,
            replies = thread.Replies.Select(r => new { r.Author, r.Body, r.At }),
        };
    }

    /// <summary>v0.21.1: the agent's next round, with a reply per comment it answers.</summary>
    public object Revise(JsonElement args, CancellationToken ct)
    {
        GitHost host = Host(args, out _);
        List<AgentReviewReplyRequest> replies = [];
        if (args.TryGetProperty("replies", out JsonElement list))
        {
            if (list.ValueKind != JsonValueKind.Array) throw new InvalidOperationException("replies must be an array");
            foreach (JsonElement reply in list.EnumerateArray()) replies.Add(new(Required(reply, "comment"), Required(reply, "body")));
        }
        AgentReviewDto session = host.ReviseAgentReview(Required(args, "review_id"),
            new(String(args, "note"), replies, String(args, "head_sha"), Files(args), Explanations(args)), ct);
        return Payload(host, session, false, ct);
    }

    public object List(JsonElement args)
    {
        GitHost host = Host(args, out _);
        return new { sessions = host.ListAgentReviews().Sessions };
    }

    // v0.22.9: close any review; a pending one is cancelled, a finished one keeps its outcome.
    public object Close(JsonElement args, CancellationToken ct)
    {
        GitHost host = Host(args, out _);
        AgentReviewDto session = host.ResolveAgentReview(Required(args, "review_id"), new("close", null, String(args, "reason") ?? "agent"));
        return Payload(host, session, false, ct);
    }

    public object Cancel(JsonElement args, CancellationToken ct)
    {
        GitHost host = Host(args, out _);
        AgentReviewDto session = host.ResolveAgentReview(Required(args, "review_id"), new("cancel", null, String(args, "reason") ?? "agent"));
        return Payload(host, session, false, ct);
    }

    private GitHost Host(JsonElement args, out string root)
    {
        root = Required(args, "repo_path");
        if (!Path.IsPathFullyQualified(root)) throw new InvalidOperationException("repo_path must be absolute");
        // A session already open for this root (the common case: the agent
        // calls open, then wait, then get) is reused without the probe open
        // (three git processes and a fresh watcher per call otherwise).
        GitHost? open = registry.Get(GitHost.IdFor(root));
        if (open is not null) return open;
        try
        {
            RepoInfo info = registry.Open(root);
            return registry.Get(info.Id) ?? throw new InvalidOperationException($"repository could not be opened: {root}");
        }
        catch (Exception ex) when (ex is DirectoryNotFoundException or InvalidOperationException)
        {
            throw new InvalidOperationException($"not a repository: {root} ({ex.Message})");
        }
    }

    private static object Payload(GitHost host, AgentReviewDto session, bool timedOut, CancellationToken ct, int? roundNumber = null, bool patches = false)
    {
        if (session.Rounds is { Count: > 0 }) return RoundPayload(host, session, timedOut, roundNumber, patches);
        Dictionary<string, string> diffs = [];
        foreach (AgentReviewFileDto file in session.Files)
        {
            try { diffs[file.Path] = file.Patch ?? host.GetAgentReviewDiff(session.Id, file.Path, ct).Text; }
            catch (Exception ex) when (ex is InvalidOperationException or KeyNotFoundException) { }
        }
        string root = host.Current!.Root;
        string sessionFile = Path.Combine(root, GitHost.AgentReviewsDirectory, session.Id + ".json");
        string reviewFile = Path.Combine(root, GitHost.ReviewsDirectory, session.Id + ".json");
        string? review = host.ReadReview(session.Id);
        return new
        {
            review_id = session.Id, session.Status, closed_at = session.ClosedAt, session.Mode, session.Title,
            timed_out = timedOut,
            summary_note = session.Resolution?.Summary,
            comments = session.Resolution?.Comments ?? [],
            session_file = sessionFile,
            review_file = reviewFile,
            export_markdown = ReviewMarkdown.Render(session, review, diffs),
        };
    }

    /// <summary>
    ///  A session with rounds (design §5): the round (the latest, or the one
    ///  asked for), whose turn it is, each change with its verdict and line
    ///  ranges, the changes the round removed, and every comment thread.
    /// </summary>
    private static object RoundPayload(GitHost host, AgentReviewDto session, bool timedOut, int? roundNumber, bool patches)
    {
        AgentReviewRoundDto round = roundNumber is null ? session.Rounds![^1]
            : session.Rounds!.FirstOrDefault(r => r.N == roundNumber) ?? throw new InvalidOperationException($"no round {roundNumber}");
        string root = host.Current!.Root;
        string key = GitHost.RoundKey(session.Id, round.N);
        Dictionary<string, string> diffs = round.Files.Where(f => f.Patch is not null).ToDictionary(f => f.Path, f => f.Patch!);
        static int[] Span(int start, int count) => [start, start + Math.Max(count, 1) - 1];
        return new
        {
            review_id = session.Id, session.Status, closed_at = session.ClosedAt, session.Mode, session.Title,
            round = round.N,
            rounds = session.Rounds!.Count,
            turn = GitHost.TurnOf(session),
            board = session.Board,
            timed_out = timedOut,
            note = round.Note,
            sent_at = round.SentAt,
            changes = round.Changes.Select(c => new
            {
                c.Id, file = c.Path, c.Origin, c.From,
                old_lines = Span(c.OldStart, c.OldLines), new_lines = Span(c.NewStart, c.NewLines),
                c.Verdict, rejected_lines = c.RejectedLines,
            }),
            removed = round.Removed,
            // v0.21.14: a reviewer reads the round's patches to comment on its lines.
            files = patches ? round.Files.Select(f => new { file = f.Path, f.Status, f.Patch }) : null,
            comments = (session.Comments ?? []).Select(t => new
            {
                t.Id, t.Round, change = t.Change, file = t.Path, t.Line, t.Body, t.Kind,
                author = t.Author ?? GitHost.BoardHuman,
                replies = t.Replies.Select(r => new { r.Author, r.Body, r.At }),
            }),
            session_file = Path.Combine(root, GitHost.AgentReviewsDirectory, session.Id + ".json"),
            review_file = Path.Combine(root, GitHost.ReviewsDirectory, key + ".json"),
            export_markdown = ReviewMarkdown.Render(session, host.ReadReview(key), diffs),
        };
    }

    private static IReadOnlyList<AgentReviewFileDto>? Files(JsonElement args)
    {
        if (!args.TryGetProperty("files", out JsonElement files)) return null;
        if (files.ValueKind != JsonValueKind.Array) throw new InvalidOperationException("files must be an array");
        return [.. files.EnumerateArray().Select(file => new AgentReviewFileDto(
            Required(file, "path"), String(file, "status") ?? "M", String(file, "patch")))];
    }

    /// <summary>v0.21.17: <c>explanations: [{ file, line, body }]</c>, the author's word on its changes.</summary>
    private static IReadOnlyList<AgentReviewExplainRequest>? Explanations(JsonElement args)
    {
        if (!args.TryGetProperty("explanations", out JsonElement list)) return null;
        if (list.ValueKind != JsonValueKind.Array) throw new InvalidOperationException("explanations must be an array");
        return [.. list.EnumerateArray().Select(e => new AgentReviewExplainRequest(
            String(e, "file") ?? String(e, "path"), Required(e, "line"), Required(e, "body")))];
    }

    private static string Required(JsonElement value, string name) => String(value, name) is { Length: > 0 } text ? text : throw new InvalidOperationException($"{name} is required");
    private static string? String(JsonElement value, string name) => value.TryGetProperty(name, out JsonElement item) && item.ValueKind == JsonValueKind.String ? item.GetString() : null;
    private static bool Bool(JsonElement value, string name) => value.TryGetProperty(name, out JsonElement item) && item.ValueKind == JsonValueKind.True;
}
