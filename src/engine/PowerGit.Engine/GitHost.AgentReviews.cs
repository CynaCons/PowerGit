using System.Security.Cryptography;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Text.RegularExpressions;

namespace PowerGit.Engine;

/// <summary>
///  Agent review sessions (v0.20.0, M2 of the MCP Agent Review Bridge): a
///  coding agent opens one for a patch it wants the owner's eyes on; the
///  inbox lists it, the owner reviews it with the v0.19 review mode and
///  resolves it; in Wait mode the agent's tool long-polls until then. One
///  JSON per session under <see cref="AgentReviewsDirectory"/>; the id is
///  also the review key of the owner's marks and comments
///  (<c>.powergit/reviews/&lt;id&gt;.json</c>), so "Request changes" copies
///  that file's comments into the resolution. The M3 MCP host calls these
///  methods in-process; the HTTP routes are the inbox's door. The engine
///  never auto-approves: a timed-out wait answers pending + timedOut.
/// </summary>
public sealed partial class GitHost
{
    /// <summary>Where the sessions live, relative to the root; one constant like <see cref="ReviewsDirectory"/>.</summary>
    public const string AgentReviewsDirectory = ".powergit/agent-reviews";
    private static readonly Regex AgentReviewIdPattern = new("^[0-9a-f]{40}$", RegexOptions.Compiled);
    private static readonly JsonSerializerOptions AgentReviewJson = new(JsonSerializerDefaults.Web)
    {
        WriteIndented = true,
        DefaultIgnoreCondition = JsonIgnoreCondition.Never,
    };
    // v0.21.10: the wake signal is shared per repository root, not held by one
    // GitHost instance. A waiter on one instance of a folder (WaitAgentReview)
    // and a resolve on another instance of the same folder (the UI closed and
    // reopened the repo) must share it, or the resolve wakes the wrong signal
    // and the waiter sleeps to its deadline.
    private static readonly object AgentReviewsSignalsLock = new();
    private static readonly Dictionary<string, TaskCompletionSource> AgentReviewsSignals = [];

    private static TaskCompletionSource NewAgentReviewsSignal() =>
        new(TaskCreationOptions.RunContinuationsAsynchronously);

    /// <summary>The current signal for a root, creating it on first use. Call under <see cref="AgentReviewsSignalsLock"/>.</summary>
    private static TaskCompletionSource AgentReviewsSignalUnlocked(string root)
    {
        string id = IdFor(root);
        if (!AgentReviewsSignals.TryGetValue(id, out TaskCompletionSource? signal))
        {
            signal = NewAgentReviewsSignal();
            AgentReviewsSignals[id] = signal;
        }

        return signal;
    }

    private string AgentReviewPath(string id)
    {
        if (!AgentReviewIdPattern.IsMatch(id)) throw new InvalidOperationException("invalid session id");
        return ResolveInRoot(RequireRoot(), AgentReviewsDirectory + "/" + id + ".json");
    }

    /// <summary>
    ///  A new session is version 2 (v0.21.1): round 1 is opened at once, its
    ///  patch captured, so the owner reviews what the agent showed even if the
    ///  worktree moves on.
    /// </summary>
    public AgentReviewDto CreateAgentReview(AgentReviewRequest req, CancellationToken ct = default)
    {
        AgentReviewRequest clean = ValidateAgentReviewRequest(req);
        string id = Convert.ToHexStringLower(RandomNumberGenerator.GetBytes(20));
        string now = Timestamp();
        int nextId = 1;
        AgentReviewRoundDto round = OpenRound(1, clean.Base, clean.Head, clean.Worktree ?? false, clean.Files!, [], ref nextId, ct);
        AgentReviewDto session = new(2, id, clean.Mode, clean.Title, clean.Why!, clean.Agent,
            clean.Branch, clean.Base, clean.Head, clean.Worktree ?? false, round.Files, "pending", true,
            now, now, null, null, null, Rounds: [round], Comments: []);
        session = AttachBoard(session, clean.Board);
        lock (_agentReviewWriteGate) WriteAgentReview(session);
        // The review panel finds this repository through the per-user index
        // (v0.21.10); a failing index never fails the review.
        AgentReviewRepos.Remember(RequireRoot());
        AfterRoundOpened(session, round);
        return session;
    }

