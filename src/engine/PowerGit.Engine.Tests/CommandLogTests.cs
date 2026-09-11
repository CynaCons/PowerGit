using System.Net.Http.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using Xunit;

namespace PowerGit.Engine.Tests;

/// <summary>
///  v0.15.1, the Git console. The rolling buffer must keep the last 50
///  invocations with their exit code, duration and output; a failure must
///  keep its stderr (that is the whole point of the failure card); and a
///  credential must never reach it, because the console is the one surface
///  a user copies into a bug report.
/// </summary>
public sealed class CommandLogTests
{
    [Fact]
    public void Buffer_keeps_only_the_last_fifty()
    {
        using TempRepo repo = new();
        GitHost host = new();
        host.Open(repo.Dir);
        long before = host.CommandLog().LastOrDefault()?.Id ?? 0;

        for (int i = 0; i < GitHost.CommandLogCapacity + 10; i++)
        {
            host.Run(repo.Dir, "rev-parse", "HEAD");
        }

        IReadOnlyList<GitLogEntryDto> log = host.CommandLog();
        Assert.Equal(GitHost.CommandLogCapacity, log.Count);
        // Oldest first, ids strictly increasing, and the ones from before the
        // loop have been pushed out.
        Assert.True(log[0].Id > before);
        for (int i = 1; i < log.Count; i++)
        {
            Assert.True(log[i].Id > log[i - 1].Id, $"ids not increasing at {i}");
        }
    }

    [Fact]
    public void Entry_records_the_command_exit_code_and_duration()
    {
        using TempRepo repo = new();
        GitHost host = new();
        host.Open(repo.Dir);

        host.Run(repo.Dir, "rev-parse", "--abbrev-ref", "HEAD");

        GitLogEntryDto entry = host.CommandLog()[^1];
        Assert.Equal("git rev-parse --abbrev-ref HEAD", entry.Command);
        Assert.Equal(0, entry.ExitCode);
        Assert.True(entry.Ok);
        Assert.True(entry.DurationMs >= 0 && entry.DurationMs < 30_000, $"implausible duration {entry.DurationMs}");
        Assert.False(entry.Truncated);
        Assert.True(DateTime.TryParse(entry.At, out _), $"not a timestamp: {entry.At}");
    }

    [Fact]
    public void Failing_command_is_recorded_with_its_stderr()
    {
        using TempRepo repo = new();
        GitHost host = new();
        host.Open(repo.Dir);

        host.Run(repo.Dir, "checkout", "no-such-branch-here");

        GitLogEntryDto entry = host.CommandLog()[^1];
        Assert.Equal("git checkout no-such-branch-here", entry.Command);
        Assert.NotEqual(0, entry.ExitCode);
        Assert.False(entry.Ok);
        Assert.Contains("no-such-branch-here", entry.Output, StringComparison.Ordinal);
    }

    // ---- the caller's verdict (v0.16.0) -----------------------------------

    [Fact]
    public void Untracked_file_diff_exits_1_and_is_still_ok()
    {
        // Owner (2026-09-11): "one of the files is new, I see 'git failed -
        // exit 1' with a diff of the new file." `git diff --no-index` exits 1
        // whenever the two sides differ, which every new file with content
        // does; the engine tolerated it, the log entry did not.
        using TempRepo repo = new();
        GitHost host = new();
        host.Open(repo.Dir);
        repo.Write("brand-new.txt", "line1\nline2\n");

        DiffDto diff = host.GetWorkTreeDiff("brand-new.txt", staged: false);

        Assert.Contains("+line1", diff.Text, StringComparison.Ordinal);
        GitLogEntryDto entry = host.CommandLog()[^1];
        Assert.Contains(" diff ", entry.Command, StringComparison.Ordinal);
        Assert.Contains("--no-index", entry.Command, StringComparison.Ordinal);
        Assert.Equal(1, entry.ExitCode);
        Assert.True(entry.Ok, "the caller's verdict must colour the entry, not git's exit code");
    }

    [Fact]
    public void A_verdict_never_forgives_a_timeout_or_a_cancellation()
    {
        // -1 is the engine's "never finished": whatever exit codes the caller
        // would accept, there was no exit to judge.
        GitHost host = new();
        host.RecordCommand(["diff", "--no-index"], -1, 5, null, "timed out", exit => exit <= 1);
        GitLogEntryDto timedOut = host.CommandLog()[^1];
        Assert.Equal(-1, timedOut.ExitCode);
        Assert.False(timedOut.Ok);

        // And a verdict that is not asked for is exit 0, nothing wider.
        host.RecordCommand(["diff", "--no-index"], 1, 5, "differs", null);
        Assert.False(host.CommandLog()[^1].Ok);
        host.RecordCommand(["diff", "--no-index"], 2, 5, null, "fatal", exit => exit <= 1);
        Assert.False(host.CommandLog()[^1].Ok);
    }

    [Fact]
    public void After_returns_only_newer_entries()
    {
        using TempRepo repo = new();
        GitHost host = new();
        host.Open(repo.Dir);
        host.Run(repo.Dir, "rev-parse", "HEAD");
        long seen = host.CommandLog()[^1].Id;

        host.Run(repo.Dir, "status", "--porcelain=v1");
        host.Run(repo.Dir, "rev-parse", "--abbrev-ref", "HEAD");

        IReadOnlyList<GitLogEntryDto> delta = host.CommandLog(seen);
        Assert.Equal(2, delta.Count);
        Assert.All(delta, e => Assert.True(e.Id > seen));
        Assert.Equal("git status --porcelain=v1", delta[0].Command);
        Assert.Empty(host.CommandLog(delta[^1].Id));
    }

