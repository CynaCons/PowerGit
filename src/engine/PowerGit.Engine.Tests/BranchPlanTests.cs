using Xunit;

namespace PowerGit.Engine.Tests;

/// <summary>
///  v0.22.0, owner: "some sort of like visual planner for branches", then "A
///  branch plan in powergit would be cool ... Let's bake it in". A plan is
///  played on the repository's graph and checked with git without moving
///  anything; opened, it is an agent review of kind "plan" that the owner
///  comments on, sends back and approves, and its steps tick as the refs move.
/// </summary>
public sealed class BranchPlanTests
{
    private static string Session(string timeout) => $"export const SESSION = {{\n  name: \"app\",\n  timeout: {timeout},\n}}\n";

    /// <summary>main and feature/auth both change session.ts line 3 after release 1.4.</summary>
    private static TempRepo Repo()
    {
        TempRepo repo = new();
        // TempRepo's "feature" would block refs/heads/feature/auth.
        repo.Run("branch", "-q", "-D", "feature");
        repo.Write("session.ts", Session("30_000"));
        repo.StageAndCommit("release 1.4");
        repo.Run("tag", "v1.4");
        repo.Run("checkout", "-q", "-b", "feature/auth");
        repo.Write("session.ts", Session("readTimeout(config)"));
        repo.StageAndCommit("auth: login form and session");
        repo.Write("token.ts", "export const refresh = () => 1\n");
        repo.StageAndCommit("auth: refresh tokens");
        repo.Run("checkout", "-q", "main");
        repo.Write("session.ts", Session("45_000"));
        repo.StageAndCommit("fix: session timeout too short");
        repo.Write("NOTES.md", "1.4.1\n");
        repo.StageAndCommit("docs: release notes");
        return repo;
    }

    private static readonly BranchPlanStepRequest[] Steps =
    [
        new("rebase", Branch: "feature/auth", Onto: "main"),
        new("branch", Name: "feature/billing", From: "feature/auth"),
        new("commit", On: "feature/billing", Label: "B1", Subject: "billing: plan model", Files: ["src/billing/plan.ts"]),
        new("merge", From: "feature/billing", Into: "feature/auth", Mode: "no-ff"),
        new("merge", From: "feature/auth", Into: "main"),
        new("tag", Name: "v1.5", At: "main"),
    ];

    private static GitHost Host(TempRepo repo)
    {
        GitHost host = new();
        host.Open(repo.Dir);
        host.BoardPath = Path.Combine(Path.GetTempPath(), $"pg-none-{Guid.NewGuid():N}", "board.db");
        return host;
    }

    [Fact]
    public void Preview_plays_the_steps_on_the_graph_and_checks_each_with_git()
    {
        using TempRepo repo = Repo();
        GitHost host = Host(repo);
        string before = repo.Output("for-each-ref");
        BranchPlanPreviewDto plan = host.PreviewBranchPlan(Steps);

        Assert.Equal(["conflict", "ok", "unknown", "ok", "ok", "ok"], plan.Steps.Select(s => s.Result));
        BranchPlanConflictDto conflict = Assert.Single(plan.Steps[0].Conflicts!);
        Assert.Equal("session.ts", conflict.Path);
        Assert.Equal(["main", "feature/auth"], conflict.Sides.Select(s => s.Label));
        Assert.Contains("45_000", conflict.Sides[0].Patch);
        Assert.Contains("readTimeout(config)", conflict.Sides[1].Patch);
        Assert.Equal("fix: session timeout too short", conflict.Sides[0].Subject);

        // From the common base: release 1.4, two on main, two on auth; then the plan's nodes.
        Assert.Equal(5, plan.Nodes.Count(n => n.Kind == "exists"));
        Assert.Equal(2, plan.Nodes.Count(n => n.GhostAt == 1));
        Assert.Equal(3, plan.Nodes.Count(n => n.Kind == "planned"));
        Assert.Equal(2, plan.Nodes.Count(n => n.Kind == "merge"));
        Assert.Equal(["main", "feature/auth", "feature/billing"], plan.Lanes);
        Assert.All(plan.Nodes.Where(n => n.Copy is not null), n => Assert.Equal(1, n.Lane));
        Assert.Equal(2, plan.Nodes.Single(n => n.From == 3).Lane);

        // Children above parents, the plan's newest on top.
        List<string> order = [.. plan.Nodes.Select(n => n.Id)];
        foreach (BranchPlanNodeDto n in plan.Nodes)
            foreach (string p in n.Parents) Assert.True(order.IndexOf(n.Id) < order.IndexOf(p), $"{n.Subject} above its parent");
        Assert.Equal(5, plan.Nodes[0].From);

        BranchPlanRefDto auth = plan.Refs.Single(r => r.Name == "feature/auth");
        Assert.Equal([0, 1, 4], auth.At.Select(a => a.Step));
        BranchPlanRefDto tag = plan.Refs.Single(r => r.Name == "v1.5");
        Assert.Equal(("tag", 6, plan.Nodes[0].Id), (tag.Kind, tag.At.Single().Step, tag.At.Single().Node));
        Assert.Equal(["feature/auth", "main"], plan.Inputs.Keys.Order());

        Assert.Equal(before, repo.Output("for-each-ref"));
        Assert.Equal("", repo.Output("status", "--porcelain"));
    }

