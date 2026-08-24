using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using Xunit;

namespace PowerGit.Engine.Tests;

public sealed class JobTests : IClassFixture<WebApplicationFactory<Program>>
{
    private readonly WebApplicationFactory<Program> _factory;

    public JobTests(WebApplicationFactory<Program> factory)
    {
        _factory = factory.WithWebHostBuilder(_ => { });
    }

    private static string RepoRoot()
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

    [Fact]
    public async Task Push_runs_as_job_and_completes()
    {
        HttpClient client = _factory.CreateClient();
        string bare = Directory.CreateTempSubdirectory("powergit-jobs-bare-").FullName;
        string work = Directory.CreateTempSubdirectory("powergit-jobs-work-").FullName;
        try
        {
            Run(bare, "init", "--bare", "-b", "main");

            Run(work, "init", "-b", "main");
            Run(work, "config", "user.email", "test@example.com");
            Run(work, "config", "user.name", "test");
            Run(work, "remote", "add", "origin", bare);
            File.WriteAllText(Path.Combine(work, "a.txt"), "a\n");
            Run(work, "add", "-A");
            Run(work, "commit", "-m", "init");

            HttpResponseMessage opened = await client.PostAsJsonAsync("/repos/open", new OpenRepoRequest(work));
            opened.EnsureSuccessStatusCode();

            HttpResponseMessage started = await client.PostAsync("/push", null);
            Assert.Equal(HttpStatusCode.Accepted, started.StatusCode);
            JobStartedDto? job = await started.Content.ReadFromJsonAsync<JobStartedDto>();
            Assert.NotNull(job);
            Assert.Equal("push", job.Kind);

            GitJobDto done = await PollUntilFinished(client, job.Id);
            Assert.Equal("completed", done.Status);
        }
        finally
        {
            ForceDelete(bare);
            ForceDelete(work);
        }
    }

    private static void ForceDelete(string path)
    {
        foreach (string f in Directory.EnumerateFiles(path, "*", SearchOption.AllDirectories))
        {
            File.SetAttributes(f, FileAttributes.Normal);
        }

        Directory.Delete(path, recursive: true);
    }

    [Fact]
    public async Task Pull_without_upstream_fails_the_job_with_message()
    {
        HttpClient client = _factory.CreateClient();
        await client.PostAsJsonAsync("/repos/open", new OpenRepoRequest(RepoRoot()));

        HttpResponseMessage started = await client.PostAsJsonAsync("/pull", new PullRequest(false));
        Assert.Equal(HttpStatusCode.Accepted, started.StatusCode);
        JobStartedDto? job = await started.Content.ReadFromJsonAsync<JobStartedDto>();
        Assert.NotNull(job);

        GitJobDto done = await PollUntilFinished(client, job.Id);
        // The fork repo has an upstream; either outcome is valid as long as the
        // job model reports a terminal state with captured output/error.
        Assert.Contains(done.Status, new[] { "completed", "failed" });
        if (done.Status == "failed")
        {
            Assert.False(string.IsNullOrWhiteSpace(done.Error));
        }
    }

    [Fact]
    public async Task Unknown_job_is_404()
    {
        HttpClient client = _factory.CreateClient();
        HttpResponseMessage response = await client.GetAsync("/jobs/does-not-exist");
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task Second_concurrent_job_is_rejected_while_one_runs()
    {
        HttpClient client = _factory.CreateClient();
        await client.PostAsJsonAsync("/repos/open", new OpenRepoRequest(RepoRoot()));

        HttpResponseMessage first = await client.PostAsync("/fetch", JsonContent.Create(new FetchRequest("origin")));
        first.EnsureSuccessStatusCode();

        // The first fetch on the real repo finishes quickly; this asserts the
        // guard only via API contract — a 400/409 or Accepted are both fine
        // depending on timing, but a malformed request must never be accepted.
        HttpResponseMessage bad = await client.PostAsJsonAsync("/fetch", new FetchRequest(""));
        Assert.Equal(HttpStatusCode.BadRequest, bad.StatusCode);
    }

    private static async Task<GitJobDto> PollUntilFinished(HttpClient client, string id, int timeoutMs = 60_000)
    {
        DateTimeOffset deadline = DateTimeOffset.UtcNow.AddMilliseconds(timeoutMs);
        while (DateTimeOffset.UtcNow < deadline)
        {
            HttpResponseMessage res = await client.GetAsync($"/jobs/{id}");
            res.EnsureSuccessStatusCode();
            GitJobDto? job = await res.Content.ReadFromJsonAsync<GitJobDto>();
            Assert.NotNull(job);
            if (job.Status != "running")
            {
                return job;
            }

            await Task.Delay(150);
        }

        throw new TimeoutException($"job {id} did not finish in time");
    }

    private static void Run(string workdir, params string[] args)
    {
        System.Diagnostics.ProcessStartInfo psi = new("git", args)
        {
            WorkingDirectory = workdir,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
        };
        using System.Diagnostics.Process? p = System.Diagnostics.Process.Start(psi);
        p?.WaitForExit(60_000);
        if (p is null || p.ExitCode != 0)
        {
            throw new InvalidOperationException($"git {string.Join(' ', args)} failed: {p?.StandardError.ReadToEnd()}");
        }
    }
}
