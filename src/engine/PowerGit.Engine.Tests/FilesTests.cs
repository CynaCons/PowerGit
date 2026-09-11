using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using Xunit;

namespace PowerGit.Engine.Tests;

/// <summary>
/// v0.16.0. Owner: "In the commit window, on the left we have the files staged
/// and unstaged. We need functional parity with what GE has. Should be able to
/// right click on my files and do operations on them."
///
/// The routes under /files/* are the handlers of Git Extensions'
/// FileStatusList context menu. Every test asserts on the repository (index
/// bits, exclude file, disk), never on a return value alone.
/// </summary>
public sealed class FilesTests : IClassFixture<WebApplicationFactory<Program>>
{
    private readonly WebApplicationFactory<Program> _factory;

    public FilesTests(WebApplicationFactory<Program> factory)
    {
        _factory = factory.WithWebHostBuilder(_ => { });
    }

    private static (GitHost Host, TempRepo Repo) Open()
    {
        TempRepo repo = new();
        GitHost host = new();
        host.Open(repo.Dir);
        return (host, repo);
    }

    /// <summary>The `git ls-files -v` letter for one path ("H" ordinary, "S" skip-worktree, "h" assume-unchanged).</summary>
    private static string Letter(TempRepo repo, string path)
        => repo.Output("ls-files", "-v", "--", path).Split(' ')[0];

    [Fact]
    public void Skip_worktree_sets_the_bit_hides_the_file_from_status_and_status_lists_it_as_hidden()
    {
        (GitHost host, TempRepo repo) = Open();
        using (repo)
        {
            repo.Write("a.txt", "a\nedited\n");
            Assert.Contains(host.GetStatus().Unstaged, f => f.Path == "a.txt");

            host.SetSkipWorktree(["a.txt"], on: true);

            Assert.Equal("S", Letter(repo, "a.txt"));
            RepoStatusDto status = host.GetStatus();
            // git leaves a skip-worktree file out of status (that is the point
            // of the bit); the engine reports it under Hidden with the flag so
            // the UI can list it and offer to clear the bit.
            Assert.DoesNotContain(status.Unstaged, f => f.Path == "a.txt");
            Assert.Equal(0, status.UnstagedCount);
            StatusFileDto hidden = Assert.Single(status.Hidden ?? []);
            Assert.Equal("a.txt", hidden.Path);
            Assert.Equal("S", hidden.Status);
            Assert.True(hidden.SkipWorktree);
            Assert.False(hidden.AssumeUnchanged);
            Assert.Single(host.ListHiddenFiles(), f => f.Path == "a.txt" && f.SkipWorktree);

            host.SetSkipWorktree(["a.txt"], on: false);

            Assert.Equal("H", Letter(repo, "a.txt"));
            status = host.GetStatus();
            Assert.Contains(status.Unstaged, f => f.Path == "a.txt" && !f.SkipWorktree);
            Assert.Empty(status.Hidden ?? []);
        }
    }

    [Fact]
    public void Assume_unchanged_round_trips_and_a_staged_file_keeps_its_row_with_the_flag()
    {
        (GitHost host, TempRepo repo) = Open();
        using (repo)
        {
            repo.Write("a.txt", "a\nstaged\n");
            repo.Run("add", "a.txt");

            host.SetAssumeUnchanged(["a.txt"], on: true);

            Assert.Equal("h", Letter(repo, "a.txt"));
            // The staged change is index-vs-HEAD, which the bit does not hide:
            // the row stays in Staged, now carrying the flag, and is not
            // duplicated under Hidden.
            RepoStatusDto status = host.GetStatus();
            StatusFileDto staged = Assert.Single(status.Staged, f => f.Path == "a.txt");
            Assert.True(staged.AssumeUnchanged);
            Assert.False(staged.SkipWorktree);
            Assert.Empty(status.Hidden ?? []);

            host.SetAssumeUnchanged(["a.txt"], on: false);
            Assert.Equal("H", Letter(repo, "a.txt"));
        }
    }

    [Fact]
    public void Both_bits_report_as_lower_case_s()
    {
        (GitHost host, TempRepo repo) = Open();
        using (repo)
        {
            host.SetSkipWorktree(["a.txt"], on: true);
            host.SetAssumeUnchanged(["a.txt"], on: true);

            StatusFileDto hidden = Assert.Single(host.GetStatus().Hidden ?? []);
            Assert.Equal("s", hidden.Status);
            Assert.True(hidden.SkipWorktree);
            Assert.True(hidden.AssumeUnchanged);
        }
    }

    [Fact]
    public void Flags_refuse_an_untracked_or_escaping_path()
    {
        (GitHost host, TempRepo repo) = Open();
        using (repo)
        {
            repo.Write("new.txt", "new\n");
            Assert.Throws<InvalidOperationException>(() => host.SetSkipWorktree(["new.txt"], on: true));
            Assert.Throws<InvalidOperationException>(() => host.SetAssumeUnchanged(["../outside.txt"], on: true));
            Assert.Throws<InvalidOperationException>(() => host.SetSkipWorktree([], on: true));
        }
    }