    [Fact]
    public void A_step_that_cannot_run_says_why_and_refuses_the_plan()
    {
        using TempRepo repo = Repo();
        GitHost host = Host(repo);
        BranchPlanPreviewDto plan = host.PreviewBranchPlan(
        [
            new("branch", Name: "main", From: "feature/auth"),
            new("merge", From: "nope", Into: "main"),
            new("merge", From: "feature/auth", Into: "main", Mode: "ff"),
            new("tag", Name: "v1.4", At: "main"),
            new("juggle"),
        ]);
        Assert.All(plan.Steps, s => Assert.Equal("invalid", s.Result));
        Assert.Contains("already exists", plan.Steps[0].Because);
        Assert.Contains("no branch or ref called nope", plan.Steps[1].Because);
        Assert.Contains("cannot fast-forward", plan.Steps[2].Because);
        Assert.Contains("tag called v1.4", plan.Steps[3].Because);
        Assert.Contains("op must be", plan.Steps[4].Because);
        InvalidOperationException refused = Assert.Throws<InvalidOperationException>(() =>
            host.CreateBranchPlan(new("wait", "Bad", null, "auth-fix", [new("branch", Name: "main", From: "feature/auth")])));
        Assert.StartsWith("step 1 cannot run", refused.Message);
        Assert.Empty(host.ListAgentReviews().Sessions);
    }

    [Fact]
    public void A_plan_is_discussed_sent_back_revised_approved_and_ticks_as_it_runs()
    {
        using TempRepo repo = Repo();
        GitHost host = Host(repo);
        AgentReviewDto plan = host.CreateBranchPlan(new("wait", "Rebase auth, stack billing", "why", "auth-fix", Steps,
            Explanations: [new(1, "keep main's 45 s")]));
        AgentReviewSummaryDto summary = Assert.Single(host.ListAgentReviews().Sessions);
        Assert.Equal(("plan", 6, "user"), (summary.Kind, summary.FileCount, summary.Turn));
        Assert.Equal(("explain", "s1", "auth-fix"), (plan.Comments![0].Kind, plan.Comments[0].Line, plan.Comments[0].Author));

        AgentReviewThreadDto said = host.CommentBranchPlanStep(plan.Id, new(1, "squash the login commit"));
        Assert.Equal(("c2", "plan", "s1", "round"), (said.Id, said.Path, said.Line, said.Kind));
        Assert.Throws<InvalidOperationException>(() => host.CommentBranchPlanStep(plan.Id, new(9, "x")));

        AgentReviewDto sent = host.SendAgentReviewRound(plan.Id, null);
        Assert.Equal("agent", GitHost.TurnOf(sent));
        Assert.Throws<AgentReviewStateException>(() => host.CommentBranchPlanStep(plan.Id, new(1, "late")));
        AgentReviewDto two = host.ReviseBranchPlan(plan.Id, new("squashed", null, [new("c2", "will squash")]));
        Assert.Equal((2, "user"), (two.Rounds!.Count, GitHost.TurnOf(two)));
        Assert.Equal("will squash", two.Comments!.Single(c => c.Id == "c2").Replies.Single().Body);
        Assert.Equal(6, two.Rounds[1].Plan!.Steps.Count);

        AgentReviewDto approved = host.ResolveAgentReview(plan.Id, new("approve", null, null));
        Assert.Equal("approved", approved.Status);
        Assert.All(host.WithBranchPlanState(approved).Rounds![^1].Plan!.Steps, s => Assert.False(s.Done));

        repo.Run("rebase", "-q", "-X", "theirs", "main", "feature/auth");
        BranchPlanPreviewDto after1 = host.WithBranchPlanState(host.GetAgentReview(plan.Id)!).Rounds![^1].Plan!;
        Assert.Equal([true, false, false, false, false, false], after1.Steps.Select(s => s.Done));
        repo.Run("branch", "feature/billing", "feature/auth");
        repo.Run("checkout", "-q", "feature/billing");
        repo.Write("plan.ts", "export const plans = []\n");
        repo.StageAndCommit("billing: plan model");
        BranchPlanPreviewDto after3 = host.WithBranchPlanState(host.GetAgentReview(plan.Id)!).Rounds![^1].Plan!;
        Assert.Equal([true, true, true, false, false, false], after3.Steps.Select(s => s.Done));
        repo.Run("checkout", "-q", "feature/auth");
        repo.Run("merge", "-q", "--no-ff", "-m", "Merge billing", "feature/billing");
        repo.Run("checkout", "-q", "main");
        repo.Run("merge", "-q", "--no-ff", "-m", "Merge auth", "feature/auth");
        repo.Run("tag", "v1.5");
        BranchPlanPreviewDto done = host.WithBranchPlanState(host.GetAgentReview(plan.Id)!).Rounds![^1].Plan!;
        Assert.All(done.Steps, s => Assert.True(s.Done));
    }