    /// <summary>The board channel for a new session (v0.21.2); unchanged without a channel.</summary>
    private AgentReviewDto AttachBoard(AgentReviewDto session, string? requested)
    {
        string? board = null;
        BoardChannelFor(session, requested, ref board);
        return board is null ? session : session with { Board = board };
    }

    partial void BoardChannelFor(AgentReviewDto session, string? requested, ref string? board);

    public AgentReviewDto UpdateAgentReview(string id, AgentReviewRequest req)
    {
        AgentReviewDto current = GetAgentReview(id) ?? throw new KeyNotFoundException("agent review session not found");
        if (current.Status != "pending") throw new AgentReviewStateException("agent review session is not pending");
        AgentReviewRequest clean = ValidateAgentReviewRequest(req);
        // A session with rounds changes its files only through a revise.
        bool rounds = current.Rounds is { Count: > 0 };
        AgentReviewDto updated = current with
        {
            Mode = clean.Mode, Title = clean.Title, Why = clean.Why!, Agent = clean.Agent,
            Branch = clean.Branch, Base = rounds ? current.Base : clean.Base, Head = rounds ? current.Head : clean.Head,
            Worktree = rounds ? current.Worktree : clean.Worktree ?? false, Files = rounds ? current.Files : clean.Files!,
            UpdatedAt = Timestamp(),
        };
        WriteAgentReview(updated);
        return updated;
    }

    public AgentReviewListDto ListAgentReviews() => ListAgentReviews(RequireRoot(), BoardPath);

    /// <summary>
    ///  The sessions of one repository read straight from its folder
    ///  (v0.21.10): the review panel lists every repository's reviews without
    ///  opening any of them, so this takes a root instead of reading the
    ///  instance's <see cref="Current"/>. Same filters, summary and per-repo
    ///  badge as the instance list.
    /// </summary>
    public static AgentReviewListDto ListAgentReviews(string root, string? boardPath = null)
    {
        string directory = ResolveInRoot(root, AgentReviewsDirectory);
        List<AgentReviewDto> sessions = [];
        if (Directory.Exists(directory))
        {
            foreach (string file in Directory.EnumerateFiles(directory, "*.json"))
            {
                try
                {
                    AgentReviewDto? item = JsonSerializer.Deserialize<AgentReviewDto>(File.ReadAllText(file), AgentReviewJson);
                    if (item is not null && item.Version is 1 or 2 && item.Files is not null
                        && item.Id is not null && AgentReviewIdPattern.IsMatch(item.Id)) sessions.Add(item);
                }
                catch (Exception ex) when (ex is IOException or UnauthorizedAccessException or JsonException) { }
            }
        }
        sessions.Sort((a, b) => string.CompareOrdinal(b.CreatedAt, a.CreatedAt));
        AgentReviewSummaryDto[] summaries = [.. sessions.Select(ToSummary)];
        WithLastReads(summaries, sessions, boardPath ?? PowerChannel.DefaultPath());
        // A Wait review counts while it is the owner's turn; a Notify one while unread.
        int badge = sessions.Count(s => (s.Mode == "wait" && s.Status == "pending" && TurnOf(s) != "agent") || (s.Mode == "notify" && s.Unread && s.Status == "pending"));
        return new AgentReviewListDto(summaries, badge);
    }

