using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using Xunit;

namespace PowerGit.Engine.Tests;

public sealed class ApiTests : IClassFixture<WebApplicationFactory<Program>>
{
    private readonly WebApplicationFactory<Program> _factory;

    public ApiTests(WebApplicationFactory<Program> factory)
    {
        _factory = factory.WithWebHostBuilder(_ => { });
    }

    [Fact]
    public async Task Health_ok()
    {
        HttpClient client = _factory.CreateAuthedClient();
        HttpResponseMessage response = await client.GetAsync("/health");
        response.EnsureSuccessStatusCode();
        HealthResponse? body = await response.Content.ReadFromJsonAsync<HealthResponse>();
        Assert.NotNull(body);
        Assert.Equal("ok", body.Status);
        Assert.Contains("git version", body.GitVersion, StringComparison.OrdinalIgnoreCase);
        // Single version source (v0.13.5): the engine reports frontend/package.json's version.
        string packageJson = File.ReadAllText(Path.Combine(FindRepoRoot(), "frontend", "package.json"));
        string expected = System.Text.RegularExpressions.Regex.Match(packageJson, "\"version\"\\s*:\\s*\"([^\"]+)\"").Groups[1].Value;
        Assert.Equal(expected, body.Engine);
    }

    [Fact]
    public async Task Open_and_current_roundtrip()
    {
        HttpClient client = _factory.CreateAuthedClient();
        string root = FindRepoRoot();
        HttpResponseMessage opened = await client.PostAsJsonAsync("/repos/open", new OpenRepoRequest(root));
        opened.EnsureSuccessStatusCode();
        RepoInfo? info = await opened.Content.ReadFromJsonAsync<RepoInfo>();
        Assert.NotNull(info);
        string expected = root.TrimEnd(Path.DirectorySeparatorChar, '/').Split('/', '\\')[^1];
        Assert.Equal(expected, info.Name, StringComparer.OrdinalIgnoreCase);

        HttpResponseMessage current = await client.GetAsync("/repos/current");
        current.EnsureSuccessStatusCode();
        RepoInfo? again = await current.Content.ReadFromJsonAsync<RepoInfo>();
        Assert.Equal(info.Root, again?.Root);
    }

    [Fact]
    public async Task Open_non_repo_is_400()
    {
        HttpClient client = _factory.CreateAuthedClient();
        string temp = Directory.CreateTempSubdirectory("powergit-api-not-repo-").FullName;
        try
        {
            HttpResponseMessage response = await client.PostAsJsonAsync("/repos/open", new OpenRepoRequest(temp));
            Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        }
        finally
        {
            Directory.Delete(temp, recursive: true);
        }
    }

    [Fact]
    public async Task Commit_tree_lists_root_entries()
    {
        HttpClient client = _factory.CreateAuthedClient();
        string root = FindRepoRoot();
        string sid = await client.OpenSessionAsync(root);

        // Newest graph row may be an upstream GE tip; tree-of-HEAD is what Browse shows.
        HttpResponseMessage refsRes = await client.GetAsync($"/repos/{sid}/refs");
        refsRes.EnsureSuccessStatusCode();
        RefTreeDto? refs = await refsRes.Content.ReadFromJsonAsync<RefTreeDto>();
        string sha = refs?.Branches.FirstOrDefault(b => b.Current)?.Target
            ?? throw new InvalidOperationException("no current branch");

        HttpResponseMessage tree = await client.GetAsync($"/repos/{sid}/commits/{sha}/tree");
        tree.EnsureSuccessStatusCode();
        TreeEntryDto[] entries = await tree.Content.ReadFromJsonAsync<TreeEntryDto[]>() ?? [];
        Assert.Contains(entries, e => e.Name == "frontend" && e.Type == "tree");

        HttpResponseMessage nested = await client.GetAsync($"/repos/{sid}/commits/{sha}/tree?path=frontend/src");
        nested.EnsureSuccessStatusCode();
        TreeEntryDto[] srcEntries = await nested.Content.ReadFromJsonAsync<TreeEntryDto[]>() ?? [];
        Assert.Contains(srcEntries, e => e.Type == "tree" || e.Type == "blob");
        // Names must be relative to the requested directory (bare basenames),
        // otherwise the UI builds child paths like "src/src/components" and
        // blob lookups fail with "path does not exist in <sha>".
        Assert.All(srcEntries, e => Assert.DoesNotContain("/", e.Name));

        HttpResponseMessage deep = await client.GetAsync($"/repos/{sid}/commits/{sha}/tree?path=frontend/src/graph");
        deep.EnsureSuccessStatusCode();
        TreeEntryDto[] graphEntries = await deep.Content.ReadFromJsonAsync<TreeEntryDto[]>() ?? [];
        Assert.NotEmpty(graphEntries);
        Assert.All(graphEntries, e => Assert.DoesNotContain("/", e.Name));
    }

    [Fact]
    public async Task Requests_without_token_are_401()
    {
        HttpClient authed = _factory.CreateAuthedClient(); // builds the host with the test token
        HttpClient anonymous = _factory.CreateClient();
        Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.GetAsync("/repos/current")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.PostAsJsonAsync("/repos/x/reset", new { })).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.GetAsync("/repos/x/events")).StatusCode);
        // Health stays open: the Tauri shell probes it before it knows anything.
        Assert.Equal(HttpStatusCode.OK, (await anonymous.GetAsync("/health")).StatusCode);
        Assert.NotEqual(HttpStatusCode.Unauthorized, (await authed.GetAsync("/repos/recents")).StatusCode);
    }

    [Fact]
    public async Task Wrong_token_is_401_and_events_accepts_query_token()
    {
        _ = _factory.CreateAuthedClient();
        HttpClient wrong = _factory.CreateClient();
        wrong.DefaultRequestHeaders.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", TestAuth.Token + "x");
        Assert.Equal(HttpStatusCode.Unauthorized, (await wrong.GetAsync("/repos/recents")).StatusCode);

        string sid = await _factory.CreateAuthedClient().OpenSessionAsync(FindRepoRoot());
        HttpClient bare = _factory.CreateClient();
        using HttpResponseMessage events = await bare.GetAsync($"/repos/{sid}/events?token={TestAuth.Token}", HttpCompletionOption.ResponseHeadersRead);
        Assert.Equal(HttpStatusCode.OK, events.StatusCode);
    }

    private static string FindRepoRoot()
    {
        DirectoryInfo? cursor = new(AppContext.BaseDirectory);
        while (cursor is not null)
        {
            if (Directory.Exists(Path.Combine(cursor.FullName, ".git")))
            {
                return cursor.FullName;
            }

            cursor = cursor.Parent;
        }

        throw new DirectoryNotFoundException("Could not locate the PowerGit work tree.");
    }
}
