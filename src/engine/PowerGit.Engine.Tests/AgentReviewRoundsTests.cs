using System.Net;
using System.Net.Http.Json;
using System.Text.Json.Nodes;
using Microsoft.AspNetCore.Mvc.Testing;
using Xunit;

namespace PowerGit.Engine.Tests;

/// <summary>v0.21.1: agent review rounds (docs/design/agent-review-rounds.md §3).</summary>
public sealed class AgentReviewRoundsTests : IClassFixture<WebApplicationFactory<Program>>
{
    private readonly WebApplicationFactory<Program> _factory;
    public AgentReviewRoundsTests(WebApplicationFactory<Program> factory) => _factory = factory.WithWebHostBuilder(_ => { });

    private const string Patch = """
        diff --git a/t.cs b/t.cs
        --- a/t.cs
        +++ b/t.cs
        @@ -2,4 +2,5 @@ class T
         a
        -b
        +B
        +B2
         c
        @@ -20,3 +21,2 @@ class T
         x
        -y
         z
        """;

    [Fact]
    public void Parse_splits_hunks_with_line_keys_and_a_hash_of_the_changed_lines()
    {
        List<AgentReviewHunks.Hunk> hunks = AgentReviewHunks.Parse("t.cs", Patch);
        Assert.Equal(2, hunks.Count);
        Assert.Equal(["-3", "+3", "+4"], hunks[0].Keys);
        Assert.Equal((2, 4, 2, 5), (hunks[0].OldStart, hunks[0].OldLines, hunks[0].NewStart, hunks[0].NewLines));
        Assert.Equal(["-21"], hunks[1].Keys);
        // The hash ignores context and position: the same change moved is the same change.
        string moved = Patch.Replace("@@ -2,4 +2,5 @@", "@@ -7,4 +7,5 @@").Replace(" a\n", " q\n");
        Assert.Equal(hunks[0].Hash, AgentReviewHunks.Parse("t.cs", moved)[0].Hash);
        Assert.Empty(AgentReviewHunks.Parse("t.cs", "diff --git a/t.cs b/t.cs\n+b\n"));
    }

    [Fact]
    public void Match_carries_revises_adds_and_removes()
    {
        List<AgentReviewHunks.Hunk> before = AgentReviewHunks.Parse("t.cs", Patch);
        int id = 1;
        (List<AgentReviewChangeDto> first, _) = AgentReviewHunks.Match([], before, ref id);
        Assert.Equal(["h1", "h2"], first.Select(c => c.Id));
        List<AgentReviewHunks.Previous> previous =
        [
            new(first[0] with { Verdict = "accept" }, before[0]),
            new(first[1] with { Verdict = "reject" }, before[1]),
        ];
        string next = """
            @@ -2,4 +2,5 @@ class T
             a
            -b
            +B
            +B2
             c
            @@ -40,2 +41,3 @@
             m
            +n
            """;
        (List<AgentReviewChangeDto> second, List<string> removed) = AgentReviewHunks.Match(previous, AgentReviewHunks.Parse("t.cs", next), ref id);
        Assert.Equal(("h1", "carried", "accept"), (second[0].Id, second[0].Origin, second[0].Verdict));
        Assert.Equal(("h3", "new"), (second[1].Id, second[1].Origin));
        Assert.Equal(["h2"], removed);

        string revised = "@@ -20,3 +20,3 @@\n x\n-y\n+Y\n z\n";
        id = 3;
        (List<AgentReviewChangeDto> third, removed) = AgentReviewHunks.Match(previous, AgentReviewHunks.Parse("t.cs", revised), ref id);
        Assert.Equal(("h3", "revised", "h2", "undecided"), (third[0].Id, third[0].Origin, third[0].From, third[0].Verdict));
        Assert.Equal(["h1"], removed);
    }

    [Fact]
    public void Verdict_reads_the_line_marks()
    {
        string[] keys = ["-3", "+3", "+4"];
        Assert.Equal("accept", AgentReviewHunks.Verdict(keys, new Dictionary<string, string> { ["-3"] = "ok", ["+3"] = "ok", ["+4"] = "ok" }).Verdict);
        Assert.Equal("reject", AgentReviewHunks.Verdict(keys, new Dictionary<string, string> { ["-3"] = "rejected", ["+3"] = "rejected", ["+4"] = "rejected" }).Verdict);
        (string mixed, List<string>? rejected) = AgentReviewHunks.Verdict(keys, new Dictionary<string, string> { ["-3"] = "ok", ["+4"] = "rejected" });
        Assert.Equal("mixed", mixed); Assert.Equal(["+4"], rejected);
        Assert.Equal("undecided", AgentReviewHunks.Verdict(keys, new Dictionary<string, string> { ["-3"] = "ok" }).Verdict);
    }

