using Xunit;

namespace PowerGit.Engine.Tests;

/// <summary>
///  v0.20.7: GetRefs lists submodules without `git submodule status
///  --recursive` (0.8 s on Windows for two nested modules, on every refs
///  refresh). The rows must stay what that command reports.
/// </summary>
public sealed class SubmoduleTests
{
    /// <summary>Today's rows, parsed the way GetRefs parsed them before v0.20.7.</summary>
    private static List<SubmoduleDto> StatusRecursive(TempRepo repo)
    {
        List<SubmoduleDto> rows = [];
        foreach (string line in repo.Output("submodule", "status", "--recursive").Split('\n', StringSplitOptions.RemoveEmptyEntries))
        {
            string[] bits = line.TrimStart(' ', '-', '+', 'U').Split(' ', 3, StringSplitOptions.RemoveEmptyEntries);
            if (bits.Length >= 2)
            {
                rows.Add(new SubmoduleDto(Path.GetFileName(bits[1]), bits[1], bits[0]));
            }
        }

        return rows;
    }

    private static void AddSubmodule(TempRepo into, TempRepo module, string path)
    {
        into.Run("-c", "protocol.file.allow=always", "submodule", "add", module.Dir.Replace('\\', '/'), path);
        into.StageAndCommit("add " + path);
    }

    [Fact]
    public void No_gitmodules_lists_nothing_and_runs_no_submodule_process()
    {
        using TempRepo repo = new();
        GitHost host = new();
        host.Open(repo.Dir);
        long before = host.CommandLog().LastOrDefault()?.Id ?? 0;

        Assert.Empty(host.GetRefs().Submodules);
        Assert.DoesNotContain(host.CommandLog(), e => e.Id > before && (e.Command.Contains("submodule") || e.Command.Contains("ls-files")));
    }

    [Fact]
    public void Initialised_submodule_matches_submodule_status()
    {
        using TempRepo module = new();
        using TempRepo repo = new();
        AddSubmodule(repo, module, "libs/mod");
        GitHost host = new();
        host.Open(repo.Dir);

        SubmoduleDto[] rows = host.GetRefs().Submodules;

        Assert.Equal(StatusRecursive(repo), rows);
        SubmoduleDto only = Assert.Single(rows);
        Assert.Equal(new SubmoduleDto("mod", "libs/mod", module.HeadId()), only);
    }

    [Fact]
    public void Checked_out_commit_wins_over_the_recorded_one()
    {
        // `submodule status` shows the module's HEAD ("+sha" when it moved).
        using TempRepo module = new();
        using TempRepo repo = new();
        AddSubmodule(repo, module, "mod");
        string moved = Path.Combine(repo.Dir, "mod");
        Git(moved, "checkout", "-q", "feature");
        GitHost host = new();
        host.Open(repo.Dir);

        SubmoduleDto row = Assert.Single(host.GetRefs().Submodules);

        Assert.Equal(StatusRecursive(repo), [row]);
        Assert.Equal(Git(moved, "rev-parse", "HEAD"), row.Head);
    }

    [Fact]
    public void Nested_submodules_are_listed_depth_first_with_full_paths()
    {
        using TempRepo inner = new();
        using TempRepo middle = new();
        using TempRepo repo = new();
        AddSubmodule(middle, inner, "inner");
        AddSubmodule(repo, middle, "middle");
        repo.Run("-c", "protocol.file.allow=always", "submodule", "update", "--init", "--recursive");
        GitHost host = new();
        host.Open(repo.Dir);

        SubmoduleDto[] rows = host.GetRefs().Submodules;

        Assert.Equal(StatusRecursive(repo), rows);
        Assert.Equal(["middle", "middle/inner"], rows.Select(r => r.Path));
    }

    [Fact]
    public void A_second_refresh_runs_no_process_until_gitmodules_or_the_index_changes()
    {
        using TempRepo first = new();
        using TempRepo second = new();
        using TempRepo repo = new();
        AddSubmodule(repo, first, "first");
        GitHost host = new();
        host.Open(repo.Dir);
        Assert.Single(host.GetRefs().Submodules);

        long before = host.CommandLog().LastOrDefault()?.Id ?? 0;
        Assert.Single(host.GetRefs().Submodules);
        Assert.DoesNotContain(host.CommandLog(), e => e.Id > before && e.Command.Contains("ls-files"));

        AddSubmodule(repo, second, "second");
        Assert.Equal(["first", "second"], host.GetRefs().Submodules.Select(s => s.Path));
    }

    [Fact]
    public void Uninitialised_submodule_shows_the_recorded_commit()
    {
        using TempRepo module = new();
        using TempRepo source = new();
        AddSubmodule(source, module, "mod");
        string clone = Directory.CreateTempSubdirectory("powergit-clone-").FullName;
        try
        {
            Git(Path.GetDirectoryName(clone)!, "clone", "-q", source.Dir.Replace('\\', '/'), clone);
            GitHost host = new();
            host.Open(clone);

            SubmoduleDto row = Assert.Single(host.GetRefs().Submodules);

            Assert.Equal(new SubmoduleDto("mod", "mod", module.HeadId()), row);
            Assert.StartsWith("-", Git(clone, "submodule", "status"));
        }
        finally
        {
            try
            {
                Directory.Delete(clone, recursive: true);
            }
            catch
            {
                // best effort, as TempRepo.Dispose
            }
        }
    }

    private static string Git(string dir, params string[] args)
    {
        System.Diagnostics.ProcessStartInfo psi = new("git")
        {
            WorkingDirectory = dir,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
        };
        foreach (string a in args)
        {
            psi.ArgumentList.Add(a);
        }

        using System.Diagnostics.Process p = System.Diagnostics.Process.Start(psi)!;
        string output = p.StandardOutput.ReadToEnd();
        p.WaitForExit(30_000);
        Assert.True(p.ExitCode == 0, $"git {string.Join(' ', args)} failed: {p.StandardError.ReadToEnd()}");
        return output.Trim();
    }
}
