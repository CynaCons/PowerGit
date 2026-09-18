using System.Text.Json;

namespace PowerGit.Engine.Mcp;

public sealed class McpTools(RepoRegistry registry)
{
    public static readonly string[] Names = ["agent_review_open", "agent_review_wait", "agent_review_get", "agent_review_list", "agent_review_cancel"];

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
            String(args, "branch") ?? host.Current?.Branch, baseSha, headSha, worktree, files));
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
        return Payload(host, session, false, ct);
    }

    public object List(JsonElement args)
    {
        GitHost host = Host(args, out _);
        return new { sessions = host.ListAgentReviews().Sessions };
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

    private static object Payload(GitHost host, AgentReviewDto session, bool timedOut, CancellationToken ct)
    {
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
            review_id = session.Id, session.Status, session.Mode, session.Title,
            timed_out = timedOut,
            summary_note = session.Resolution?.Summary,
            comments = session.Resolution?.Comments ?? [],
            session_file = sessionFile,
            review_file = reviewFile,
            export_markdown = ReviewMarkdown.Render(session, review, diffs),
        };
    }

    private static IReadOnlyList<AgentReviewFileDto>? Files(JsonElement args)
    {
        if (!args.TryGetProperty("files", out JsonElement files)) return null;
        if (files.ValueKind != JsonValueKind.Array) throw new InvalidOperationException("files must be an array");
        return [.. files.EnumerateArray().Select(file => new AgentReviewFileDto(
            Required(file, "path"), String(file, "status") ?? "M", String(file, "patch")))];
    }

    private static string Required(JsonElement value, string name) => String(value, name) is { Length: > 0 } text ? text : throw new InvalidOperationException($"{name} is required");
    private static string? String(JsonElement value, string name) => value.TryGetProperty(name, out JsonElement item) && item.ValueKind == JsonValueKind.String ? item.GetString() : null;
    private static bool Bool(JsonElement value, string name) => value.TryGetProperty(name, out JsonElement item) && item.ValueKind == JsonValueKind.True;
}
