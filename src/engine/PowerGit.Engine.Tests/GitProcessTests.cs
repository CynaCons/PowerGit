using System.Diagnostics;
using Xunit;

namespace PowerGit.Engine.Tests;

/// <summary>
/// v0.13.10: the process runner must not deadlock on a chatty stderr, must
/// honour its timeout even when the child never exits or never writes, and
/// must stop reading (and kill the child) past the stdout cap.
/// </summary>
public sealed class GitProcessTests
{
    // A shell that exists on every CI host: PowerShell on Windows (always
    // present), sh elsewhere. The scripts only need loops, sleep and stderr.
    private static (string File, string[] Args) Shell(string windowsScript, string posixScript) =>
        OperatingSystem.IsWindows()
            ? ("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", windowsScript])
            : ("/bin/sh", ["-c", posixScript]);

    [Fact]
    public void Floods_of_stderr_do_not_deadlock_and_are_capped()
    {
        // ~4 MB on stderr while stdout stays open: the pre-v0.13.10 runner
        // read stdout to EOF first, so the child blocked on a full stderr
        // pipe and the request hung forever.
        (string file, string[] args) = Shell(
            "$s = 'e' * 1000; for ($i = 0; $i -lt 4000; $i++) { [Console]::Error.WriteLine($s) }; [Console]::Out.WriteLine('done')",
            "i=0; s=$(printf 'e%.0s' $(seq 1 1000)); while [ $i -lt 4000 ]; do echo \"$s\" 1>&2; i=$((i+1)); done; echo done");

        Stopwatch sw = Stopwatch.StartNew();
        GitProcess.Result r = GitProcess.Run(file, args, null, 60_000);
        sw.Stop();

        Assert.Equal(0, r.ExitCode);
        Assert.Contains("done", r.StdOut);
        Assert.True(r.StdErr.Length <= 1 << 20, $"stderr not capped: {r.StdErr.Length}");
        Assert.True(sw.Elapsed < TimeSpan.FromSeconds(50), $"took {sw.Elapsed}");
    }

    [Fact]
    public void Child_that_never_exits_is_killed_on_timeout()
    {
        (string file, string[] args) = Shell("Start-Sleep -Seconds 60", "sleep 60");
        Stopwatch sw = Stopwatch.StartNew();
        TimeoutException ex = Assert.Throws<TimeoutException>(() => GitProcess.Run(file, args, null, 1_500));
        sw.Stop();
        Assert.Contains("timed out", ex.Message);
        Assert.True(sw.Elapsed < TimeSpan.FromSeconds(20), $"kill took {sw.Elapsed}");
    }

    [Fact]
    public void Cancellation_kills_the_child_and_throws_cancelled()
    {
        (string file, string[] args) = Shell("Start-Sleep -Seconds 60", "sleep 60");
        using CancellationTokenSource cts = new(700);
        Stopwatch sw = Stopwatch.StartNew();
        Assert.Throws<OperationCanceledException>(() => GitProcess.Run(file, args, null, 60_000, cts.Token));
        sw.Stop();
        Assert.True(sw.Elapsed < TimeSpan.FromSeconds(20), $"cancel took {sw.Elapsed}");
    }

    [Fact]
    public void Stdout_past_the_cap_is_truncated_and_the_child_stopped()
    {
        (string file, string[] args) = Shell(
            "$s = 'o' * 1000; for ($i = 0; $i -lt 20000; $i++) { [Console]::Out.WriteLine($s) }",
            "i=0; s=$(printf 'o%.0s' $(seq 1 1000)); while [ $i -lt 20000 ]; do echo \"$s\"; i=$((i+1)); done");

        GitProcess.Result r = GitProcess.Run(file, args, null, 60_000, default, maxStdOutChars: 50_000);
        Assert.True(r.StdOutTruncated);
        Assert.Equal(50_000, r.StdOut.Length);
        Assert.Equal(0, r.ExitCode);
    }

    [Fact]
    public void Real_git_still_works_through_the_runner()
    {
        GitHost host = new();
        Assert.Contains("git version", host.Version().Raw);
    }
}