    // v0.22.1, owner: "Add the missing things to the planning, like the rebase
    // check and the cherry pick". A rebase is checked commit by commit: here
    // auth's first commit conflicts with main, and its second undoes it, so
    // the two tips merge cleanly but the rebase stops at the first commit.
    [Fact]
    public void A_rebase_is_checked_commit_by_commit()
    {
        using TempRepo repo = new();
        repo.Run("branch", "-q", "-D", "feature");
        repo.Write("x.txt", "a\n");
        repo.StageAndCommit("base");
        repo.Run("checkout", "-q", "-b", "topic");
        repo.Write("x.txt", "b\n");
        repo.StageAndCommit("topic: change x");
        string first = repo.Output("rev-parse", "--short", "HEAD").Trim();
        repo.Write("x.txt", "a\n");
        repo.StageAndCommit("topic: change x back");
        repo.Run("checkout", "-q", "main");
        repo.Write("x.txt", "m\n");
        repo.StageAndCommit("main: change x");
        GitHost host = Host(repo);

        BranchPlanStepDto merge = host.PreviewBranchPlan([new("merge", From: "topic", Into: "main")]).Steps[0];
        Assert.Equal("ok", merge.Result);
        BranchPlanStepDto rebase = host.PreviewBranchPlan([new("rebase", Branch: "topic", Onto: "main")]).Steps[0];
        Assert.Equal("conflict", rebase.Result);
        Assert.Contains($"stops at {first}", rebase.Because);
        BranchPlanConflictDto conflict = Assert.Single(rebase.Conflicts!);
        Assert.Equal("x.txt", conflict.Path);
        Assert.Equal(["main", first], conflict.Sides.Select(s => s.Label));
        Assert.Contains("+m", conflict.Sides[0].Patch);
        Assert.Contains("+b", conflict.Sides[1].Patch);

        // A clean rebase says so, commit by commit.
        repo.Run("checkout", "-q", "-b", "side", "HEAD~1");
        repo.Write("y.txt", "y\n");
        repo.StageAndCommit("side: add y");
        repo.Run("checkout", "-q", "main");
        BranchPlanStepDto clean = host.PreviewBranchPlan([new("rebase", Branch: "side", Onto: "main")]).Steps[0];
        Assert.Equal(("ok", "1 commit replays cleanly"), (clean.Result, clean.Because));
    }