    /// <summary>
    ///  Every repository's reviews in one list (v0.21.10): the review panel
    ///  holds all of them, and opening one opens its repository. Roots are
    ///  deduplicated by id and a root without a session folder is skipped;
    ///  sessions are ordered by <c>createdAt</c> descending across repos, and
    ///  the badge is the sum of every repo's badge.
    /// </summary>
    public static AgentReviewEverywhereDto ListAgentReviewsEverywhere(IEnumerable<string> roots, string? boardPath = null)
    {
        string board = boardPath ?? PowerChannel.DefaultPath();
        List<AgentReviewEverywhereItemDto> items = [];
        HashSet<string> seen = [];
        int badge = 0;
        foreach (string root in roots)
        {
            if (string.IsNullOrWhiteSpace(root)) continue;
            string full;
            string id;
            try
            {
                full = Path.GetFullPath(root);
                id = IdFor(full);
            }
            catch (Exception ex) when (ex is ArgumentException or NotSupportedException or PathTooLongException)
            {
                continue;
            }

            if (!seen.Add(id)) continue;
            if (!Directory.Exists(Path.Combine(full, AgentReviewsDirectory.Replace('/', Path.DirectorySeparatorChar)))) continue;
            AgentReviewRepoDto repo = new(id, full, Path.GetFileName(full.TrimEnd(Path.DirectorySeparatorChar, '/')));
            AgentReviewListDto list = ListAgentReviews(full, board);
            badge += list.Badge;
            foreach (AgentReviewSummaryDto session in list.Sessions)
            {
                items.Add(new(repo, session));
            }
        }

        items.Sort((a, b) => string.CompareOrdinal(b.Session.CreatedAt, a.Session.CreatedAt));
        return new(items, badge);
    }

    public AgentReviewDto? GetAgentReview(string id)
    {
        string path = AgentReviewPath(id);
        if (!File.Exists(path)) return null;
        return JsonSerializer.Deserialize<AgentReviewDto>(File.ReadAllText(path), AgentReviewJson);
    }

    public AgentReviewDto ResolveAgentReview(string id, AgentReviewResolveRequest req)
    {
        lock (_agentReviewWriteGate) return ResolveLocked(id, req);
    }

    private AgentReviewDto ResolveLocked(string id, AgentReviewResolveRequest req)
    {
        AgentReviewDto current = GetAgentReview(id) ?? throw new KeyNotFoundException("agent review session not found");
        string action = req.Action?.Trim() ?? "";
        string now = Timestamp();
        AgentReviewDto updated;
        if (action == "ack") updated = current with { Unread = false, UpdatedAt = now };
        else
        {
            if (action is not ("approve" or "request_changes" or "cancel" or "expire"))
                throw new InvalidOperationException("unknown agent review action");
            if (current.Status != "pending") throw new AgentReviewStateException("agent review session is not pending");
            // With rounds, "request changes" is sending the round back (the lock is re-entrant).
            if (action == "request_changes" && current.Rounds is { Count: > 0 }) return SendAgentReviewRound(id, req.Summary);
            if (action == "approve" && LatestRound(current) is { } open)
            {
                // Approve is "approve all": what the owner left undecided is accepted;
                // a change they rejected keeps its verdict.
                AgentReviewRoundDto stamped = StampVerdicts(current, open) with { SentAt = open.SentAt ?? now, Note = Clean(req.Summary) ?? open.Note };
                stamped = stamped with { Changes = [.. stamped.Changes.Select(c => c.Verdict == "undecided" ? c with { Verdict = "accept" } : c)] };
                current = current with { Rounds = [.. current.Rounds!.Take(current.Rounds!.Count - 1), stamped], Comments = CollectRoundComments(current, stamped) };
            }
            updated = action switch
            {
                "approve" => current with { Status = "approved", UpdatedAt = now, ResolvedAt = now, Resolution = new(req.Summary, []) },
                "request_changes" => current with { Status = "changes_requested", UpdatedAt = now, ResolvedAt = now, Resolution = new(req.Summary, ReadReviewComments(id)) },
                "cancel" => current with { Status = "cancelled", UpdatedAt = now, ResolvedAt = now, Reason = req.Reason ?? "owner" },
                _ => current with { Status = "expired", UpdatedAt = now, ResolvedAt = now, Reason = req.Reason ?? "host_gone" },
            };
        }
        WriteAgentReview(updated);
        if (updated.Status != "pending") AfterClosed(updated);
        return updated;
    }

