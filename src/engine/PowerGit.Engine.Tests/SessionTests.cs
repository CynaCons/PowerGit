using Microsoft.Extensions.DependencyInjection;
using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using Xunit;

namespace PowerGit.Engine.Tests;

/// <summary>v0.13.6: many repositories per engine, one write gate per repository.</summary>
public sealed class SessionTests : IClassFixture<WebApplicationFactory<Program>>
{
    private readonly WebApplicationFactory<Program> _factory;

    public SessionTests(WebApplicationFactory<Program> factory)
    {
        _factory = factory.WithWebHostBuilder(_ => { });
    }

    [Fact]
    public async Task Two_repos_stay_open_and_answer_interleaved_queries()
    {
        HttpClient client = _factory.CreateAuthedClient();
        using TempRepo a = TempRepo.Create("alpha");
        using TempRepo b = TempRepo.Create("beta");
        string sidA = await client.OpenSessionAsync(a.Dir);
        string sidB = await client.OpenSessionAsync(b.Dir);
        Assert.NotEqual(sidA, sidB);

        // Interleave: each session must keep answering for ITS root, no
        // matter what was opened last (the old singleton swapped roots).
        for (int i = 0; i < 3; i++)
        {
            RepoStatusDto? statusA = await client.GetFromJsonAsync<RepoStatusDto>($"/repos/{sidA}/status");
            RepoStatusDto? statusB = await client.GetFromJsonAsync<RepoStatusDto>($"/repos/{sidB}/status");
            Assert.Equal("alpha", statusA?.Branch);
            Assert.Equal("beta", statusB?.Branch);
        }

        RepoInfo[] list = await client.GetFromJsonAsync<RepoInfo[]>("/repos") ?? [];
        Assert.Contains(list, r => r.Id == sidA);
        Assert.Contains(list, r => r.Id == sidB);

        // Opening the same root again reuses the session id.
        Assert.Equal(sidA, await client.OpenSessionAsync(a.Dir));
    }

    [Fact]
    public async Task Unknown_session_is_404_and_close_removes_it()
    {
        HttpClient client = _factory.CreateAuthedClient();
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync("/repos/nope/status")).StatusCode);

        using TempRepo repo = TempRepo.Create("main");
        string sid = await client.OpenSessionAsync(repo.Dir);
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync($"/repos/{sid}/status")).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await client.DeleteAsync($"/repos/{sid}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync($"/repos/{sid}/status")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.DeleteAsync($"/repos/{sid}")).StatusCode);
    }

    [Fact]
    public async Task Concurrent_mutations_serialize_or_answer_409_and_reads_pass()
    {
        HttpClient client = _factory.CreateAuthedClient();
        using TempRepo repo = TempRepo.Create("main");
        string sid = await client.OpenSessionAsync(repo.Dir);
        RepoRegistry registry = _factory.Services.GetRequiredService<RepoRegistry>();
        GitHost session = registry.Get(sid)!;

        // Hold the write gate like a long checkout would, then prove that a
        // mutation collides (409 with what is running) while a read passes.
        using ManualResetEventSlim release = new(false);
        using ManualResetEventSlim held = new(false);
        Task holder = Task.Run(() => session.Mutate("test checkout", () =>
        {
            held.Set();
            release.Wait();
            return 0;
        }));
        held.Wait();

        HttpResponseMessage collide = await client.PostAsJsonAsync($"/repos/{sid}/stage", new { paths = new[] { "a.txt" }, stage = true });
        Assert.Equal(HttpStatusCode.Conflict, collide.StatusCode);
        BusyResponse? busy = await collide.Content.ReadFromJsonAsync<BusyResponse>();
        Assert.Equal("test checkout", busy?.Running);

        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync($"/repos/{sid}/status")).StatusCode);

        release.Set();
        await holder;

        // Gate released: the same mutation now goes through (400 at worst
        // for a bad path, never 409).
        HttpResponseMessage after = await client.PostAsJsonAsync($"/repos/{sid}/stage", new { paths = new[] { "a.txt" }, stage = true });
        Assert.NotEqual(HttpStatusCode.Conflict, after.StatusCode);
    }

    [Fact]
    public async Task Files_reset_restores_tracked_files_and_deletes_untracked_ones()
    {
        // v0.13.14 commit-dialog context menu "Reset file(s) to HEAD".
        HttpClient client = _factory.CreateAuthedClient();
        using TempRepo repo = TempRepo.Create("main");
        string tracked = Path.Combine(repo.Dir, "a.txt");
        string added = Path.Combine(repo.Dir, "new.txt");
        string untouched = Path.Combine(repo.Dir, "keep.txt");
        File.WriteAllText(tracked, "changed\n");
        File.WriteAllText(added, "new\n");
        File.WriteAllText(untouched, "keep\n");
        string sid = await client.OpenSessionAsync(repo.Dir);

        HttpResponseMessage res = await client.PostAsJsonAsync($"/repos/{sid}/files/reset", new { paths = new[] { "a.txt", "new.txt" } });
        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        // core.autocrlf may check the file out with CRLF on Windows; compare content, not line endings.
        Assert.Equal("a", File.ReadAllText(tracked).TrimEnd('\r', '\n'));
        Assert.False(File.Exists(added));
        Assert.True(File.Exists(untouched), "a path not in the request is left alone");
        await client.DeleteAsync($"/repos/{sid}");
    }

    private sealed class TempRepo : IDisposable
    {
        public string Dir { get; }

        private TempRepo(string dir) => Dir = dir;

        public static TempRepo Create(string branch)
        {
            string dir = Directory.CreateTempSubdirectory("powergit-session-").FullName;
            Run(dir, "init", "-q", "-b", branch);
            Run(dir, "config", "user.email", "t@example.com");
            Run(dir, "config", "user.name", "test");
            File.WriteAllText(Path.Combine(dir, "a.txt"), "a\n");
            Run(dir, "add", "-A");
            Run(dir, "commit", "-q", "-m", "init");
            return new TempRepo(dir);
        }

        public void Dispose()
        {
            try { Directory.Delete(Dir, recursive: true); } catch { /* best effort */ }
        }

        private static void Run(string cwd, params string[] args)
        {
            System.Diagnostics.ProcessStartInfo psi = new("git") { WorkingDirectory = cwd, RedirectStandardOutput = true, RedirectStandardError = true };
            foreach (string a in args)
            {
                psi.ArgumentList.Add(a);
            }

            using System.Diagnostics.Process p = System.Diagnostics.Process.Start(psi)!;
            p.WaitForExit();
            if (p.ExitCode != 0)
            {
                throw new InvalidOperationException($"git {string.Join(' ', args)} failed: {p.StandardError.ReadToEnd()}");
            }
        }
    }
}
