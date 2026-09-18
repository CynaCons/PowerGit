using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using Xunit;

namespace PowerGit.Engine.Tests;

public sealed class AgentReviewsTests : IClassFixture<WebApplicationFactory<Program>>
{
    private readonly WebApplicationFactory<Program> _factory;
    public AgentReviewsTests(WebApplicationFactory<Program> factory) => _factory = factory.WithWebHostBuilder(_ => { });

    private static AgentReviewRequest Request(string mode = "wait", string title = "Review this", string? patch = "diff --git a/f.txt b/f.txt\n+b\n") =>
        new(mode, title, "critical", "codex", "feature", null, null, false, [new("f.txt", "M", patch)]);

    [Fact]
    public void Create_list_get_validate_and_update_state()
    {
        using TempRepo repo = new(); GitHost host = new(); host.Open(repo.Dir);
        AgentReviewDto created = host.CreateAgentReview(Request());
        Assert.Matches("^[0-9a-f]{40}$", created.Id);
        Assert.True(File.Exists(Path.Combine(repo.Dir, ".powergit", "agent-reviews", created.Id + ".json")));
        Assert.Equal("", repo.Output("status", "--porcelain"));
        AgentReviewListDto list = host.ListAgentReviews();
        Assert.Equal(1, list.Badge); Assert.Equal(created.Id, Assert.Single(list.Sessions).Id);
        Assert.Equal("diff --git a/f.txt b/f.txt\n+b\n", Assert.Single(host.GetAgentReview(created.Id)!.Files).Patch);
        Assert.Throws<InvalidOperationException>(() => host.CreateAgentReview(Request() with { Files = [new("../x", "M", null)] }));
        Assert.Single(Directory.GetFiles(Path.Combine(repo.Dir, GitHost.AgentReviewsDirectory)));
        Assert.Equal("Changed", host.UpdateAgentReview(created.Id, Request(title: " Changed ")).Title);
        host.ResolveAgentReview(created.Id, new("approve", null, null));
        Assert.Throws<AgentReviewStateException>(() => host.UpdateAgentReview(created.Id, Request()));
    }

    [Fact]
    public void Resolve_actions_copy_comments_ack_badge_and_reject_second_terminal_action()
    {
        using TempRepo repo = new(); GitHost host = new(); host.Open(repo.Dir);
        AgentReviewDto approved = host.CreateAgentReview(Request());
        AgentReviewDto result = host.ResolveAgentReview(approved.Id, new("approve", "fine", null));
        Assert.Equal("approved", result.Status); Assert.NotNull(result.ResolvedAt);
        Assert.Throws<AgentReviewStateException>(() => host.ResolveAgentReview(approved.Id, new("approve", null, null)));

        AgentReviewDto changes = host.CreateAgentReview(Request());
        host.WriteReview(changes.Id, "{\"files\":{\"f.txt\":{\"comments\":[{\"line\":\"+2\",\"text\":\"needs a guard\"}]}}}");
        result = host.ResolveAgentReview(changes.Id, new("request_changes", "please fix", null));
        Assert.Equal("changes_requested", result.Status); Assert.Equal("please fix", result.Resolution!.Summary);
        Assert.Equal(new("f.txt", "+2", "new", "needs a guard"), Assert.Single(result.Resolution.Comments));

        AgentReviewDto cancelled = host.CreateAgentReview(Request());
        Assert.Equal("owner", host.ResolveAgentReview(cancelled.Id, new("cancel", null, null)).Reason);
        AgentReviewDto notify = host.CreateAgentReview(Request("notify"));
        Assert.True(host.ListAgentReviews().Badge > 0);
        Assert.False(host.ResolveAgentReview(notify.Id, new("ack", null, null)).Unread);
        Assert.DoesNotContain(host.ListAgentReviews().Sessions, s => s.Id == notify.Id && s.Unread);
    }

    [Fact]
    public async Task Wait_wakes_on_resolve_and_timeout_never_approves()
    {
        using TempRepo repo = new(); GitHost host = new(); host.Open(repo.Dir);
        AgentReviewDto waking = host.CreateAgentReview(Request());
        Task<AgentReviewWaitDto> wait = host.WaitAgentReview(waking.Id, 30_000, CancellationToken.None);
        host.ResolveAgentReview(waking.Id, new("approve", null, null));
        AgentReviewWaitDto woke = await wait.WaitAsync(TimeSpan.FromSeconds(1));
        Assert.False(woke.TimedOut); Assert.Equal("approved", woke.Session.Status);
        AgentReviewDto pending = host.CreateAgentReview(Request());
        AgentReviewWaitDto timed = await host.WaitAgentReview(pending.Id, 1_000, CancellationToken.None);
        Assert.True(timed.TimedOut); Assert.Equal("pending", timed.Session.Status);
    }

    [Fact]
    public void Diff_prefers_patch_then_compares_base_and_head()
    {
        using TempRepo repo = new(); GitHost host = new(); host.Open(repo.Dir);
        AgentReviewDto patched = host.CreateAgentReview(Request());
        Assert.Contains("+b", host.GetAgentReviewDiff(patched.Id, "f.txt", CancellationToken.None).Text);
        string from = repo.Output("rev-parse", "main"); string to = repo.Output("rev-parse", "feature");
        AgentReviewDto compared = host.CreateAgentReview(Request(patch: null) with { Base = from, Head = to, Files = [new("b.txt", "A", null)] });
        Assert.Contains("+b", host.GetAgentReviewDiff(compared.Id, "b.txt", CancellationToken.None).Text);
        Assert.Throws<InvalidOperationException>(() => host.GetAgentReviewDiff(compared.Id, "x.txt", CancellationToken.None));
    }

    [Fact]
    public async Task Http_routes_cover_create_list_wait_resolve_diff_and_errors()
    {
        using TempRepo repo = new(); HttpClient client = _factory.CreateAuthedClient(); string repoId = await client.OpenSessionAsync(repo.Dir);
        try
        {
            HttpResponseMessage post = await client.PostAsJsonAsync($"/repos/{repoId}/agent-reviews", Request());
            Assert.Equal(HttpStatusCode.Created, post.StatusCode);
            AgentReviewDto session = (await post.Content.ReadFromJsonAsync<AgentReviewDto>())!;
            AgentReviewListDto list = (await client.GetFromJsonAsync<AgentReviewListDto>($"/repos/{repoId}/agent-reviews"))!;
            Assert.Equal(1, list.Badge);
            AgentReviewWaitDto timed = (await client.GetFromJsonAsync<AgentReviewWaitDto>($"/repos/{repoId}/agent-reviews/{session.Id}/wait?timeoutMs=1000"))!;
            Assert.True(timed.TimedOut);
            Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync($"/repos/{repoId}/agent-reviews/{session.Id}/resolve", new AgentReviewResolveRequest("approve", null, null))).StatusCode);
            Assert.Equal(HttpStatusCode.OK, (await client.GetAsync($"/repos/{repoId}/agent-reviews/{session.Id}/diff?path=f.txt")).StatusCode);
            Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync($"/repos/{repoId}/agent-reviews/{new string('0', 40)}")).StatusCode);
            AgentReviewDto other = (await (await client.PostAsJsonAsync($"/repos/{repoId}/agent-reviews", Request())).Content.ReadFromJsonAsync<AgentReviewDto>())!;
            Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync($"/repos/{repoId}/agent-reviews/{other.Id}/resolve", new AgentReviewResolveRequest("wat", null, null))).StatusCode);
        }
        finally { await client.DeleteAsync($"/repos/{repoId}"); }
    }
}
