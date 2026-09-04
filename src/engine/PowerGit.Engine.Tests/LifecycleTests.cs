using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using Xunit;

namespace PowerGit.Engine.Tests;

/// <summary>
/// v0.13.10 job-route contract (session-qualified Location, cancel) and
/// v0.13.11 lifecycle (idle eviction, watcher disposal, bounded blobs).
/// </summary>
public sealed class LifecycleTests : IClassFixture<WebApplicationFactory<Program>>
{
    private readonly WebApplicationFactory<Program> _factory;

    public LifecycleTests(WebApplicationFactory<Program> factory)
    {
        _factory = factory.WithWebHostBuilder(_ => { });
    }

    private static string MakeRepo(Action<string>? extra = null)
    {
        string work = Directory.CreateTempSubdirectory("powergit-life-").FullName;
        Git(work, "init", "-b", "main");
        Git(work, "config", "user.email", "test@example.com");
        Git(work, "config", "user.name", "test");
        File.WriteAllText(Path.Combine(work, "a.txt"), "a\n");
        Git(work, "add", "-A");
        Git(work, "commit", "-m", "init");
        extra?.Invoke(work);
        return work;
    }

    [Fact]
    public async Task Job_location_header_is_session_qualified()
    {
        HttpClient client = _factory.CreateAuthedClient();
        string work = MakeRepo();
        try
        {
            string sid = await client.OpenSessionAsync(work);
            HttpResponseMessage started = await client.PostAsync($"/repos/{sid}/push", null);
            Assert.Equal(HttpStatusCode.Accepted, started.StatusCode);
            JobStartedDto? job = await started.Content.ReadFromJsonAsync<JobStartedDto>();
            Assert.NotNull(job);
            Assert.Equal($"/repos/{sid}/jobs/{job.Id}", started.Headers.Location?.ToString());

            // The Location must be pollable as-is.
            HttpResponseMessage polled = await client.GetAsync(started.Headers.Location);
            Assert.Equal(HttpStatusCode.OK, polled.StatusCode);
            GitJobDto? dto = await polled.Content.ReadFromJsonAsync<GitJobDto>();
            Assert.NotNull(dto);
            Assert.StartsWith("git push", dto.Command);
            Assert.False(string.IsNullOrEmpty(dto.StartedAt));
        }
        finally
        {
            ForceDelete(work);
        }
    }

    [Fact]
    public async Task Running_job_can_be_cancelled_and_reports_cancelled()
    {
        HttpClient client = _factory.CreateAuthedClient();
        // A remote that never answers: a TCP listener that accepts and stalls.
        using System.Net.Sockets.TcpListener stall = new(IPAddress.Loopback, 0);
        stall.Start();
        int port = ((IPEndPoint)stall.LocalEndpoint).Port;
        string work = MakeRepo(w => Git(w, "remote", "add", "origin", $"http://127.0.0.1:{port}/never.git"));
        try
        {
            string sid = await client.OpenSessionAsync(work);
            HttpResponseMessage started = await client.PostAsJsonAsync($"/repos/{sid}/fetch", new FetchRequest("origin"));
            Assert.Equal(HttpStatusCode.Accepted, started.StatusCode);
            JobStartedDto job = (await started.Content.ReadFromJsonAsync<JobStartedDto>())!;

            await Task.Delay(300);
            HttpResponseMessage cancel = await client.PostAsync($"/repos/{sid}/jobs/{job.Id}/cancel", null);
            // Either it was still running (200) or git had already failed fast (404); both are legal.
            Assert.Contains(cancel.StatusCode, new[] { HttpStatusCode.OK, HttpStatusCode.NotFound });

            GitJobDto done = await Poll(client, sid, job.Id);
            Assert.Equal("failed", done.Status);
            if (cancel.StatusCode == HttpStatusCode.OK)
            {
                Assert.True(done.Cancelled, done.Error);
            }

            // The gate is released: a mutation is accepted again.
            HttpResponseMessage status = await client.GetAsync($"/repos/{sid}/status");
            Assert.Equal(HttpStatusCode.OK, status.StatusCode);
            HttpResponseMessage again = await client.PostAsJsonAsync($"/repos/{sid}/fetch", new FetchRequest("origin"));
            Assert.Equal(HttpStatusCode.Accepted, again.StatusCode);
            JobStartedDto second = (await again.Content.ReadFromJsonAsync<JobStartedDto>())!;
            await client.PostAsync($"/repos/{sid}/jobs/{second.Id}/cancel", null);
            await Poll(client, sid, second.Id);
        }
        finally
        {
            stall.Stop();
            ForceDelete(work);
        }
    }

