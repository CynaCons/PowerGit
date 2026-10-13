using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using Xunit;

namespace PowerGit.Engine.Tests;

/// <summary>
///  v0.20.10: the recent repositories as repositories with their worktrees
///  (GET /repos/workspaces, the start pane's repository cards). The recents
///  list is passed in, so these tests never share the store with the suite.
/// </summary>
public sealed class WorkspacesTests : IClassFixture<WebApplicationFactory<Program>>
{
    private readonly WebApplicationFactory<Program> _factory;

    public WorkspacesTests(WebApplicationFactory<Program> factory)
    {
        _factory = factory.WithWebHostBuilder(_ => { });
    }

    private static string Sibling(string name) => Path.Combine(Path.GetTempPath(), $"powergit-wt-{name}-{Guid.NewGuid():N}");

    private static RecentInfo Recent(string root, DateTimeOffset? opened, bool pinned = false)
        => new(Path.GetFileName(root), root, "main", "id-" + Path.GetFileName(root), opened, pinned);

    private static void Remove(params string[] dirs)
    {
        foreach (string dir in dirs)
        {
            if (Directory.Exists(dir))
            {
                Directory.Delete(dir, recursive: true);
            }
        }
    }

    [Fact]
    public async Task Linked_worktrees_are_listed_under_their_repository_even_when_never_opened()
    {
        using TempRepo repo = new();
        string opened = Sibling("opened");
        string never = Sibling("never");
        repo.Run("worktree", "add", "-b", "task-a", opened);
        repo.Run("worktree", "add", "-b", "task-b", never);
        try
        {
            DateTimeOffset now = DateTimeOffset.UtcNow;
            WorkspaceGroup[] groups = await new Workspaces().ListAsync([Recent(opened, now)], CancellationToken.None);

            WorkspaceGroup group = Assert.Single(groups);
            Assert.Equal(Path.GetFileName(repo.Dir), group.Name);
            Assert.Equal(Workspaces.Normalise(repo.Dir), group.MainRoot, Workspaces.PathComparer);
            Assert.Equal(now, group.LastOpened);
            Assert.Equal(3, group.Worktrees.Length);

            WorkspaceWorktree main = group.Worktrees[0];
            Assert.True(main.Main);
            Assert.Equal("main", main.Branch);
            Assert.Null(main.LastOpened);

            WorkspaceWorktree a = Assert.Single(group.Worktrees, w => w.Branch == "task-a");
            Assert.Equal(opened, a.Root);
            Assert.Equal(now, a.LastOpened);
            Assert.Equal("id-" + Path.GetFileName(opened), a.Id);

            WorkspaceWorktree b = Assert.Single(group.Worktrees, w => w.Branch == "task-b");
            Assert.Null(b.LastOpened);
            Assert.Null(b.Id);
            Assert.False(b.Main);
            Assert.Equal(Path.GetFileName(never), b.Name);
            Assert.Equal(repo.HeadId(), b.Head);
        }
        finally
        {
            Remove(opened, never);
        }
    }

    [Fact]
    public async Task A_standalone_repository_is_a_group_of_one()
    {
        using TempRepo repo = new();
        WorkspaceGroup group = Assert.Single(await new Workspaces().ListAsync([Recent(repo.Dir, DateTimeOffset.UtcNow)], CancellationToken.None));

        WorkspaceWorktree only = Assert.Single(group.Worktrees);
        Assert.True(only.Main);
        Assert.Equal(repo.Dir, only.Root);
        Assert.Equal("main", only.Branch);
        Assert.Equal("id-" + Path.GetFileName(repo.Dir), only.Id);
    }

    [Fact]
    public async Task A_detached_worktree_has_no_branch()
    {
        using TempRepo repo = new();
        string detached = Sibling("detached");
        repo.Run("worktree", "add", "--detach", detached, "main");
        try
        {
            WorkspaceGroup group = Assert.Single(await new Workspaces().ListAsync([Recent(detached, DateTimeOffset.UtcNow)], CancellationToken.None));

            WorkspaceWorktree wt = Assert.Single(group.Worktrees, w => !w.Main);
            Assert.True(wt.Detached);
            Assert.Null(wt.Branch);
            Assert.Equal(repo.HeadId(), wt.Head);
        }
        finally
        {
            Remove(detached);
        }
    }

