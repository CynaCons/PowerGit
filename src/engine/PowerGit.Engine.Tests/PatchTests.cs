using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using Xunit;

namespace PowerGit.Engine.Tests;

/// <summary>
/// v0.18.6, owner: "Being able to export a patch from a commit. Probably
/// from the right click menu." The commit patch is what `git format-patch
/// -1 --stdout` prints with Git Extensions' three flags: mailbox headers,
/// the body, rename headers, binary hunks — proven by `git am` rebuilding
/// the same tree in a clone. The pending rows' patch is `git diff
/// --binary`, proven by `git apply --check`. Every repository is a
/// throwaway TempRepo.
/// </summary>
public sealed class PatchTests : IClassFixture<WebApplicationFactory<Program>>
{
    private readonly WebApplicationFactory<Program> _factory;

    public PatchTests(WebApplicationFactory<Program> factory)
    {
        _factory = factory.WithWebHostBuilder(_ => { });
    }

    /// <summary>
    ///  On main: a.txt renamed to renamed.txt, a 256-byte binary file added,
    ///  a subject with a two-line body. Returns the commit's sha.
    /// </summary>
    private static string CommitWithRenameBinaryAndBody(TempRepo repo)
    {
        repo.Run("mv", "a.txt", "renamed.txt");
        File.WriteAllBytes(Path.Combine(repo.Dir, "bin.dat"), AllBytes());
        repo.Run("add", "-A");
        repo.Run("commit", "-m", "Patch me: rename, binary, body", "-m", "line one\nline two");
        return repo.HeadId();
    }

    /// <summary>0x00..0xff once: git sees NULs and calls the file binary.</summary>
    private static byte[] AllBytes() => [.. Enumerable.Range(0, 256).Select(i => (byte)i)];

    private static string ReadAll(Stream stream)
    {
        using StreamReader reader = new(stream, System.Text.Encoding.UTF8);
        return reader.ReadToEnd();
    }

    /// <summary>git in any directory (TempRepo.Output is bound to its own); throws on a non-zero exit.</summary>
    private static string GitIn(string dir, params string[] args)
    {
        System.Diagnostics.ProcessStartInfo psi = new("git")
        {
            WorkingDirectory = dir,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
        };
        foreach (string a in new[] { "-c", "user.email=clone@example.com", "-c", "user.name=clone" }.Concat(args))
        {
            psi.ArgumentList.Add(a);
        }

        using System.Diagnostics.Process p = System.Diagnostics.Process.Start(psi)!;
        string stdout = p.StandardOutput.ReadToEnd();
        string stderr = p.StandardError.ReadToEnd();
        p.WaitForExit(60_000);
        if (p.ExitCode != 0)
        {
            throw new InvalidOperationException($"git {string.Join(' ', args)} failed ({p.ExitCode}): {stderr}");
        }

        return stdout.Trim();
    }

    [Fact]
    public void Commit_patch_is_the_mailbox_text_and_git_am_rebuilds_the_same_commit()
    {
        using TempRepo repo = new();
        string sha = CommitWithRenameBinaryAndBody(repo);
        string parent = repo.Output("rev-parse", "HEAD~1");
        GitHost host = new();
        host.Open(repo.Dir);

        string text;
        using (Stream stream = host.OpenPatch(sha, out string fileName, out string contentType))
        {
            Assert.Equal("0001-Patch-me-rename-binary-body.patch", fileName);
            Assert.Equal(GitHost.PatchContentType, contentType);
            text = ReadAll(stream);
        }

        Assert.StartsWith($"From {sha} ", text, StringComparison.Ordinal);
        Assert.Contains("Subject: [PATCH] Patch me: rename, binary, body", text, StringComparison.Ordinal);
        Assert.Contains("line one\nline two", text, StringComparison.Ordinal);
        Assert.Contains("rename from a.txt", text, StringComparison.Ordinal);
        Assert.Contains("rename to renamed.txt", text, StringComparison.Ordinal);
        Assert.Contains("GIT binary patch", text, StringComparison.Ordinal);

        string clone = Directory.CreateTempSubdirectory("powergit-patch-clone-").FullName;
        try
        {
            GitIn(Path.GetTempPath(), "clone", "-q", repo.Dir, clone);
            GitIn(clone, "checkout", "-q", parent);
            string patchFile = Path.Combine(clone, "..", Path.GetFileName(clone) + ".patch");
            File.WriteAllText(patchFile, text, new System.Text.UTF8Encoding(false));
            GitIn(clone, "am", patchFile);

            Assert.Equal(repo.Output("rev-parse", $"{sha}^{{tree}}"), GitIn(clone, "rev-parse", "HEAD^{tree}"));
            Assert.Equal("Patch me: rename, binary, body", GitIn(clone, "log", "-1", "--format=%s"));
            Assert.Equal(repo.Output("log", "-1", "--format=%an <%ae>", sha), GitIn(clone, "log", "-1", "--format=%an <%ae>"));
            Assert.Equal(AllBytes(), File.ReadAllBytes(Path.Combine(clone, "bin.dat")));
            File.Delete(patchFile);
        }
        finally
        {
            try
            {
                Directory.Delete(clone, recursive: true);
            }
            catch
            {
                // best effort
            }
        }
    }