    [Fact]
    public void Idle_sessions_are_evicted_but_busy_and_current_ones_survive()
    {
        RepoRegistry registry = new();
        string a = MakeRepo();
        string b = MakeRepo();
        string c = MakeRepo();
        try
        {
            string idA = registry.Open(a).Id;
            string idB = registry.Open(b).Id;
            string idC = registry.Open(c).Id; // last opened: protected

            DateTime future = DateTime.UtcNow.AddHours(2);
            // B is "busy": hold its write gate.
            GitHost hostB = registry.Get(idB)!;
            using ManualResetEventSlim release = new();
            Thread holder = new(() => hostB.Mutate("test", () => release.Wait()));
            holder.Start();
            SpinWait.SpinUntil(() => hostB.IsBusy, 2000);

            IReadOnlyList<string> closed = registry.PruneIdle(TimeSpan.FromMinutes(30), future);
            Assert.Equal([idA], closed);
            Assert.Null(registry.Get(idA));
            Assert.NotNull(registry.Get(idB));
            Assert.NotNull(registry.Get(idC));
            release.Set();
            holder.Join();

            // Touched sessions are kept.
            registry.Get(idB)!.Touch();
            Assert.Empty(registry.PruneIdle(TimeSpan.FromMinutes(30)));
        }
        finally
        {
            registry.Close(GitHost.IdFor(a));
            registry.Close(GitHost.IdFor(b));
            registry.Close(GitHost.IdFor(c));
            ForceDelete(a);
            ForceDelete(b);
            ForceDelete(c);
        }
    }

    [Fact]
    public void Repeated_open_close_leaves_no_watchers()
    {
        RepoRegistry registry = new();
        string work = MakeRepo();
        try
        {
            for (int i = 0; i < 25; i++)
            {
                RepoInfo info = registry.Open(work);
                GitHost host = registry.Get(info.Id)!;
                Assert.InRange(host.ActiveWatchers, 1, 2);
                Assert.True(registry.Close(info.Id));
                Assert.Equal(0, host.ActiveWatchers);
            }

            Assert.Empty(registry.List());
        }
        finally
        {
            ForceDelete(work);
        }
    }

    [Fact]
    public void Watcher_only_covers_metadata_paths()
    {
        // The narrowed watchers still see HEAD/refs/index moves.
        RepoRegistry registry = new();
        string work = MakeRepo();
        try
        {
            RepoInfo info = registry.Open(work);
            GitHost host = registry.Get(info.Id)!;
            long before = host.ChangeVersion;
            Git(work, "branch", "feature");
            SpinWait.SpinUntil(() => host.ChangeVersion != before, 5000);
            Assert.NotEqual(before, host.ChangeVersion);
            Assert.Equal(GitChangeKind.Refs, GitHost.ChangeKindOf(host.ChangeVersion));
            registry.Close(info.Id);
        }
        finally
        {
            ForceDelete(work);
        }
    }

