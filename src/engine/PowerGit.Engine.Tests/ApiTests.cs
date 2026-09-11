using Microsoft.Extensions.DependencyInjection;
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

    // v0.16.0: the file-history filter of /revisions is a query string, so
    // the UI's paging client stays the one it has; Path travels only on a
    // filtered answer.
    [Fact]
    public async Task Revisions_route_filters_by_path_and_omits_path_otherwise()
    {
        HttpClient client = _factory.CreateAuthedClient();
        using TempRepo repo = new();
        repo.Write("doc.txt", "one\n");
        repo.StageAndCommit("doc-1");
        repo.Write("other.txt", "x\n");
        repo.StageAndCommit("other-1");
        repo.Run("mv", "doc.txt", "renamed.txt");
        repo.StageAndCommit("doc-rename");
        string sid = await client.OpenSessionAsync(repo.Dir);

        HttpResponseMessage filtered = await client.GetAsync($"/repos/{sid}/revisions?path=renamed.txt");
        filtered.EnsureSuccessStatusCode();
        string json = await filtered.Content.ReadAsStringAsync();
        RevisionDto[] rows = System.Text.Json.JsonSerializer.Deserialize<RevisionDto[]>(json, new System.Text.Json.JsonSerializerOptions(System.Text.Json.JsonSerializerDefaults.Web)) ?? [];
        Assert.Equal(["doc-rename", "doc-1"], rows.Select(r => r.Subject));
        Assert.Equal(["renamed.txt", "doc.txt"], rows.Select(r => r.Path));
        Assert.Contains("\"path\"", json, StringComparison.Ordinal);

        HttpResponseMessage unfollowed = await client.GetAsync($"/repos/{sid}/revisions?path=renamed.txt&follow=false");
        unfollowed.EnsureSuccessStatusCode();
        RevisionDto[] plain = await unfollowed.Content.ReadFromJsonAsync<RevisionDto[]>() ?? [];
        Assert.Equal(["doc-rename"], plain.Select(r => r.Subject));

        HttpResponseMessage all = await client.GetAsync($"/repos/{sid}/revisions?max=10");
        all.EnsureSuccessStatusCode();
        string allJson = await all.Content.ReadAsStringAsync();
        Assert.DoesNotContain("\"path\"", allJson, StringComparison.Ordinal);
        Assert.Equal(5, (await client.GetFromJsonAsync<RevisionDto[]>($"/repos/{sid}/revisions?max=10"))!.Length);
    }

    // v0.16.0: the File Tree's blob for the Working directory / Index rows.
    [Fact]
    public async Task Blob_worktree_route_serves_the_disk_or_the_index_and_refuses_a_path_escape()
    {
        HttpClient client = _factory.CreateAuthedClient();
        using TempRepo repo = new();
        repo.Write("a.txt", "a\nstaged\n");
        repo.Run("add", "a.txt");
        repo.Write("a.txt", "a\nstaged\nunstaged\n");
        string sid = await client.OpenSessionAsync(repo.Dir);

        HttpResponseMessage disk = await client.GetAsync($"/repos/{sid}/blob/worktree?path=a.txt");
        disk.EnsureSuccessStatusCode();
        Assert.Equal("a\nstaged\nunstaged\n", (await disk.Content.ReadFromJsonAsync<DiffDto>())?.Text);

        HttpResponseMessage index = await client.GetAsync($"/repos/{sid}/blob/worktree?path=a.txt&staged=true");
        index.EnsureSuccessStatusCode();
        Assert.Equal("a\nstaged\n", (await index.Content.ReadFromJsonAsync<DiffDto>())?.Text);

        Assert.Equal(HttpStatusCode.BadRequest, (await client.GetAsync($"/repos/{sid}/blob/worktree?path=..%2Foutside.txt")).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.GetAsync($"/repos/{sid}/blob/worktree?path=")).StatusCode);
    }

    // v0.15.0 sequencer routes. Every one of these runs against a throwaway
    // TempRepo, never the real work tree.
    [Fact]
    public async Task Merge_conflict_route_answers_200_with_the_merging_state()
    {
        HttpClient client = _factory.CreateAuthedClient();
        using TempRepo repo = new();
        repo.Conflict();
        string sid = await client.OpenSessionAsync(repo.Dir);

        HttpResponseMessage merged = await client.PostAsJsonAsync($"/repos/{sid}/merge", new { branch = "topic" });
        Assert.Equal(HttpStatusCode.OK, merged.StatusCode);
        RepoStatusDto? status = await merged.Content.ReadFromJsonAsync<RepoStatusDto>();
        Assert.Equal("merging", status?.State);
        Assert.Equal("merge", status?.Operation?.Kind);
        Assert.Contains(status!.Unstaged, f => f.Path == "conflict.txt" && f.Status == "C");

        HttpResponseMessage conflicts = await client.GetAsync($"/repos/{sid}/conflicts");
        conflicts.EnsureSuccessStatusCode();
        ConflictFileDto[] list = await conflicts.Content.ReadFromJsonAsync<ConflictFileDto[]>() ?? [];
        Assert.Equal("both-modified", Assert.Single(list).Kind);

        HttpResponseMessage blob = await client.GetAsync($"/repos/{sid}/conflicts/blob?path=conflict.txt&stage=3");
        blob.EnsureSuccessStatusCode();
        Assert.Equal("topic", (await blob.Content.ReadFromJsonAsync<DiffDto>())?.Text.Trim());

        HttpResponseMessage aborted = await client.PostAsJsonAsync($"/repos/{sid}/merge/abort", new { });
        Assert.Equal(HttpStatusCode.OK, aborted.StatusCode);
        Assert.Equal("none", (await aborted.Content.ReadFromJsonAsync<RepoStatusDto>())?.State);

        // ff-only against a diverged branch is still a plain 400.
        HttpResponseMessage ffOnly = await client.PostAsJsonAsync($"/repos/{sid}/merge", new { branch = "topic", ff = "only" });
        Assert.Equal(HttpStatusCode.BadRequest, ffOnly.StatusCode);
    }

    [Fact]
    public async Task Rebase_todo_is_a_post_and_leaves_no_state()
    {
        HttpClient client = _factory.CreateAuthedClient();
        using TempRepo repo = new();
        repo.Conflict("topic");
        string sid = await client.OpenSessionAsync(repo.Dir);

        // GET is not mapped: capturing touches the git dir, so it must take
        // the group's Mutate gate like any other mutation.
        Assert.Equal(HttpStatusCode.MethodNotAllowed, (await client.GetAsync($"/repos/{sid}/rebase/todo")).StatusCode);

        HttpResponseMessage todo = await client.PostAsJsonAsync($"/repos/{sid}/rebase/todo", new { onto = "main" });
        todo.EnsureSuccessStatusCode();
        RebaseTodoDto? body = await todo.Content.ReadFromJsonAsync<RebaseTodoDto>();
        Assert.Equal("topic", body?.HeadName);
        Assert.Equal("pick", Assert.Single(body!.Lines).Action);

        HttpResponseMessage status = await client.GetAsync($"/repos/{sid}/status");
        Assert.Equal("none", (await status.Content.ReadFromJsonAsync<RepoStatusDto>())?.State);
    }

    [Fact]
    public async Task Sequencer_routes_answer_409_while_a_job_holds_the_gate()
    {
        HttpClient client = _factory.CreateAuthedClient();
        using TempRepo repo = new();
        string sid = await client.OpenSessionAsync(repo.Dir);
        GitHost session = _factory.Services.GetRequiredService<RepoRegistry>().Get(sid)!;

        using ManualResetEventSlim held = new(false);
        using ManualResetEventSlim release = new(false);
        session.StartJob("fetch", () =>
        {
            held.Set();
            release.Wait();
            return "done";
        });
        held.Wait();

        try
        {
            HttpResponseMessage collide = await client.PostAsJsonAsync($"/repos/{sid}/merge", new { branch = "feature" });
            Assert.Equal(HttpStatusCode.Conflict, collide.StatusCode);
            Assert.Contains("fetch", (await collide.Content.ReadFromJsonAsync<BusyResponse>())?.Running ?? "", StringComparison.Ordinal);

            // Reads bypass the gate, mutations do not.
            Assert.Equal(HttpStatusCode.OK, (await client.GetAsync($"/repos/{sid}/conflicts")).StatusCode);
            Assert.Equal(HttpStatusCode.Conflict, (await client.PostAsJsonAsync($"/repos/{sid}/rebase/todo", new { onto = "feature" })).StatusCode);
        }
        finally
        {
            release.Set();
        }
    }

    private static string FindRepoRoot()
    {
        DirectoryInfo? cursor = new(AppContext.BaseDirectory);
        while (cursor is not null)
        {
            // A git worktree has `.git` as a FILE, not a directory (the same
            // check GitHost.TryDiscover makes): without the File.Exists arm every
            // test using this helper fails when the suite runs from a worktree.
            if (Directory.Exists(Path.Combine(cursor.FullName, ".git")) || File.Exists(Path.Combine(cursor.FullName, ".git")))
            {
                return cursor.FullName;
            }

            cursor = cursor.Parent;
        }

        throw new DirectoryNotFoundException("Could not locate the PowerGit work tree.");
    }
}