    [Fact]
    public void Patch_file_name_is_gits_own_chop()
    {
        Assert.Equal("0001-short.patch", GitHost.PatchFileName("short"));
        Assert.Equal("0001-.patch", GitHost.PatchFileName(""));
        // git chops "0001-<%f>" at 57 bytes so the whole name stays under 64 (log-tree.c fmt_output_subject).
        string chopped = GitHost.PatchFileName("This-is-a-very-long-subject-line-that-goes-well-past-sixty-four-characters");
        Assert.Equal("0001-This-is-a-very-long-subject-line-that-goes-well-past.patch", chopped);
        Assert.Equal(63, chopped.Length);
    }

    [Fact]
    public void Bad_id_and_merge_commit_are_errors_before_any_stream()
    {
        using TempRepo repo = new();
        GitHost host = new();
        host.Open(repo.Dir);

        InvalidOperationException bad = Assert.Throws<InvalidOperationException>(() => host.OpenPatch("nope", out _, out _));
        Assert.Contains("nope", bad.Message, StringComparison.Ordinal);
        Assert.Throws<InvalidOperationException>(() => host.OpenPatch("", out _, out _));

        repo.Run("merge", "--no-ff", "-m", "merge feature", "feature");
        InvalidOperationException merge = Assert.Throws<InvalidOperationException>(() => host.OpenPatch("HEAD", out _, out _));
        Assert.Contains("merge", merge.Message, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void Worktree_and_index_patches_apply_cleanly_and_an_unknown_scope_is_an_error()
    {
        using TempRepo repo = new();
        GitHost host = new();
        host.Open(repo.Dir);
        string head = repo.HeadId();

        repo.Write("a.txt", "a\nedited\n");
        string worktree;
        using (Stream stream = host.OpenWorktreePatch("worktree", out string fileName, out string contentType))
        {
            Assert.Equal($"{Path.GetFileName(repo.Dir)}-worktree.patch", fileName);
            Assert.Equal(GitHost.PatchContentType, contentType);
            worktree = ReadAll(stream);
        }

        Assert.Contains("diff --git a/a.txt b/a.txt", worktree, StringComparison.Ordinal);
        Assert.Contains("+edited", worktree, StringComparison.Ordinal);

        repo.Run("add", "a.txt");
        string index;
        using (Stream stream = host.OpenWorktreePatch("index", out string fileName, out _))
        {
            Assert.EndsWith("-index.patch", fileName, StringComparison.Ordinal);
            index = ReadAll(stream);
        }

        Assert.Contains("+edited", index, StringComparison.Ordinal);
        using (Stream stream = host.OpenWorktreePatch(null, out string fileName, out _))
        {
            // The default scope is the working tree, which is clean now that the edit is staged.
            Assert.EndsWith("-worktree.patch", fileName, StringComparison.Ordinal);
            Assert.Equal(string.Empty, ReadAll(stream));
        }

        Assert.Throws<InvalidOperationException>(() => host.OpenWorktreePatch("stash", out _, out _));

        string clone = Directory.CreateTempSubdirectory("powergit-patch-apply-").FullName;
        try
        {
            GitIn(Path.GetTempPath(), "clone", "-q", repo.Dir, clone);
            GitIn(clone, "checkout", "-q", head);
            string patchFile = Path.Combine(clone, "..", Path.GetFileName(clone) + ".patch");
            File.WriteAllText(patchFile, worktree, new System.Text.UTF8Encoding(false));
            GitIn(clone, "apply", "--check", patchFile);
            File.WriteAllText(patchFile, index, new System.Text.UTF8Encoding(false));
            GitIn(clone, "apply", "--check", patchFile);
            File.Delete(patchFile);
        }
        finally
        {
            try
            {
                Directory.Delete(clone, recursive: true);
            }
            catch
            {
                // best effort
            }
        }
    }

    [Fact]
    public async Task Patch_routes_stream_an_attachment_and_answer_400_for_a_bad_id_or_scope()
    {
        HttpClient client = _factory.CreateAuthedClient();
        using TempRepo repo = new();
        string sha = CommitWithRenameBinaryAndBody(repo);
        string sid = await client.OpenSessionAsync(repo.Dir);

        using HttpResponseMessage patch = await client.GetAsync($"/repos/{sid}/commits/{sha}/patch");
        Assert.Equal(HttpStatusCode.OK, patch.StatusCode);
        Assert.Equal("text/x-patch", patch.Content.Headers.ContentType?.MediaType);
        Assert.Equal("utf-8", patch.Content.Headers.ContentType?.CharSet);
        Assert.Equal("attachment", patch.Content.Headers.ContentDisposition?.DispositionType);
        Assert.Equal("0001-Patch-me-rename-binary-body.patch", patch.Content.Headers.ContentDisposition?.FileName?.Trim('"'));
        string text = await patch.Content.ReadAsStringAsync();
        Assert.StartsWith($"From {sha} ", text, StringComparison.Ordinal);
        Assert.Contains("GIT binary patch", text, StringComparison.Ordinal);

        using HttpResponseMessage bad = await client.GetAsync($"/repos/{sid}/commits/nope/patch");
        Assert.Equal(HttpStatusCode.BadRequest, bad.StatusCode);
        Assert.Contains("nope", (await bad.Content.ReadFromJsonAsync<ErrorResponse>())!.Error, StringComparison.Ordinal);

        repo.Write("renamed.txt", "a\nedited\n");
        using HttpResponseMessage worktree = await client.GetAsync($"/repos/{sid}/worktree/patch?scope=worktree");
        Assert.Equal(HttpStatusCode.OK, worktree.StatusCode);
        Assert.Equal($"{Path.GetFileName(repo.Dir)}-worktree.patch", worktree.Content.Headers.ContentDisposition?.FileName?.Trim('"'));
        Assert.Contains("+edited", await worktree.Content.ReadAsStringAsync(), StringComparison.Ordinal);

        using HttpResponseMessage scope = await client.GetAsync($"/repos/{sid}/worktree/patch?scope=stash");
        Assert.Equal(HttpStatusCode.BadRequest, scope.StatusCode);
        Assert.Contains("scope", (await scope.Content.ReadFromJsonAsync<ErrorResponse>())!.Error, StringComparison.Ordinal);
    }

    /// <summary>
    ///  A browser download is a navigation and carries no Authorization
    ///  header, so the two download routes take the token in the query like
    ///  /events does (and only they do: the query token opens nothing else).
    /// </summary>
    [Fact]
    public async Task Download_routes_accept_the_query_token_and_nothing_else_does()
    {
        HttpClient client = _factory.CreateAuthedClient();
        using TempRepo repo = new();
        string sha = CommitWithRenameBinaryAndBody(repo);
        string sid = await client.OpenSessionAsync(repo.Dir);
        HttpClient bare = _factory.CreateClient();

        using HttpResponseMessage patch = await bare.GetAsync($"/repos/{sid}/commits/{sha}/patch?token={TestAuth.Token}");
        Assert.Equal(HttpStatusCode.OK, patch.StatusCode);
        using HttpResponseMessage worktree = await bare.GetAsync($"/repos/{sid}/worktree/patch?scope=index&token={TestAuth.Token}");
        Assert.Equal(HttpStatusCode.OK, worktree.StatusCode);
        using HttpResponseMessage archive = await bare.GetAsync($"/repos/{sid}/commits/{sha}/archive?format=zip&token={TestAuth.Token}");
        Assert.Equal(HttpStatusCode.OK, archive.StatusCode);

        using HttpResponseMessage wrong = await bare.GetAsync($"/repos/{sid}/commits/{sha}/patch?token={TestAuth.Token}x");
        Assert.Equal(HttpStatusCode.Unauthorized, wrong.StatusCode);
        using HttpResponseMessage status = await bare.GetAsync($"/repos/{sid}/status?token={TestAuth.Token}");
        Assert.Equal(HttpStatusCode.Unauthorized, status.StatusCode);
    }
}