    [Fact]
    public void Exclude_appends_anchored_patterns_to_git_info_exclude_and_status_drops_the_file()
    {
        (GitHost host, TempRepo repo) = Open();
        using (repo)
        {
            repo.Write("build/out.bin", "x\n");
            repo.Write("notes.txt", "x\n");
            Assert.Contains(host.GetStatus().Unstaged, f => f.Path == "build/out.bin");
            long before = host.ChangeVersion;

            host.ExcludeFiles(["/build/out.bin", "/notes.txt"]);

            string exclude = File.ReadAllText(Path.Combine(repo.Dir, ".git", "info", "exclude")).Replace("\r\n", "\n");
            Assert.EndsWith("/build/out.bin\n/notes.txt\n", exclude);
            RepoStatusDto status = host.GetStatus();
            Assert.DoesNotContain(status.Unstaged, f => f.Path == "build/out.bin" || f.Path == "notes.txt");
            // .git/info is not watched, so the exclude bumps the change
            // stream itself for the UI to re-read status.
            Assert.True(host.ChangeVersion > before);
            Assert.Equal(GitChangeKind.Status, GitHost.ChangeKindOf(host.ChangeVersion));
        }
    }

    [Fact]
    public void Exclude_starts_on_a_fresh_line_when_the_file_has_no_trailing_newline()
    {
        (GitHost host, TempRepo repo) = Open();
        using (repo)
        {
            string exclude = Path.Combine(repo.Dir, ".git", "info", "exclude");
            File.WriteAllText(exclude, "# comment");

            host.ExcludeFiles(["/a.log"]);

            Assert.Equal("# comment\n/a.log\n", File.ReadAllText(exclude).Replace("\r\n", "\n"));
            Assert.Throws<InvalidOperationException>(() => host.ExcludeFiles([" "]));
        }
    }

    [Fact]
    public void Stop_tracking_removes_the_index_entry_and_keeps_the_file()
    {
        (GitHost host, TempRepo repo) = Open();
        using (repo)
        {
            host.StopTracking(["a.txt"]);

            Assert.True(File.Exists(Path.Combine(repo.Dir, "a.txt")));
            Assert.Equal("", repo.Output("ls-files", "--", "a.txt"));
            RepoStatusDto status = host.GetStatus();
            Assert.Contains(status.Staged, f => f.Path == "a.txt" && f.Status == "D");
            Assert.Contains(status.Unstaged, f => f.Path == "a.txt" && f.Status == "U");
        }
    }

    [Fact]
    public void Move_renames_through_git_and_refuses_an_existing_target()
    {
        (GitHost host, TempRepo repo) = Open();
        using (repo)
        {
            host.MoveFile("a.txt", "sub/renamed.txt");

            Assert.False(File.Exists(Path.Combine(repo.Dir, "a.txt")));
            Assert.True(File.Exists(Path.Combine(repo.Dir, "sub", "renamed.txt")));
            Assert.Contains(host.GetStatus().Staged, f => f.Path == "sub/renamed.txt" && f.Status == "R");

            repo.Write("other.txt", "x\n");
            Assert.Throws<InvalidOperationException>(() => host.MoveFile("sub/renamed.txt", "other.txt"));
            Assert.Throws<InvalidOperationException>(() => host.MoveFile("sub/renamed.txt", "../escaped.txt"));
        }
    }

    [Fact]
    public void Open_and_edit_refuse_a_missing_or_escaping_path_before_starting_anything()
    {
        (GitHost host, TempRepo repo) = Open();
        using (repo)
        {
            Assert.Throws<InvalidOperationException>(() => host.OpenFile("missing.txt"));
            Assert.Throws<InvalidOperationException>(() => host.OpenFile("../a.txt"));
            Assert.Throws<InvalidOperationException>(() => host.EditFile(""));
            // A program that does not exist is reported, not swallowed: as a
            // path that is not there, and as a bare command the shell rejects.
            InvalidOperationException ex = Assert.Throws<InvalidOperationException>(
                () => host.OpenFile("a.txt", Path.Combine(repo.Dir, "no-such-program.exe")));
            Assert.Contains("could not start", ex.Message);
            InvalidOperationException shell = Assert.Throws<InvalidOperationException>(
                () => host.OpenFile("a.txt", "powergit-no-such-command-xyz --flag"));
            Assert.Contains("before opening the file", shell.Message);
        }
    }

    [Theory]
    [InlineData("\"C:\\Program Files\\x\\Code.exe\" --wait", "C:\\Program Files\\x\\Code.exe")]
    [InlineData("code --wait", "code")]
    [InlineData("nano", "nano")]
    public void First_token_is_the_program(string commandLine, string program)
    {
        Assert.Equal(program, GitHost.FirstToken(commandLine));
    }

