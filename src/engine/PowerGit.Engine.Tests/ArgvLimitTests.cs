using System.Net;
using System.Net.Http.Json;
using System.Diagnostics;
using Microsoft.AspNetCore.Mvc.Testing;
using Xunit;

namespace PowerGit.Engine.Tests;

public sealed class ArgvLimitTests(WebApplicationFactory<Program> factory) : IClassFixture<WebApplicationFactory<Program>>
{
    private readonly WebApplicationFactory<Program> _factory = factory.WithWebHostBuilder(_ => { });

    [Fact]
    public void Stage_and_unstage_three_thousand_paths_use_stdin_without_leaking_paths_to_the_command_log()
    {
        using TempRepo repo = new();
        List<string> paths = [];
        for (int i = 0; i < 2999; i++)
        {
            string path = $"nested/{i / 100:D2}/file-{i:D4}.txt";
            paths.Add(path);
            repo.Write(path, "tracked\n");
        }
        // Windows forbids `"` in a file name; Unix exercises all three pathspec
        // characters while the Windows run keeps the representable space + Unicode case.
        string unusual = OperatingSystem.IsWindows() ? "dir with space/éé q.txt" : "dir with space/éé \"q\".txt";
        paths.Add(unusual);
        repo.Write(unusual, "tracked\n");
        CommitAll(repo.Dir, "three thousand tracked files");
        foreach (string path in paths) repo.Write(path, "modified\n");

        GitHost host = new();
        host.Open(repo.Dir);
        host.Stage(paths, unstage: false);
        Assert.Equal(3000, repo.Output("diff", "--cached", "--name-only").Split('\n', StringSplitOptions.RemoveEmptyEntries).Length);

        GitLogEntryDto staged = host.CommandLog().Last(e => e.Command.Contains("pathspec-from-file=-", StringComparison.Ordinal));
        Assert.Contains("(3000 refs on stdin)", staged.Command, StringComparison.Ordinal);
        Assert.DoesNotContain(unusual, staged.Command, StringComparison.Ordinal);

        host.Stage(paths, unstage: true);
        Assert.Empty(repo.Output("diff", "--cached", "--name-only"));

        host.Stage([unusual], unstage: false);
        Assert.NotEmpty(repo.Output("diff", "--cached", "--name-only"));
        host.Stage([unusual], unstage: true);
        Assert.Empty(repo.Output("diff", "--cached", "--name-only"));

        host.Stage([], unstage: false, all: true);
        Assert.Empty(host.GetStatus().Unstaged);
    }

    [Fact]
    public async Task Post_revisions_with_four_hundred_refs_returns_rows_and_rejects_an_unknown_ref()
    {
        HttpClient client = _factory.CreateAuthedClient();
        using TempRepo repo = new();
        string head = repo.HeadId();
        string[] refs = Enumerable.Range(0, 400).Select(i => $"refs/heads/argv-{i:D3}").ToArray();
        foreach (string name in refs) repo.Run("update-ref", name, head);
        string sid = await client.OpenSessionAsync(repo.Dir);

        HttpResponseMessage ok = await client.PostAsJsonAsync($"/repos/{sid}/revisions", new RevisionRequest(Refs: refs));
        Assert.Equal(HttpStatusCode.OK, ok.StatusCode);
        Assert.NotEmpty(await ok.Content.ReadFromJsonAsync<RevisionDto[]>() ?? []);

        HttpResponseMessage unknown = await client.PostAsJsonAsync(
            $"/repos/{sid}/revisions", new RevisionRequest(Refs: [.. refs, "refs/heads/nope"]));
        Assert.Equal(HttpStatusCode.BadRequest, unknown.StatusCode);
        Assert.Contains("refs/heads/nope", (await unknown.Content.ReadFromJsonAsync<ErrorResponse>())!.Error, StringComparison.Ordinal);
    }

    private static void CommitAll(string directory, string message)
    {
        RunGit(directory, "add", "-A");
        RunGit(directory, "commit", "-m", message);
    }

    private static void RunGit(string directory, params string[] args)
    {
        ProcessStartInfo start = new("git") { WorkingDirectory = directory };
        foreach (string arg in args) start.ArgumentList.Add(arg);
        using Process process = Process.Start(start)!;
        Assert.True(process.WaitForExit(120_000), $"git {string.Join(' ', args)} timed out");
        Assert.Equal(0, process.ExitCode);
    }
}