    private static string Lines(int count, Func<int, string> line) => string.Join("", Enumerable.Range(1, count).Select(i => line(i) + "\n"));

    [Fact]
    public async Task Two_rounds_in_a_worktree_carry_marks_collect_comments_and_wake_the_wait()
    {
        using TempRepo repo = new();
        repo.Write("t.txt", Lines(30, i => $"line {i}"));
        repo.StageAndCommit("thirty lines");
        GitHost host = new(); host.Open(repo.Dir);
        repo.Write("t.txt", Lines(30, i => i == 3 ? "line 3 changed" : i == 25 ? "line 25 changed" : $"line {i}"));
        repo.Write("n.txt", "new\nfile\n");

        AgentReviewDto session = host.CreateAgentReview(new("wait", "Fix", "why", "auth-fix", null, null, null, true,
            [new("t.txt", "M", null), new("n.txt", "A", null)]));
        Assert.Equal(2, session.Version);
        AgentReviewRoundDto one = Assert.Single(session.Rounds!);
        Assert.Equal(["h1", "h2", "h3"], one.Changes.Select(c => c.Id));
        Assert.Contains("+new", one.Files.Single(f => f.Path == "n.txt").Patch);
        Assert.Equal("user", GitHost.TurnOf(session));
        Assert.Equal(1, host.ListAgentReviews().Badge);

        // The owner rejects the first change with a comment, accepts the second and asks about it.
        host.WriteReview(session.Id, """
            {"version":1,"commit":"x","reviewed":0,"changed":0,"status":"in-progress","files":{"t.txt":{
              "lines":{"-3":"rejected","+3":"rejected","-25":"ok","+25":"ok"},
              "comments":[{"line":"+3","text":"keep the old line"}]}}}
            """);
        AgentReviewThreadDto asked = host.AskAgentReview(session.Id, new(1, "t.txt", "+25", "why this?"));
        Assert.Equal(("c1", "h2", "ask"), (asked.Id, asked.Change, asked.Kind));

        Task<AgentReviewWaitDto> wait = host.WaitAgentReview(session.Id, 30_000, CancellationToken.None);
        AgentReviewDto sent = host.SendAgentReviewRound(session.Id, "two things");
        AgentReviewWaitDto woke = await wait.WaitAsync(TimeSpan.FromSeconds(2));
        Assert.False(woke.TimedOut);
        Assert.Equal("agent", GitHost.TurnOf(sent));
        Assert.Equal(0, host.ListAgentReviews().Badge);
        AgentReviewRoundDto stamped = sent.Rounds![0];
        Assert.Equal(["reject", "accept", "undecided"], stamped.Changes.Select(c => c.Verdict));
        Assert.Equal("two things", stamped.Note);
        AgentReviewThreadDto c2 = sent.Comments!.Single(c => c.Id == "c2");
        Assert.Equal(("h1", "+3", "round"), (c2.Change, c2.Line, c2.Kind));
        Assert.Throws<AgentReviewStateException>(() => host.SendAgentReviewRound(session.Id, null));

        // The agent redoes line 3 and inserts a line at 15, which moves line 25's change down by one.
        List<string> next = [.. Enumerable.Range(1, 30).Select(i => i == 3 ? "line 3 again" : i == 25 ? "line 25 changed" : $"line {i}")];
        next.Insert(14, "inserted");
        repo.Write("t.txt", string.Join("", next.Select(l => l + "\n")));
        AgentReviewDto revised = host.ReviseAgentReview(session.Id, new("fixed", [new("c2", "done")], null, null), CancellationToken.None);
        AgentReviewRoundDto two = revised.Rounds![1];
        Assert.Equal(2, two.N);
        Assert.Equal("user", GitHost.TurnOf(revised));
        Assert.Equal(1, host.ListAgentReviews().Badge);
        Assert.Contains(two.Changes, c => c.Id == "h2" && c.Origin == "carried" && c.Verdict == "accept" && c.NewStart > 22);
        Assert.Contains(two.Changes, c => c.Origin == "revised" && c.From == "h1");
        Assert.Contains(two.Changes, c => c.Origin == "new" && c.Path == "t.txt");
        Assert.Contains(two.Changes, c => c.Id == "h3" && c.Origin == "carried");
        Assert.Empty(two.Removed);
        AgentReviewReplyDto reply = Assert.Single(revised.Comments!.Single(c => c.Id == "c2").Replies);
        Assert.Equal(("done", "auth-fix"), (reply.Body, reply.Author));

        // The carried change's marks moved with it: +25 became +26, -25 kept its key.
        JsonNode marks = JsonNode.Parse(host.ReadReview(GitHost.RoundKey(session.Id, 2))!)!;
        Assert.Equal("ok", marks["files"]!["t.txt"]!["lines"]!["+26"]!.GetValue<string>());
        Assert.Equal("ok", marks["files"]!["t.txt"]!["lines"]!["-25"]!.GetValue<string>());
        Assert.Null(marks["files"]!["t.txt"]!["lines"]!["+3"]);
        Assert.Contains("line 3 changed", host.GetAgentReviewDiff(session.Id, "t.txt", CancellationToken.None, 1).Text);
        Assert.Contains("line 3 again", host.GetAgentReviewDiff(session.Id, "t.txt", CancellationToken.None).Text);

        AgentReviewDto approved = host.ResolveAgentReview(session.Id, new("approve", null, null));
        Assert.Equal("approved", approved.Status);
        Assert.NotNull(approved.Rounds![1].SentAt);
        // Approve is approve all: the changes left undecided are accepted.
        Assert.All(approved.Rounds![1].Changes, c => Assert.Equal("accept", c.Verdict));
        Assert.Throws<AgentReviewStateException>(() => host.ReviseAgentReview(session.Id, new(null, null, null, null), CancellationToken.None));
    }

