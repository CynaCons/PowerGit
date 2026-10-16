using System.Net.Http.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using Xunit;

namespace PowerGit.Engine.Tests;

/// <summary>v0.21.10: agent reviews from every repository, in one list.</summary>
public sealed class AgentReviewsEverywhereTests : IClassFixture<WebApplicationFactory<Program>>
{
    private readonly WebApplicationFactory<Program> _factory;
    public AgentReviewsEverywhereTests(WebApplicationFactory<Program> factory) => _factory = factory.WithWebHostBuilder(_ => { });

    private static AgentReviewRequest Request(string title) =>
        new("wait", title, null, "codex", null, null, null, false,
            [new("f.txt", "M", "diff --git a/f.txt b/f.txt\n+b\n")]);

    [Fact]
    public async Task Static_list_merges_two_repos_newest_first_and_sums_the_badge()
    {
        using TempRepo a = new(); using TempRepo b = new();
        GitHost hostA = new(); hostA.Open(a.Dir); AgentReviewDto first = hostA.CreateAgentReview(Request("A"));
        await Task.Delay(20);
        GitHost hostB = new(); hostB.Open(b.Dir); AgentReviewDto second = hostB.CreateAgentReview(Request("B"));

        // The index recorded both roots, and a repeated root is deduplicated by id.
        AgentReviewEverywhereDto all = GitHost.ListAgentReviewsEverywhere([a.Dir, b.Dir, a.Dir]);
        Assert.Equal(2, all.Sessions.Count);
        Assert.Equal(2, all.Badge);
        Assert.Equal(second.Id, all.Sessions[0].Session.Id);
        Assert.Equal(first.Id, all.Sessions[1].Session.Id);
        Assert.Equal(GitHost.IdFor(b.Dir), all.Sessions[0].Repo.Id);
        Assert.Equal(Path.GetFullPath(b.Dir), all.Sessions[0].Repo.Root);
        Assert.Equal(Path.GetFileName(b.Dir), all.Sessions[0].Repo.Name);
        Assert.Contains(AgentReviewRepos.List(), r => GitHost.IdFor(r) == GitHost.IdFor(a.Dir));
        Assert.Contains(AgentReviewRepos.List(), r => GitHost.IdFor(r) == GitHost.IdFor(b.Dir));
    }

    [Fact]
    public void Index_root_whose_folder_is_gone_is_skipped_without_error()
    {
        using TempRepo repo = new(); GitHost host = new(); host.Open(repo.Dir);
        host.CreateAgentReview(Request("gone"));
        Assert.Contains(AgentReviewRepos.List(), r => GitHost.IdFor(r) == GitHost.IdFor(repo.Dir));

        Directory.Delete(Path.Combine(repo.Dir, ".powergit", "agent-reviews"), recursive: true);
        AgentReviewEverywhereDto all = GitHost.ListAgentReviewsEverywhere([repo.Dir]);
        Assert.Empty(all.Sessions);
        Assert.Equal(0, all.Badge);
    }

    [Fact]
    public async Task Wait_wakes_across_two_instances_of_the_same_repo()
    {
        using TempRepo repo = new();
        GitHost waiting = new(); waiting.Open(repo.Dir);
        AgentReviewDto session = waiting.CreateAgentReview(Request("cross"));
        // 30 s deadline; a resolve on a second instance of the same folder must
        // wake this waiter well before it (sharing the signal is the point).
        Task<AgentReviewWaitDto> wait = waiting.WaitAgentReview(session.Id, 30_000, CancellationToken.None);
        GitHost resolving = new(); resolving.Open(repo.Dir);
        resolving.ResolveAgentReview(session.Id, new("approve", null, null));
        AgentReviewWaitDto woke = await wait.WaitAsync(TimeSpan.FromSeconds(5));
        Assert.False(woke.TimedOut);
        Assert.Equal("approved", woke.Session.Status);
    }

    [Fact]
    public async Task Http_route_serves_every_repo_and_leaves_current_alone()
    {
        using TempRepo a = new(); using TempRepo b = new();
        HttpClient client = _factory.CreateAuthedClient();
        string idA = await client.OpenSessionAsync(a.Dir);
        await Task.Delay(20);
        string idB = await client.OpenSessionAsync(b.Dir);
        AgentReviewDto first = (await (await client.PostAsJsonAsync($"/repos/{idA}/agent-reviews", Request("A"))).Content.ReadFromJsonAsync<AgentReviewDto>())!;
        await Task.Delay(20);
        AgentReviewDto second = (await (await client.PostAsJsonAsync($"/repos/{idB}/agent-reviews", Request("B"))).Content.ReadFromJsonAsync<AgentReviewDto>())!;
        try
        {
            // The response spans the whole machine's data dir; pick our two repos out of it.
            AgentReviewEverywhereDto all = (await client.GetFromJsonAsync<AgentReviewEverywhereDto>("/agent-reviews"))!;
            List<AgentReviewEverywhereItemDto> mine = [.. all.Sessions.Where(s => s.Repo.Id == idA || s.Repo.Id == idB)];
            Assert.Equal(2, mine.Count);
            Assert.Equal(second.Id, mine[0].Session.Id);
            Assert.Equal(first.Id, mine[1].Session.Id);
            Assert.Equal(idB, mine[0].Repo.Id);
            Assert.Equal(Path.GetFullPath(b.Dir), mine[0].Repo.Root);
            Assert.Equal(Path.GetFileName(b.Dir), mine[0].Repo.Name);
            Assert.True(all.Badge >= 2, $"badge was {all.Badge}");
            // Listing every review must not open a repository or move the current one.
            RepoInfo? current = await client.GetFromJsonAsync<RepoInfo>("/repos/current");
            Assert.Equal(idB, current!.Id);
        }
        finally
        {
            await client.DeleteAsync($"/repos/{idA}");
            await client.DeleteAsync($"/repos/{idB}");
        }
    }
}