    [Fact]
    public void A_message_with_spaces_stays_one_argument()
    {
        using TempRepo repo = new();
        GitHost host = new();
        host.Open(repo.Dir);
        repo.Write("logged.txt", "x\n");
        host.Run(repo.Dir, "add", "-A");

        host.Run(repo.Dir, "-c", "user.email=t@t", "-c", "user.name=t", "commit", "-m", "a subject with spaces");

        GitLogEntryDto entry = host.CommandLog()[^1];
        Assert.Contains("\"a subject with spaces\"", entry.Command, StringComparison.Ordinal);
    }

    // ---- sanitizing -------------------------------------------------------

    [Theory]
    [InlineData(
        "https://x-access-token:ghp_xxx@github.com/o/r.git",
        "https://x-access-token:***@github.com/o/r.git")]
    [InlineData("https://user:pw@host/p.git", "https://user:***@host/p.git")]
    [InlineData("https://ghp_onlyatoken@github.com/o/r.git", "https://***@github.com/o/r.git")]
    // ssh carries no secret in the URL: masking git@ would only make the
    // console lie about which remote it talked to.
    [InlineData("ssh://git@github.com/o/r.git", "ssh://git@github.com/o/r.git")]
    [InlineData("git@github.com:o/r.git", "git@github.com:o/r.git")]
    public void Credentials_are_stripped_from_urls(string raw, string expected)
    {
        Assert.Equal(expected, GitCommandSanitizer.Text(raw));
        Assert.Equal($"git push {expected}", GitCommandSanitizer.CommandLine(["push", raw]));
    }

    [Fact]
    public void Credentials_are_stripped_from_output_too()
    {
        // git echoes the remote it used in its own error lines.
        const string stderr = "fatal: Authentication failed for 'https://x-access-token:ghp_secret@github.com/o/r.git/'";
        string clean = GitCommandSanitizer.Text(stderr);
        Assert.DoesNotContain("ghp_secret", clean, StringComparison.Ordinal);
        Assert.Contains("https://x-access-token:***@github.com/o/r.git", clean, StringComparison.Ordinal);
    }

    [Fact]
    public void An_extraheader_bearer_token_is_masked()
    {
        Assert.Equal(
            "git -c http.extraHeader=*** fetch",
            GitCommandSanitizer.CommandLine(["-c", "http.extraHeader=Authorization: Basic c2VjcmV0", "fetch"]));
    }

    [Fact]
    public void A_recorded_entry_never_carries_the_token()
    {
        using TempRepo repo = new();
        GitHost host = new();
        host.Open(repo.Dir);

        // No network: the URL is in the argument of one command and in the
        // stdout of the next, which is both halves of the recording path.
        host.Run(repo.Dir, "remote", "add", "tokenized", "https://x-access-token:ghp_secret@github.com/o/r.git");
        GitLogEntryDto added = host.CommandLog()[^1];
        Assert.DoesNotContain("ghp_secret", added.Command, StringComparison.Ordinal);
        Assert.Contains("x-access-token:***@github.com/o/r.git", added.Command, StringComparison.Ordinal);

        host.Run(repo.Dir, "remote", "-v");
        GitLogEntryDto listed = host.CommandLog()[^1];
        Assert.Contains("tokenized", listed.Output, StringComparison.Ordinal);
        Assert.DoesNotContain("ghp_secret", listed.Output, StringComparison.Ordinal);
        Assert.Contains("x-access-token:***@github.com/o/r.git", listed.Output, StringComparison.Ordinal);
    }

    [Fact]
    public void Long_output_is_capped_with_a_marker()
    {
        using TempRepo repo = new();
        GitHost host = new();
        host.Open(repo.Dir);
        // ~40 KB on stdout from git itself, well past the 8 KB per-entry cap.
        repo.Write("big.txt", string.Join('\n', Enumerable.Range(0, 4000).Select(i => $"line {i} padding padding")));
        repo.StageAndCommit("big");

        host.Run(repo.Dir, "show", "HEAD");

        GitLogEntryDto entry = host.CommandLog()[^1];
        Assert.True(entry.Truncated);
        Assert.EndsWith(GitHost.TruncationMarker, entry.Output, StringComparison.Ordinal);
        Assert.Equal(GitHost.CommandLogEntryChars + GitHost.TruncationMarker.Length, entry.Output.Length);
    }
}

/// <summary>The HTTP shape the frontend polls.</summary>
public sealed class CommandLogApiTests(WebApplicationFactory<Program> factory) : IClassFixture<WebApplicationFactory<Program>>
{
    [Fact]
    public async Task Gitlog_returns_entries_and_honours_after()
    {
        using TempRepo repo = new();
        HttpClient client = factory.CreateAuthedClient();
        string sid = await client.OpenSessionAsync(repo.Dir);

        // Opening and this read already ran git; ask for everything.
        GitLogEntryDto[]? all = await client.GetFromJsonAsync<GitLogEntryDto[]>($"/repos/{sid}/gitlog");
        Assert.NotNull(all);
        Assert.NotEmpty(all);
        long seen = all[^1].Id;

        // A read route runs more git commands; they land in the log.
        (await client.GetAsync($"/repos/{sid}/status")).EnsureSuccessStatusCode();

        GitLogEntryDto[]? delta = await client.GetFromJsonAsync<GitLogEntryDto[]>($"/repos/{sid}/gitlog?after={seen}");
        Assert.NotNull(delta);
        Assert.NotEmpty(delta);
        Assert.All(delta, e => Assert.True(e.Id > seen));
        Assert.All(delta, e => Assert.StartsWith("git ", e.Command, StringComparison.Ordinal));
    }
}
