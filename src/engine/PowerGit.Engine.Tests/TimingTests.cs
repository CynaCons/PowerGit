using Xunit;

namespace PowerGit.Engine.Tests;

/// <summary>
/// Tests that assert a time budget run alone, after the parallel ones: with
/// the git processes of the other classes (WorkspacesTests, SubmoduleTests,
/// …) sharing the CPU, the 5,000-ref budget below failed in the full suite
/// and passed on its own (v0.20.10).
/// </summary>
[CollectionDefinition(Name, DisableParallelization = true)]
public sealed class TimingCollection
{
    public const string Name = "Timing";
}

[Collection(TimingCollection.Name)]
public sealed class TimingTests
{
    [Fact]
    public void GetRefs_handles_five_thousand_packed_refs_within_budget()
    {
        using TempRepo repo = new();
        string head = repo.Output("rev-parse", "HEAD");
        System.Diagnostics.ProcessStartInfo psi = new("git", "update-ref --stdin")
        {
            WorkingDirectory = repo.Dir, RedirectStandardInput = true, RedirectStandardError = true,
        };
        using (System.Diagnostics.Process process = System.Diagnostics.Process.Start(psi)!)
        {
            process.StandardInput.NewLine = "\n";
            for (int i = 0; i < 5000; i++) process.StandardInput.WriteLine($"create refs/heads/perf/{i:D5} {head}");
            process.StandardInput.Close();
            Assert.True(process.WaitForExit(60_000));
            Assert.Equal(0, process.ExitCode);
        }
        repo.Run("pack-refs", "--all");
        GitHost host = new();
        host.Open(repo.Dir);
        long best = long.MaxValue;
        for (int i = 0; i < 3; i++)
        {
            System.Diagnostics.Stopwatch watch = System.Diagnostics.Stopwatch.StartNew();
            RefTreeDto refs = host.GetRefs();
            watch.Stop();
            Assert.Equal(5002, refs.Branches.Length);
            best = Math.Min(best, watch.ElapsedMilliseconds);
        }
        // 130 ms on the audit machine; the budget leaves room for a loaded CI box (the
        // %(refname:short) it replaced took 2,578 ms on 5,577 refs, v0.18.10).
        Assert.True(best < 1000, $"GetRefs best of three was {best} ms");
    }

    [Fact]
    public void OpenFile_reports_a_bare_command_the_shell_rejects()
    {
        // GitHost.Files.cs gives the shell 400 ms to fail before it calls the
        // open a success; in the parallel suite cmd.exe took longer (v0.20.10).
        using TempRepo repo = new();
        GitHost host = new();
        host.Open(repo.Dir);
        InvalidOperationException shell = Assert.Throws<InvalidOperationException>(
            () => host.OpenFile("a.txt", "powergit-no-such-command-xyz --flag"));
        Assert.Contains("before opening the file", shell.Message);
    }
}