    [Fact]
    public void Request_changes_on_a_round_session_sends_the_round()
    {
        using TempRepo repo = new(); GitHost host = new(); host.Open(repo.Dir);
        AgentReviewDto session = host.CreateAgentReview(new("wait", "t", null, null, null, null, null, false,
            [new("f.txt", "M", "@@ -1 +1 @@\n-a\n+b\n")]));
        AgentReviewDto sent = host.ResolveAgentReview(session.Id, new("request_changes", "please", null));
        Assert.Equal("pending", sent.Status);
        Assert.Equal("agent", GitHost.TurnOf(sent));
        Assert.Equal("please", sent.Rounds![0].Note);
    }

    [Fact]
    public async Task Http_send_ask_revise_and_round_diff()
    {
        using TempRepo repo = new(); HttpClient client = _factory.CreateAuthedClient(); string repoId = await client.OpenSessionAsync(repo.Dir);
        try
        {
            AgentReviewRequest open = new("wait", "t", null, "agent", null, null, null, false, [new("f.txt", "M", "@@ -1 +1 @@\n-a\n+b\n")]);
            AgentReviewDto session = (await (await client.PostAsJsonAsync($"/repos/{repoId}/agent-reviews", open)).Content.ReadFromJsonAsync<AgentReviewDto>())!;
            HttpResponseMessage ask = await client.PostAsJsonAsync($"/repos/{repoId}/agent-reviews/{session.Id}/ask", new AgentReviewAskRequest(1, "f.txt", "+1", "why?"));
            Assert.Equal(HttpStatusCode.OK, ask.StatusCode);
            Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync($"/repos/{repoId}/agent-reviews/{session.Id}/ask", new AgentReviewAskRequest(1, "f.txt", "12", "x"))).StatusCode);
            Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync($"/repos/{repoId}/agent-reviews/{session.Id}/send", new AgentReviewSendRequest("n"))).StatusCode);
            Assert.Equal(HttpStatusCode.Conflict, (await client.PostAsJsonAsync($"/repos/{repoId}/agent-reviews/{session.Id}/send", new AgentReviewSendRequest("n"))).StatusCode);
            AgentReviewReviseRequest revise = new("again", [new("c1", "because")], null, [new("f.txt", "M", "@@ -1 +1 @@\n-a\n+c\n")]);
            AgentReviewDto two = (await (await client.PostAsJsonAsync($"/repos/{repoId}/agent-reviews/{session.Id}/revise", revise)).Content.ReadFromJsonAsync<AgentReviewDto>())!;
            Assert.Equal(2, two.Rounds!.Count);
            DiffDto first = (await client.GetFromJsonAsync<DiffDto>($"/repos/{repoId}/agent-reviews/{session.Id}/diff?path=f.txt&round=1"))!;
            Assert.Contains("+b", first.Text);
            AgentReviewListDto list = (await client.GetFromJsonAsync<AgentReviewListDto>($"/repos/{repoId}/agent-reviews"))!;
            Assert.Equal((2, "user"), (list.Sessions[0].Round, list.Sessions[0].Turn));
        }
        finally { await client.DeleteAsync($"/repos/{repoId}"); }
    }
}
