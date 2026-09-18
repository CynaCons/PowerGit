using System.Net;
using System.Net.Http.Json;
using System.Text;
using Microsoft.AspNetCore.Mvc.Testing;
using Xunit;

namespace PowerGit.Engine.Tests;

/// <summary>v0.19.0 repository-local review document persistence.</summary>
public sealed class ReviewsTests : IClassFixture<WebApplicationFactory<Program>>
{
    private readonly WebApplicationFactory<Program> _factory;

    public ReviewsTests(WebApplicationFactory<Program> factory)
    {
        _factory = factory.WithWebHostBuilder(_ => { });
    }

    private static (GitHost Host, TempRepo Repo, string Sha) Open()
    {
        TempRepo repo = new();
        GitHost host = new();
        host.Open(repo.Dir);
        return (host, repo, repo.Output("rev-parse", "HEAD").Trim());
    }

    [Fact]
    public void Round_trip_uses_the_review_file_excludes_it_once_and_only_first_write_bumps_status()
    {
        (GitHost host, TempRepo repo, string sha) = Open();
        using (repo)
        {
            string json = $"{{\"version\":1,\"commit\":\"{sha}\"}}";
            long before = host.ChangeVersion;

            host.WriteReview(sha, json);

            Assert.Equal(json + "\n", host.ReadReview(sha));
            Assert.True(File.Exists(Path.Combine(repo.Dir, ".powergit", "reviews", sha + ".json")));
            Assert.Equal("", repo.Output("status", "--porcelain"));
            Assert.True(host.ChangeVersion > before);
            Assert.Equal(GitChangeKind.Status, GitHost.ChangeKindOf(host.ChangeVersion));
            long afterFirst = host.ChangeVersion;

            host.WriteReview(sha, json + "\r\n\r\n");

            string[] exclusions = File.ReadAllLines(Path.Combine(repo.Dir, ".git", "info", "exclude"));
            Assert.Single(exclusions, line => line.Trim() == "/.powergit/");
            Assert.Equal(afterFirst, host.ChangeVersion);
            Assert.Equal(json + "\n", host.ReadReview(sha));
        }
    }

    [Fact]
    public void A_powergit_directory_present_at_open_is_excluded_before_any_write()
    {
        // An agent's first session file (M2) or a review another process
        // wrote lands before this engine has written anything: without the
        // exclude at open it would list as untracked until the first save.
        using TempRepo repo = new();
        repo.Write(".powergit/agent-reviews/" + new string('a', 40) + ".json", "{}" + "\n");
        Assert.Contains(".powergit", repo.Output("status", "--porcelain"));

        GitHost host = new();
        host.Open(repo.Dir);

        Assert.Equal("", repo.Output("status", "--porcelain"));
        string exclude = File.ReadAllText(Path.Combine(repo.Dir, ".git", "info", "exclude")).Replace("\r\n", "\n");
        Assert.Contains("\n/.powergit/\n", "\n" + exclude);
    }

    [Fact]
    public void Keys_accept_only_full_lowercase_hashes_and_the_two_pending_suffixes()
    {
        (GitHost host, TempRepo repo, string sha) = Open();
        using (repo)
        {
            host.WriteReview(sha + "-worktree", "{}");
            host.WriteReview(sha + "-index", "{}");

            foreach (string invalid in new[] { "../x", "HEAD", sha.ToUpperInvariant(), sha + "-other", "" })
            {
                Assert.Throws<InvalidOperationException>(() => host.WriteReview(invalid, "{}"));
            }

            string[] files = Directory.GetFiles(Path.Combine(repo.Dir, GitHost.ReviewsDirectory));
            Assert.Equal(2, files.Length);
        }
    }

    [Fact]
    public void Body_must_be_an_object_but_unknown_properties_are_preserved()
    {
        (GitHost host, TempRepo repo, string sha) = Open();
        using (repo)
        {
            foreach (string invalid in new[] { "[]", "\"x\"", "not json" })
            {
                InvalidOperationException error = Assert.Throws<InvalidOperationException>(() => host.WriteReview(sha, invalid));
                Assert.Equal("review must be a JSON object", error.Message);
                Assert.False(Directory.Exists(Path.Combine(repo.Dir, ".powergit")));
            }

            host.WriteReview(sha, "{\"unknown\":true}");
            Assert.Equal("{\"unknown\":true}\n", host.ReadReview(sha));
        }
    }

    [Fact]
    public void Delete_removes_an_existing_review_and_is_idempotent()
    {
        (GitHost host, TempRepo repo, string sha) = Open();
        using (repo)
        {
            host.WriteReview(sha, "{}");

            Assert.True(host.DeleteReview(sha));
            Assert.False(host.DeleteReview(sha));
            Assert.Null(host.ReadReview(sha));
        }
    }

    [Fact]
    public async Task Http_routes_put_get_reject_bad_keys_and_delete()
    {
        using TempRepo repo = new();
        string sha = repo.Output("rev-parse", "HEAD").Trim();
        string json = $"{{\"version\":1,\"commit\":\"{sha}\"}}";
        HttpClient client = _factory.CreateAuthedClient();
        string id = await client.OpenSessionAsync(repo.Dir);
        try
        {
            HttpResponseMessage put = await client.PutAsync(
                $"/repos/{id}/reviews/{sha}",
                new StringContent(json, Encoding.UTF8, "application/json"));
            Assert.Equal(HttpStatusCode.NoContent, put.StatusCode);

            HttpResponseMessage get = await client.GetAsync($"/repos/{id}/reviews/{sha}");
            Assert.Equal(HttpStatusCode.OK, get.StatusCode);
            Assert.StartsWith("application/json", get.Content.Headers.ContentType?.ToString());
            Assert.Equal(json + "\n", await get.Content.ReadAsStringAsync());

            string unknown = new('0', 40);
            Assert.Equal(HttpStatusCode.NoContent, (await client.GetAsync($"/repos/{id}/reviews/{unknown}")).StatusCode);

            HttpResponseMessage bad = await client.PutAsync(
                $"/repos/{id}/reviews/%2E%2E%2Fx",
                new StringContent("{}", Encoding.UTF8, "application/json"));
            Assert.Equal(HttpStatusCode.BadRequest, bad.StatusCode);
            ErrorResponse? error = await bad.Content.ReadFromJsonAsync<ErrorResponse>();
            Assert.False(string.IsNullOrWhiteSpace(error?.Error));

            Assert.Equal(HttpStatusCode.NoContent, (await client.DeleteAsync($"/repos/{id}/reviews/{sha}")).StatusCode);
            Assert.Equal(HttpStatusCode.NoContent, (await client.GetAsync($"/repos/{id}/reviews/{sha}")).StatusCode);
        }
        finally
        {
            await client.DeleteAsync($"/repos/{id}");
        }
    }
}