    [Theory]
    [InlineData("vim", true)]
    [InlineData("\"C:\\tools\\nvim.exe\" --clean", true)]
    [InlineData("emacs -nw", true)]
    [InlineData("emacs", false)]
    [InlineData("\"C:\\Program Files\\Microsoft VS Code\\Code.exe\" --wait", false)]
    [InlineData("code --wait", false)]
    public void Terminal_editors_are_recognised(string editor, bool terminal)
    {
        Assert.Equal(terminal, GitHost.IsTerminalEditor(editor));
    }

    [Fact]
    public void Resolve_in_root_keeps_paths_inside_the_working_tree()
    {
        string root = Directory.CreateTempSubdirectory("powergit-files-root-").FullName;
        try
        {
            Assert.StartsWith(root, GitHost.ResolveInRoot(root, "sub/file.txt"));
            Assert.Throws<InvalidOperationException>(() => GitHost.ResolveInRoot(root, "../file.txt"));
            Assert.Throws<InvalidOperationException>(() => GitHost.ResolveInRoot(root, "sub/../../file.txt"));
            Assert.Throws<InvalidOperationException>(() => GitHost.ResolveInRoot(root, ""));
            // A sibling directory that merely starts with the root's name.
            Assert.Throws<InvalidOperationException>(() => GitHost.ResolveInRoot(root, Path.Combine("..", Path.GetFileName(root) + "-x", "f")));
        }
        finally
        {
            Directory.Delete(root, recursive: true);
        }
    }

    [Fact]
    public async Task Routes_answer_with_status_and_400_with_the_reason()
    {
        using TempRepo repo = new();
        HttpClient client = _factory.CreateAuthedClient();
        HttpResponseMessage opened = await client.PostAsJsonAsync("/repos/open", new OpenRepoRequest(repo.Dir));
        opened.EnsureSuccessStatusCode();
        string id = (await opened.Content.ReadFromJsonAsync<RepoInfo>())!.Id;
        try
        {
            repo.Write("a.txt", "a\nedited\n");

            HttpResponseMessage skip = await client.PostAsJsonAsync($"/repos/{id}/files/skip-worktree", new FilesFlagRequest(["a.txt"], On: true));
            skip.EnsureSuccessStatusCode();
            RepoStatusDto? status = await skip.Content.ReadFromJsonAsync<RepoStatusDto>();
            Assert.NotNull(status);
            Assert.Single(status.Hidden ?? [], f => f.Path == "a.txt" && f.SkipWorktree);

            HttpResponseMessage hidden = await client.GetAsync($"/repos/{id}/files/hidden");
            hidden.EnsureSuccessStatusCode();
            StatusFileDto[]? list = await hidden.Content.ReadFromJsonAsync<StatusFileDto[]>();
            Assert.Single(list ?? [], f => f.Path == "a.txt" && f.Status == "S");

            HttpResponseMessage unskip = await client.PostAsJsonAsync($"/repos/{id}/files/skip-worktree", new FilesFlagRequest(["a.txt"], On: false));
            unskip.EnsureSuccessStatusCode();
            Assert.Equal("H", Letter(repo, "a.txt"));

            HttpResponseMessage assume = await client.PostAsJsonAsync($"/repos/{id}/files/assume-unchanged", new FilesFlagRequest(["a.txt"], On: true));
            assume.EnsureSuccessStatusCode();
            Assert.Equal("h", Letter(repo, "a.txt"));

            HttpResponseMessage exclude = await client.PostAsJsonAsync($"/repos/{id}/files/exclude", new FilesPathsRequest(["/new.log"]));
            exclude.EnsureSuccessStatusCode();
            Assert.Contains("/new.log", File.ReadAllText(Path.Combine(repo.Dir, ".git", "info", "exclude")));

            HttpResponseMessage move = await client.PostAsJsonAsync($"/repos/{id}/files/move", new FilesMoveRequest("b.txt", "c.txt"));
            Assert.Equal(HttpStatusCode.BadRequest, move.StatusCode); // b.txt lives on the feature branch only
            ErrorResponse? error = await move.Content.ReadFromJsonAsync<ErrorResponse>();
            Assert.False(string.IsNullOrWhiteSpace(error?.Error));

            HttpResponseMessage open = await client.PostAsJsonAsync($"/repos/{id}/files/open", new FilesOpenRequest("missing.txt"));
            Assert.Equal(HttpStatusCode.BadRequest, open.StatusCode);

            HttpResponseMessage untrack = await client.PostAsJsonAsync($"/repos/{id}/files/untrack", new FilesPathsRequest(["a.txt"]));
            untrack.EnsureSuccessStatusCode();
            Assert.Equal("", repo.Output("ls-files", "--", "a.txt"));
        }
        finally
        {
            await client.DeleteAsync($"/repos/{id}");
        }
    }
}