    [Fact]
    public async Task Oversized_blob_comes_back_truncated_with_metadata()
    {
        HttpClient client = _factory.CreateAuthedClient();
        string work = MakeRepo(w =>
        {
            // 3 MB of text: past MaxBlobBytes (2 MB), so the DTO must carry
            // the real size and an explicit truncation flag, not a sentinel.
            string line = new string('x', 99) + "\n";
            File.WriteAllText(Path.Combine(w, "big.txt"), string.Concat(Enumerable.Repeat(line, 31_000)));
            File.WriteAllText(Path.Combine(w, "many.txt"), string.Concat(Enumerable.Repeat("l\n", 60_000)));
            Git(w, "add", "-A");
            Git(w, "commit", "-m", "big");
        });
        try
        {
            string sid = await client.OpenSessionAsync(work);
            DiffDto? big = await client.GetFromJsonAsync<DiffDto>($"/repos/{sid}/commits/HEAD/blob?path=big.txt");
            Assert.NotNull(big);
            Assert.True(big.Truncated);
            Assert.Equal("size", big.TruncatedReason);
            Assert.Equal(3_100_000, big.SizeBytes);
            Assert.True(big.Text.Length <= GitHost.MaxBlobBytes);
            Assert.DoesNotContain("truncated", big.Text);

            DiffDto? many = await client.GetFromJsonAsync<DiffDto>($"/repos/{sid}/commits/HEAD/blob?path=many.txt");
            Assert.NotNull(many);
            Assert.True(many.Truncated);
            Assert.Equal("lines", many.TruncatedReason);
            Assert.Equal(GitHost.MaxLines, many.Text.Count(ch => ch == '\n') + 1);

            DiffDto? small = await client.GetFromJsonAsync<DiffDto>($"/repos/{sid}/commits/HEAD/blob?path=a.txt");
            Assert.NotNull(small);
            Assert.False(small.Truncated);
            Assert.Equal(2, small.SizeBytes);
        }
        finally
        {
            ForceDelete(work);
        }
    }

    [Fact]
    public async Task Sessions_endpoint_reports_lifecycle_facts()
    {
        HttpClient client = _factory.CreateAuthedClient();
        string work = MakeRepo();
        try
        {
            string sid = await client.OpenSessionAsync(work);
            SessionDto[]? sessions = await client.GetFromJsonAsync<SessionDto[]>("/repos/sessions");
            Assert.NotNull(sessions);
            SessionDto mine = Assert.Single(sessions, s => s.Id == sid);
            Assert.False(mine.Busy);
            Assert.InRange(mine.Watchers, 1, 2);
            Assert.False(string.IsNullOrEmpty(mine.LastUsed));
        }
        finally
        {
            ForceDelete(work);
        }
    }

    private static async Task<GitJobDto> Poll(HttpClient client, string sid, string id)
    {
        DateTimeOffset deadline = DateTimeOffset.UtcNow.AddSeconds(30);
        while (DateTimeOffset.UtcNow < deadline)
        {
            GitJobDto? job = await client.GetFromJsonAsync<GitJobDto>($"/repos/{sid}/jobs/{id}");
            Assert.NotNull(job);
            if (job.Status != "running")
            {
                return job;
            }

            await Task.Delay(100);
        }

        throw new TimeoutException($"job {id} did not finish");
    }

    private static void ForceDelete(string path)
    {
        const int attempts = 40;
        for (int attempt = 1; attempt <= attempts; attempt++)
        {
            try
            {
                if (!Directory.Exists(path))
                {
                    return;
                }

                foreach (string f in Directory.EnumerateFiles(path, "*", SearchOption.AllDirectories))
                {
                    File.SetAttributes(f, FileAttributes.Normal);
                }

                Directory.Delete(path, recursive: true);
                return;
            }
            catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
            {
                if (attempt == attempts)
                {
                    Console.WriteLine($"Test cleanup left '{path}' in place after {attempts} attempts: {ex.Message}");
                    return;
                }

                Thread.Sleep(250);
            }
        }
    }

    private static void Git(string workdir, params string[] args)
    {
        System.Diagnostics.ProcessStartInfo psi = new("git", args)
        {
            WorkingDirectory = workdir,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
        };
        using System.Diagnostics.Process? p = System.Diagnostics.Process.Start(psi);
        string err = p?.StandardError.ReadToEnd() ?? "";
        p?.WaitForExit(60_000);
        if (p is null || p.ExitCode != 0)
        {
            throw new InvalidOperationException($"git {string.Join(' ', args)} failed: {err}");
        }
    }
}