    /// <summary>Wake MCP waiters when the engine that owns their endpoint is going away.</summary>
    public void ExpireAgentReviews(string reason)
    {
        foreach (AgentReviewSummaryDto session in ListAgentReviews().Sessions.Where(s => s.Mode == "wait" && s.Status == "pending"))
        {
            ResolveAgentReview(session.Id, new("expire", null, reason));
        }
    }

    public async Task<AgentReviewWaitDto> WaitAgentReview(string id, int timeoutMs, CancellationToken ct)
    {
        timeoutMs = Math.Clamp(timeoutMs, 1_000, 120_000);
        DateTime deadline = DateTime.UtcNow.AddMilliseconds(timeoutMs);
        while (true)
        {
            // The signal is taken before the read: a resolve that lands
            // between the two completes this signal, not a later one, so
            // the wait can never sleep through it. The signal is shared by
            // every host instance of this root (v0.21.10).
            Task signal;
            lock (AgentReviewsSignalsLock) signal = AgentReviewsSignalUnlocked(RequireRoot()).Task;
            AgentReviewDto session = GetAgentReview(id) ?? throw new KeyNotFoundException("agent review session not found");
            // With rounds the wait also ends when the round comes back to the agent.
            if (session.Status != "pending" || TurnOf(session) == "agent") return new(session, false);
            TimeSpan remaining = deadline - DateTime.UtcNow;
            if (remaining <= TimeSpan.Zero) return new(session, true);
            Task delay = Task.Delay(remaining, ct);
            Task winner = await Task.WhenAny(signal, delay);
            if (winner == delay)
            {
                await delay;
                session = GetAgentReview(id) ?? throw new KeyNotFoundException("agent review session not found");
                return new(session, session.Status == "pending" && TurnOf(session) != "agent");
            }
        }
    }

    public DiffDto GetAgentReviewDiff(string id, string path, CancellationToken ct, int? round = null)
    {
        AgentReviewDto session = GetAgentReview(id) ?? throw new KeyNotFoundException("agent review session not found");
        if (session.Rounds is { Count: > 0 } rounds)
        {
            AgentReviewRoundDto chosen = round is null ? rounds[^1] : rounds.FirstOrDefault(r => r.N == round) ?? throw new InvalidOperationException($"no round {round}");
            AgentReviewFileDto inRound = chosen.Files.FirstOrDefault(f => f.Path == path) ?? throw new InvalidOperationException($"path is not in round {chosen.N}: {path}");
            string text = inRound.Patch ?? "";
            return new(path, text, false, text.Length);
        }
        AgentReviewFileDto file = session.Files.FirstOrDefault(f => f.Path == path)
            ?? throw new InvalidOperationException($"path is not in agent review: {path}");
        ResolveInRoot(RequireRoot(), path);
        if (file.Patch is not null) return new(path, file.Patch, false, file.Patch.Length);
        if (session.Base is not null && session.Head is not null)
            return (DiffDto)Compare(session.Base, session.Head, path, ct: ct);
        if (session.Worktree && (session.Base is not null || session.Head is not null))
            return (DiffDto)Compare(session.Base ?? session.Head!, null, path, ct: ct);
        throw new InvalidOperationException($"nothing to diff for path: {path}");
    }