    [Fact]
    public async Task Groups_order_pinned_then_recent_and_worktrees_main_then_recent_then_by_name()
    {
        using TempRepo older = new();
        using TempRepo newer = new();
        using TempRepo pinned = new();
        string zeta = Sibling("zeta");
        string alpha = Sibling("alpha");
        string recent = Sibling("recent");
        newer.Run("worktree", "add", "-b", "zeta", zeta);
        newer.Run("worktree", "add", "-b", "alpha", alpha);
        newer.Run("worktree", "add", "-b", "recent", recent);
        try
        {
            DateTimeOffset t = DateTimeOffset.UtcNow;
            WorkspaceGroup[] groups = await new Workspaces().ListAsync(
                [
                    Recent(older.Dir, t.AddDays(-3)),
                    Recent(recent, t),
                    Recent(newer.Dir, t.AddDays(-1)),
                    Recent(pinned.Dir, t.AddDays(-9), pinned: true),
                ],
                CancellationToken.None);

            Assert.Equal(
                [Path.GetFileName(pinned.Dir), Path.GetFileName(newer.Dir), Path.GetFileName(older.Dir)],
                groups.Select(g => g.Name));
            Assert.True(groups[0].Pinned);

            // main first, then opened most recently first, then never opened by name
            string[] names = [.. groups[1].Worktrees.Select(w => w.Name)];
            Assert.Equal(Path.GetFileName(newer.Dir), names[0]);
            Assert.Equal(Path.GetFileName(recent), names[1]);
            string[] neverOpened = [.. names.Skip(2)];
            Assert.Equal(neverOpened.OrderBy(n => n, StringComparer.OrdinalIgnoreCase), neverOpened);
            Assert.Equal(2, neverOpened.Length);
        }
        finally
        {
            Remove(zeta, alpha, recent);
        }
    }

    [Fact]
    public async Task Deleted_roots_and_folders_that_are_not_work_trees_are_left_out()
    {
        using TempRepo repo = new();
        string gone = Sibling("gone");
        string plain = Directory.CreateTempSubdirectory("powergit-plain-").FullName;
        try
        {
            WorkspaceGroup[] groups = await new Workspaces().ListAsync(
                [Recent(gone, DateTimeOffset.UtcNow), Recent(plain, DateTimeOffset.UtcNow), Recent(repo.Dir, DateTimeOffset.UtcNow)],
                CancellationToken.None);

            WorkspaceGroup group = Assert.Single(groups);
            Assert.Equal(repo.Dir, Assert.Single(group.Worktrees).Root);
        }
        finally
        {
            Remove(plain);
        }
    }

    [Fact]
    public async Task A_worktree_whose_folder_is_gone_is_left_out()
    {
        using TempRepo repo = new();
        string removed = Sibling("removed");
        repo.Run("worktree", "add", "-b", "removed", removed);
        Remove(removed);

        WorkspaceGroup group = Assert.Single(await new Workspaces().ListAsync([Recent(repo.Dir, DateTimeOffset.UtcNow)], CancellationToken.None));

        Assert.Single(group.Worktrees);
    }

    [Fact]
    public void Porcelain_of_a_bare_repository_marks_its_first_worktree_main()
    {
        string root = Path.GetTempPath();
        string one = Path.Combine(root, "one");
        string two = Path.Combine(root, "two");
        string output =
            $"worktree {Path.Combine(root, "repo.git")}\nbare\n\n" +
            $"worktree {one}\nHEAD 1111111111111111111111111111111111111111\nbranch refs/heads/main\n\n" +
            $"worktree {two}\nHEAD 2222222222222222222222222222222222222222\ndetached\nlocked in use\nprunable gitdir file points to non-existent location\n\n";

        (List<Workspaces.ListedWorktree> worktrees, bool bare) = Workspaces.ParsePorcelain(output);

        Assert.True(bare);
        Assert.Equal(2, worktrees.Count);
        Assert.True(worktrees[0].Main);
        Assert.Equal("main", worktrees[0].Branch);
        Assert.False(worktrees[1].Main);
        Assert.True(worktrees[1].Detached);
        Assert.True(worktrees[1].Locked);
        Assert.True(worktrees[1].Prunable);
        Assert.Null(worktrees[1].Branch);
    }

    [Fact]
    public async Task Endpoint_answers_the_groups_in_camel_case()
    {
        using TempRepo repo = new();
        RecentsStore.Remember(new RepoInfo("ws", repo.Dir, "main", "ws-endpoint"));
        try
        {
            HttpClient client = _factory.CreateAuthedClient();
            JsonElement groups = await client.GetFromJsonAsync<JsonElement>("/repos/workspaces");

            JsonElement group = groups.EnumerateArray().Single(g =>
                g.GetProperty("worktrees").EnumerateArray().Any(w => w.GetProperty("root").GetString() == repo.Dir));
            Assert.Equal(Path.GetFileName(repo.Dir), group.GetProperty("name").GetString());
            JsonElement wt = group.GetProperty("worktrees")[0];
            Assert.True(wt.GetProperty("main").GetBoolean());
            Assert.Equal("ws-endpoint", wt.GetProperty("id").GetString());
            Assert.Equal("main", wt.GetProperty("branch").GetString());
        }
        finally
        {
            RecentsStore.Forget(repo.Dir);
        }
    }
}