    [Fact]
    public void A_cherry_pick_copies_commits_onto_a_branch_and_is_checked_per_commit()
    {
        using TempRepo repo = Repo();
        GitHost host = Host(repo);
        string token = repo.Output("rev-parse", "feature/auth").Trim();
        string login = repo.Output("rev-parse", "feature/auth~1").Trim();

        BranchPlanPreviewDto plan = host.PreviewBranchPlan(
        [
            new("cherry-pick", Onto: "main", Commits: [token]),
            new("cherry-pick", Onto: "main", Commits: [login]),
            new("cherry-pick", Onto: "main", Commits: ["nope"]),
        ]);
        Assert.Equal(["ok", "conflict", "invalid"], plan.Steps.Select(s => s.Result));
        Assert.Equal("Cherry-pick 1 commit onto main", plan.Steps[0].Text);
        BranchPlanNodeDto copy = plan.Nodes.Single(n => n.Copy == token);
        Assert.Equal(("planned", 1, 0), (copy.Kind, copy.From, copy.Lane));
        Assert.Null(plan.Nodes.Single(n => n.Id == token).GhostAt);
        Assert.Equal("session.ts", Assert.Single(plan.Steps[1].Conflicts!).Path);
        Assert.Contains("no commit nope", plan.Steps[2].Because);
        Assert.Equal([$"git switch main", $"git cherry-pick {token[..7]}"], plan.Steps[0].Commands);

        AgentReviewDto opened = host.CreateBranchPlan(new("wait", "Pick", null, "auth-fix", [new("cherry-pick", Onto: "main", Commits: [token])]));
        host.ResolveAgentReview(opened.Id, new("approve", null, null));
        Assert.False(host.WithBranchPlanState(host.GetAgentReview(opened.Id)!).Rounds![^1].Plan!.Steps[0].Done);
        repo.Run("cherry-pick", token);
        Assert.True(host.WithBranchPlanState(host.GetAgentReview(opened.Id)!).Rounds![^1].Plan!.Steps[0].Done);
    }

    [Fact]
    public void A_long_history_folds_its_quiet_runs()
    {
        using TempRepo repo = new();
        repo.Run("branch", "-q", "-D", "feature");
        repo.Run("checkout", "-q", "-b", "topic");
        repo.Run("checkout", "-q", "main");
        for (int i = 0; i < 230; i++) repo.Run("commit", "-q", "--allow-empty", "-m", $"main {i}");
        repo.Run("checkout", "-q", "topic");
        repo.Write("t.txt", "t\n");
        repo.StageAndCommit("topic work");
        GitHost host = Host(repo);

        BranchPlanPreviewDto plan = host.PreviewBranchPlan([new("rebase", Branch: "topic", Onto: "main")]);
        Assert.False(plan.Truncated);
        BranchPlanNodeDto fold = Assert.Single(plan.Nodes, n => n.Kind == "fold");
        Assert.Matches("^[0-9]+ commits$", fold.Subject);
        Assert.True(plan.Nodes.Count < 40, $"{plan.Nodes.Count} nodes");
        HashSet<string> ids = [.. plan.Nodes.Select(n => n.Id)];
        Assert.All(plan.Nodes, n => Assert.All(n.Parents, p => Assert.Contains(p, ids)));
        Assert.Equal("ok", plan.Steps[0].Result);
        Assert.Contains(plan.Nodes, n => n.Subject == "main 229");
    }

    [Fact]
    public void A_plan_whose_inputs_moved_says_so_until_it_is_checked_again()
    {
        using TempRepo repo = Repo();
        GitHost host = Host(repo);
        AgentReviewDto plan = host.CreateBranchPlan(new("wait", "Plan", null, "auth-fix", Steps));
        Assert.Empty(host.WithBranchPlanState(plan).Rounds![0].Plan!.Moved!);
        repo.Write("NOTES.md", "1.4.2\n");
        repo.StageAndCommit("docs: more notes");
        Assert.Equal(["main"], host.WithBranchPlanState(host.GetAgentReview(plan.Id)!).Rounds![0].Plan!.Moved!);
        AgentReviewDto rechecked = host.RecheckBranchPlan(plan.Id);
        Assert.Empty(host.WithBranchPlanState(rechecked).Rounds![0].Plan!.Moved!);
        Assert.Equal(6, rechecked.Rounds![0].Plan!.Nodes.Count(n => n.Kind == "exists"));
    }
}