    private AgentReviewRequest ValidateAgentReviewRequest(AgentReviewRequest req)
    {
        string mode = req.Mode?.Trim() ?? "";
        if (mode is not ("notify" or "wait")) throw new InvalidOperationException("mode must be notify or wait");
        string title = req.Title?.Trim() ?? "";
        if (title.Length == 0 || title.Length > 200) throw new InvalidOperationException("title must be 1 to 200 characters");
        List<AgentReviewFileDto> files = [];
        foreach (AgentReviewFileDto file in req.Files ?? [])
        {
            string path = file.Path?.Trim() ?? "";
            try { ResolveInRoot(RequireRoot(), path); }
            catch (InvalidOperationException) { throw new InvalidOperationException($"invalid agent review path: {file.Path}"); }
            string status = string.IsNullOrWhiteSpace(file.Status) ? "M" : file.Status.Trim();
            if (status is not ("M" or "A" or "D" or "R" or "T")) throw new InvalidOperationException($"invalid status for path: {path}");
            files.Add(new(path.Replace('\\', '/'), status, file.Patch));
        }
        return req with { Mode = mode, Title = title, Why = req.Why ?? "", Worktree = req.Worktree ?? false, Files = files };
    }

    private void WriteAgentReview(AgentReviewDto session, bool bump = true)
    {
        string path = AgentReviewPath(session.Id);
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        string temporary = path + ".tmp-" + Guid.NewGuid().ToString("N");
        try
        {
            File.WriteAllText(temporary, JsonSerializer.Serialize(session, AgentReviewJson) + "\n", new System.Text.UTF8Encoding(false));
            File.Move(temporary, path, true);
        }
        catch { File.Delete(temporary); throw; }
        if (!_reviewsExcluded) { EnsureExcluded("/.powergit/"); _reviewsExcluded = true; }
        if (bump) BumpAgentReviews();
    }

    private void BumpAgentReviews()
    {
        TaskCompletionSource signal;
        lock (AgentReviewsSignalsLock)
        {
            string root = RequireRoot();
            signal = AgentReviewsSignalUnlocked(root);
            AgentReviewsSignals[IdFor(root)] = NewAgentReviewsSignal();
        }

        signal.TrySetResult();
    }

    private IReadOnlyList<AgentReviewCommentDto> ReadReviewComments(string id)
    {
        try
        {
            string? json = ReadReview(id);
            if (json is null) return [];
            using JsonDocument doc = JsonDocument.Parse(json);
            List<AgentReviewCommentDto> comments = [];
            if (!doc.RootElement.TryGetProperty("files", out JsonElement files) || files.ValueKind != JsonValueKind.Object) return [];
            foreach (JsonProperty file in files.EnumerateObject())
            {
                if (!file.Value.TryGetProperty("comments", out JsonElement list) || list.ValueKind != JsonValueKind.Array) continue;
                foreach (JsonElement item in list.EnumerateArray())
                {
                    if (!item.TryGetProperty("line", out JsonElement lineEl) || !item.TryGetProperty("text", out JsonElement textEl)) continue;
                    string? line = lineEl.GetString(); string? body = textEl.GetString();
                    if (line is not null && body is not null) comments.Add(new(file.Name, line, line.StartsWith('-') ? "old" : "new", body));
                }
            }
            return [.. comments.OrderBy(c => c.Path, StringComparer.Ordinal).ThenBy(c => LineNumber(c.Line))];
        }
        catch (Exception ex) when (ex is JsonException or InvalidOperationException or IOException) { return []; }
    }

    private static int LineNumber(string line) => int.TryParse(line.AsSpan(1), out int value) ? value : int.MaxValue;
    private static string Timestamp() => DateTime.UtcNow.ToString("yyyy-MM-dd'T'HH:mm:ss.fff'Z'", System.Globalization.CultureInfo.InvariantCulture);
    private static AgentReviewSummaryDto ToSummary(AgentReviewDto s) =>
        new(s.Id, s.Mode, s.Title, s.Agent, s.Branch, s.Files.Count, s.Status, s.Unread, s.CreatedAt, s.UpdatedAt,
            LatestRound(s)?.N ?? 1, TurnOf(s), s.Board);
}

public sealed class AgentReviewStateException(string message) : InvalidOperationException(message);
