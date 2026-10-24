using System.Globalization;
using System.Text;

namespace PowerGit.Engine;

/// <summary>
///  Branch plans (v0.22.0, owner: "some sort of like visual planner for
///  branches ... A branch plan in powergit would be cool ... Better than
///  ascii", then "Let's bake it in"). An agent writes steps (rebase, branch,
///  commit, merge, tag, delete); <see cref="PreviewBranchPlan"/> plays them on
///  an in-memory copy of the branches' graph and checks each with git without
///  touching the repository: <c>merge-tree --write-tree</c> between existing
///  commits, the declared files of planned commits otherwise, names and refs
///  always. The result is the graph the owner scrubs through
///  (docs/prototypes/branch-plan-v1.html): every node with the step that
///  brings it and the step that replaces it, lanes per branch, and each ref's
///  place at every step. v0.22.1: rebases and cherry-picks are replayed
///  commit by commit (<see cref="ReplayOnto"/>); a long history folds its
///  quiet runs (<see cref="FoldQuietRuns"/>).
/// </summary>
public sealed partial class GitHost
{
    private const int PlanCommitCap = 5000;
    private const int PlanFoldAbove = 120;

    private sealed class PlanNode
    {
        public required string Id { get; init; }
        public string? Sha { get; init; }
        public required List<string> Parents { get; init; }
        public required string Kind { get; init; }
        public int From { get; init; }
        public int? GhostAt { get; set; }
        public required string Subject { get; init; }
        public string? Author { get; init; }
        public string? Copy { get; init; }
        public List<string>? Files { get; init; }
        public long Time { get; init; }
        public int Lane { get; set; } = -1;
        public string? Tree { get; init; }
    }

    private sealed class PlanState(string root, GitHost git)
    {
        public readonly string Root = root;
        public readonly GitHost Git = git;
        public readonly Dictionary<string, PlanNode> Nodes = new(StringComparer.Ordinal);
        public readonly Dictionary<string, string?> Refs = new(StringComparer.Ordinal);
        public readonly Dictionary<string, string> RefKind = new(StringComparer.Ordinal);
        public readonly Dictionary<string, List<BranchPlanRefPosDto>> Timeline = new(StringComparer.Ordinal);
        public readonly Dictionary<string, string> Inputs = new(StringComparer.Ordinal);
        public readonly Dictionary<string, List<string>> FilesCache = new(StringComparer.Ordinal);
        public HashSet<string> Locals = new(StringComparer.Ordinal);
        public HashSet<string> Tags = new(StringComparer.Ordinal);
        public HashSet<string> Remotes = new(StringComparer.Ordinal);
        /// <summary>v0.22.1: commits a cherry-pick names, loaded so the graph shows where they come from.</summary>
        public HashSet<string> Picked = new(StringComparer.Ordinal);
        public long Clock;

        public void Move(string name, string? node, int step)
        {
            Refs[name] = node;
            if (!Timeline.TryGetValue(name, out List<BranchPlanRefPosDto>? at)) Timeline[name] = at = [];
            at.Add(new(step, node));
        }

        public HashSet<string> Ancestors(string? id)
        {
            HashSet<string> seen = new(StringComparer.Ordinal);
            Stack<string> todo = new();
            if (id is not null) todo.Push(id);
            while (todo.Count > 0)
            {
                string n = todo.Pop();
                if (!seen.Add(n) || !Nodes.TryGetValue(n, out PlanNode? node)) continue;
                foreach (string p in node.Parents) todo.Push(p);
            }
            return seen;
        }

        /// <summary>The files a node changes; null when a planned commit did not declare them.</summary>
        public List<string>? FilesOf(PlanNode n)
        {
            if (n.Kind == "merge") return [];
            if (n.Sha is null) return n.Files;
            if (FilesCache.TryGetValue(n.Sha, out List<string>? cached)) return cached;
            CommandResult r = Git.Run(Root, "-c", "core.quotepath=false", "diff-tree", "--no-commit-id", "--name-only", "-r", "--root", n.Sha);
            List<string> files = [.. r.StdOut.Split('\n', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)];
            FilesCache[n.Sha] = files;
            return files;
        }
    }

    /// <summary>Plays and checks the steps; nothing in the repository moves.</summary>
    public BranchPlanPreviewDto PreviewBranchPlan(IReadOnlyList<BranchPlanStepRequest>? steps, IReadOnlyList<BranchPlanPrDto>? prs = null)
    {
        List<BranchPlanPrDto> cleanPrs = [.. (prs ?? []).Select(CleanPr)];
        string root = RequireRoot();
        if (steps is not { Count: > 0 }) throw new InvalidOperationException("a plan needs at least one step");
        if (steps.Count > 40) throw new InvalidOperationException("a plan has at most 40 steps");
        PlanState s = new(root, this);
        LoadPlanRefs(s, steps);
        bool truncated = LoadPlanCommits(s);
        List<BranchPlanStepDto> checkedSteps = [];
        for (int i = 0; i < steps.Count; i++) checkedSteps.Add(PlayStep(s, steps[i], i + 1));
        FoldQuietRuns(s, checkedSteps);
        List<string> lanes = AssignPlanLanes(s, steps);
        List<PlanNode> ordered = OrderPlanNodes(s);
        return new(
            checkedSteps,
            [.. ordered.Select(n => new BranchPlanNodeDto(n.Id, n.Sha, n.Parents, n.Lane, n.Kind, n.From, n.GhostAt, n.Subject, n.Author, n.Copy))],
            lanes,
            [.. s.Timeline.Select(kv => new BranchPlanRefDto(kv.Key, s.RefKind.GetValueOrDefault(kv.Key, "local"), kv.Value))],
            new Dictionary<string, string>(s.Inputs, StringComparer.Ordinal),
            Timestamp(),
            truncated,
            Prs: cleanPrs);
    }

    private static IEnumerable<string?> StepRefs(BranchPlanStepRequest st) => [st.Branch, st.Onto, st.From, st.Into, st.On, st.At];

    /// <summary>Every ref the plan names that exists now, and the repository's branch, tag and remote names.</summary>
    private void LoadPlanRefs(PlanState s, IReadOnlyList<BranchPlanStepRequest> steps)
    {
        CommandResult all = Run(s.Root, "for-each-ref", "--format=%(refname)%09%(objectname)%09%(*objectname)", "refs/heads", "refs/tags", "refs/remotes");
        Dictionary<string, string> commitOf = new(StringComparer.Ordinal);
        foreach (string line in all.StdOut.Split('\n', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
        {
            string[] p = line.Split('\t');
            if (p.Length < 2) continue;
            string target = p.Length > 2 && p[2].Length > 0 ? p[2] : p[1];
            if (p[0].StartsWith("refs/heads/", StringComparison.Ordinal)) { string n = p[0][11..]; s.Locals.Add(n); commitOf.TryAdd(n, target); s.RefKind.TryAdd(n, "local"); }
            else if (p[0].StartsWith("refs/tags/", StringComparison.Ordinal)) { string n = p[0][10..]; s.Tags.Add(n); commitOf.TryAdd(n, target); s.RefKind.TryAdd(n, "tag"); }
            else if (p[0].StartsWith("refs/remotes/", StringComparison.Ordinal) && !p[0].EndsWith("/HEAD", StringComparison.Ordinal)) { string n = p[0][13..]; s.Remotes.Add(n); commitOf.TryAdd(n, target); s.RefKind.TryAdd(n, "remote"); }
        }
        foreach (string? name in steps.SelectMany(StepRefs).Distinct())
        {
            if (string.IsNullOrWhiteSpace(name) || s.Inputs.ContainsKey(name)) continue;
            string? sha = commitOf.GetValueOrDefault(name);
            if (sha is null)
            {
                CommandResult r = RunTimed(s.Root, 30_000, NoIsNotFailure, "rev-parse", "--verify", "--quiet", name + "^{commit}");
                if (r.ExitCode == 0) sha = r.StdOut.Trim();
            }
            if (sha is null) continue;
            s.Inputs[name] = sha;
            s.Refs[name] = sha;
            s.RefKind.TryAdd(name, "local");
        }
        foreach (string c in steps.SelectMany(st => st.Commits ?? []))
        {
            CommandResult r = RunTimed(s.Root, 30_000, NoIsNotFailure, "rev-parse", "--verify", "--quiet", c.Trim() + "^{commit}");
            if (r.ExitCode == 0) s.Picked.Add(r.StdOut.Trim());
        }
    }

    /// <summary>The commits from the plan's refs down to their common base, newest first.</summary>
    private bool LoadPlanCommits(PlanState s)
    {
        List<string> tips = [.. s.Inputs.Values.Concat(s.Picked).Distinct(StringComparer.Ordinal)];
        if (tips.Count == 0) return false;
        string baseSha = tips[0];
        if (tips.Count > 1)
        {
            CommandResult mb = RunTimed(s.Root, 30_000, NoIsNotFailure, ["merge-base", "--octopus", .. tips]);
            if (mb.ExitCode == 0 && mb.StdOut.Trim().Length > 0) baseSha = mb.StdOut.Trim();
        }
        List<string> args = ["-c", "core.quotepath=false", "log", "--topo-order", "--decorate=full", $"-n{PlanCommitCap + 1}",
            "--format=%H%x1f%P%x1f%an%x1f%ct%x1f%s%x1f%D%x1f%T", .. tips, "--not", baseSha + "^@"];
        CommandResult log = Run(s.Root, [.. args]);
        string[] lines = log.StdOut.Split('\n', StringSplitOptions.RemoveEmptyEntries);
        bool truncated = lines.Length > PlanCommitCap;
        foreach (string line in lines.Take(PlanCommitCap))
        {
            string[] f = line.Split('\u001f');
            if (f.Length < 7) continue;
            long time = long.TryParse(f[3], NumberStyles.Integer, CultureInfo.InvariantCulture, out long t) ? t : 0;
            s.Clock = Math.Max(s.Clock, time);
            s.Nodes[f[0]] = new PlanNode
            {
                Id = f[0], Sha = f[0], Parents = [.. f[1].Split(' ', StringSplitOptions.RemoveEmptyEntries)],
                Kind = "exists", Subject = f[4], Author = f[2], Time = time, Tree = f[6],
            };
            foreach (string deco in f[5].Split(',', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries))
            {
                string d = deco.StartsWith("HEAD -> ", StringComparison.Ordinal) ? deco[8..] : deco;
                if (d.StartsWith("tag: ", StringComparison.Ordinal)) d = d[5..];
                (string kind, string name) = d.StartsWith("refs/heads/", StringComparison.Ordinal) ? ("local", d[11..])
                    : d.StartsWith("refs/tags/", StringComparison.Ordinal) ? ("tag", d[10..])
                    : d.StartsWith("refs/remotes/", StringComparison.Ordinal) && !d.EndsWith("/HEAD", StringComparison.Ordinal) ? ("remote", d[13..]) : ("", "");
                if (kind.Length == 0 || s.Timeline.ContainsKey(name)) continue;
                s.RefKind[name] = kind;
                s.Timeline[name] = [new(0, f[0])];
            }
        }
        foreach (PlanNode n in s.Nodes.Values) n.Parents.RemoveAll(p => !s.Nodes.ContainsKey(p));
        foreach ((string name, string sha) in s.Inputs)
            if (!s.Timeline.ContainsKey(name) && s.Nodes.ContainsKey(sha)) s.Timeline[name] = [new(0, sha)];
        return truncated;
    }

    private BranchPlanStepDto PlayStep(PlanState s, BranchPlanStepRequest st, int n)
    {
        string op = st.Op?.Trim().ToLowerInvariant() ?? "";
        BranchPlanStepDto Invalid(string text, string because, params string[] commands) => new(n, op, text, st, "invalid", because, commands);
        string? Need(string? name) => string.IsNullOrWhiteSpace(name) ? null : s.Refs.GetValueOrDefault(name.Trim());
        string Missing(string? name) => string.IsNullOrWhiteSpace(name) ? "a ref name is missing" : $"there is no branch or ref called {name}";
        long Tick() => s.Clock += 60;
        switch (op)
        {
            case "rebase":
            {
                string text = $"Rebase {st.Branch} onto {st.Onto}";
                string[] cmd = [$"git rebase {st.Onto} {st.Branch}"];
                string? tip = Need(st.Branch), onto = Need(st.Onto);
                if (tip is null) return Invalid(text, Missing(st.Branch), cmd);
                if (onto is null) return Invalid(text, Missing(st.Onto), cmd);
                if (s.RefKind.GetValueOrDefault(st.Branch!) is "tag" or "remote") return Invalid(text, $"{st.Branch} is not a local branch", cmd);
                HashSet<string> under = s.Ancestors(onto);
                List<PlanNode> moving = [.. TopoOldestFirst(s, s.Ancestors(tip).Where(id => !under.Contains(id))).Where(x => x.Parents.Count < 2)];
                if (moving.Count == 0)
                {
                    if (s.Ancestors(onto).Contains(tip) && tip != onto) s.Move(st.Branch!, onto, n);
                    return new(n, op, text, st, "ok", $"{st.Branch} is already on top of {st.Onto}", cmd);
                }
                // v0.22.1: replayed commit by commit, as git rebase does.
                (string result, string because, List<BranchPlanConflictDto>? conflicts, List<string> copies) = ReplayOnto(s, moving, onto, st.Onto!, n, Tick);
                foreach (PlanNode c in moving) c.GhostAt ??= n;
                s.Move(st.Branch!, copies[^1], n);
                return new(n, op, text, st, result, because, cmd, conflicts, [.. copies, .. moving.Select(c => c.Id)]);
            }
            case "cherry-pick":
            {
                IReadOnlyList<string> named = st.Commits ?? [];
                string text = $"Cherry-pick {named.Count} commit{S(named.Count)} onto {st.Onto}";
                string? onto = Need(st.Onto);
                List<PlanNode> picks = [];
                foreach (string name in named)
                {
                    PlanNode? c = PlanCommit(s, name);
                    if (c is null) return Invalid(text, $"there is no commit {name}", [$"git switch {st.Onto}", $"git cherry-pick {name}"]);
                    if (c.Parents.Count > 1) return Invalid(text, $"{c.Sha![..7]} is a merge; cherry-pick it with -m by hand", []);
                    if (c.Parents.Count == 0) return Invalid(text, $"{c.Sha![..7]} is a root commit", []);
                    picks.Add(c);
                }
                string[] cmd = [$"git switch {st.Onto}", $"git cherry-pick {string.Join(' ', picks.Select(c => c.Sha![..7]))}"];
                if (picks.Count == 0) return Invalid(text, "name at least one commit", cmd);
                if (onto is null) return Invalid(text, Missing(st.Onto), cmd);
                if (s.RefKind.GetValueOrDefault(st.Onto!) is "tag" or "remote") return Invalid(text, $"{st.Onto} is not a local branch", cmd);
                (string result, string because, List<BranchPlanConflictDto>? conflicts, List<string> copies) = ReplayOnto(s, picks, onto, st.Onto!, n, Tick);
                s.Move(st.Onto!, copies[^1], n);
                return new(n, op, text, st, result, because, cmd, conflicts, copies);
            }
            case "branch":
            {
                string text = $"Create {st.Name} from {st.From}";
                string[] cmd = [$"git branch {st.Name} {st.From}"];
                string? from = Need(st.From);
                string name = st.Name?.Trim() ?? "";
                if (name.Length == 0) return Invalid(text, "the new branch needs a name", cmd);
                if (Run(s.Root, "check-ref-format", "--branch", name).ExitCode != 0) return Invalid(text, $"{name} is not a valid branch name", cmd);
                if (s.Locals.Contains(name) || s.Refs.ContainsKey(name) && s.Refs[name] is not null) return Invalid(text, $"a branch called {name} already exists", cmd);
                if (s.Remotes.FirstOrDefault(r => r.EndsWith("/" + name, StringComparison.Ordinal)) is { } remote)
                    return Invalid(text, $"a branch called {name} already exists on {remote[..remote.IndexOf('/')]}", cmd);
                if (from is null) return Invalid(text, Missing(st.From), cmd);
                s.RefKind[name] = "local";
                s.Move(name, from, n);
                return new(n, op, text, st, "ok", "the name is free", cmd, Nodes: [from]);
            }
            case "commit":
            {
                string subject = st.Subject?.Trim() is { Length: > 0 } sub ? sub : st.Label?.Trim() is { Length: > 0 } l ? l : "planned commit";
                string text = $"Commit on {st.On}: {subject}";
                string[] cmd = [$"(the agent commits on {st.On})"];
                string? on = Need(st.On);
                if (on is null) return Invalid(text, Missing(st.On), cmd);
                if (s.RefKind.GetValueOrDefault(st.On!) is "tag" or "remote") return Invalid(text, $"{st.On} is not a local branch", cmd);
                PlanNode node = new()
                {
                    Id = $"c{n}", Parents = [on], Kind = "planned", From = n, Subject = subject, Author = null,
                    Files = st.Files is { Count: > 0 } files ? [.. files] : null, Time = Tick(),
                };
                s.Nodes[node.Id] = node;
                s.Move(st.On!, node.Id, n);
                string because = node.Files is null ? "planned; no files declared" : $"planned; changes {string.Join(", ", node.Files)}";
                return new(n, op, text, st, "unknown", because, cmd, Nodes: [node.Id]);
            }
            case "merge":
            {
                string mode = st.Mode?.Trim().ToLowerInvariant() is { Length: > 0 } m ? m : "no-ff";
                string text = $"Merge {st.From} into {st.Into}" + (mode == "no-ff" ? "" : $" ({mode})");
                string[] cmd = mode switch
                {
                    "ff" => [$"git switch {st.Into}", $"git merge --ff-only {st.From}"],
                    "squash" => [$"git switch {st.Into}", $"git merge --squash {st.From}", "git commit"],
                    _ => [$"git switch {st.Into}", $"git merge --no-ff {st.From}"],
                };
                if (mode is not ("no-ff" or "ff" or "squash")) return Invalid(text, "mode must be no-ff, ff or squash", cmd);
                string? from = Need(st.From), into = Need(st.Into);
                if (from is null) return Invalid(text, Missing(st.From), cmd);
                if (into is null) return Invalid(text, Missing(st.Into), cmd);
                if (st.From == st.Into) return Invalid(text, "a branch cannot be merged into itself", cmd);
                if (s.RefKind.GetValueOrDefault(st.Into!) is "tag" or "remote") return Invalid(text, $"{st.Into} is not a local branch", cmd);
                HashSet<string> intoAnc = s.Ancestors(into), fromAnc = s.Ancestors(from);
                if (intoAnc.Contains(from)) return new(n, op, text, st, "ok", $"{st.Into} already contains {st.From}", cmd);
                bool intoContained = fromAnc.Contains(into);
                (string result, string because, List<BranchPlanConflictDto>? conflicts) = intoContained
                    ? ("ok", $"{st.From} already contains {st.Into}: nothing can conflict", null)
                    : CheckJoin(s, into, from, st.Into!, st.From!);
                if (mode == "ff")
                {
                    if (!intoContained) return Invalid(text, $"{st.Into} has commits {st.From} lacks; it cannot fast-forward", cmd);
                    s.Move(st.Into!, from, n);
                    return new(n, op, text, st, "ok", "a fast-forward", cmd, Nodes: [from]);
                }
                PlanNode node = new()
                {
                    Id = $"m{n}", Parents = mode == "squash" ? [into] : [into, from], Kind = mode == "squash" ? "planned" : "merge", From = n,
                    Subject = mode == "squash" ? $"Squash {st.From} into {st.Into}" : $"Merge {st.From} into {st.Into}", Time = Tick(),
                    Files = mode == "squash" ? JoinFiles(s, fromAnc.Where(id => !intoAnc.Contains(id))) : null,
                };
                s.Nodes[node.Id] = node;
                s.Move(st.Into!, node.Id, n);
                return new(n, op, text, st, result, because, cmd, conflicts, [node.Id]);
            }
            case "tag":
            {
                string text = $"Tag {st.At} as {st.Name}";
                string[] cmd = [$"git tag {st.Name} {st.At}"];
                string name = st.Name?.Trim() ?? "";
                if (name.Length == 0) return Invalid(text, "the tag needs a name", cmd);
                if (s.Tags.Contains(name) || s.Timeline.ContainsKey(name) && s.RefKind.GetValueOrDefault(name) == "tag") return Invalid(text, $"a tag called {name} already exists", cmd);
                string? at = Need(st.At);
                if (at is null) return Invalid(text, Missing(st.At), cmd);
                s.RefKind[name] = "tag";
                s.Move(name, at, n);
                return new(n, op, text, st, "ok", "the name is free", cmd, Nodes: [at]);
            }
            case "delete":
            {
                string text = $"Delete {st.Branch}";
                string[] cmd = [$"git branch -d {st.Branch}"];
                string? tip = Need(st.Branch);
                if (tip is null) return Invalid(text, Missing(st.Branch), cmd);
                if (s.RefKind.GetValueOrDefault(st.Branch!) != "local") return Invalid(text, $"{st.Branch} is not a local branch", cmd);
                bool kept = s.Refs.Any(kv => kv.Key != st.Branch && kv.Value is not null && s.Ancestors(kv.Value).Contains(tip));
                s.Move(st.Branch!, null, n);
                return kept
                    ? new(n, op, text, st, "ok", "its commits stay on another branch", cmd)
                    : new(n, op, text, st, "risk", $"commits only on {st.Branch} would be lost", cmd);
            }
            case "pr":
            {
                string text = $"Open a pull request from {st.From} into {st.Into}" + (st.Title?.Trim() is { Length: > 0 } t ? $": {t}" : "");
                string[] cmd = ["(the agent opens it on its host, then reports it with branch_plan_pr)"];
                string? from = Need(st.From);
                if (from is null) return Invalid(text, Missing(st.From), cmd);
                if (Need(st.Into) is null) return Invalid(text, Missing(st.Into), cmd);
                if (st.From == st.Into) return Invalid(text, "a pull request needs two branches", cmd);
                return new(n, op, text, st, "ok", "opened by the agent; it links here once the agent reports it", cmd, Nodes: [from]);
            }
            default:
                return Invalid(op.Length == 0 ? "Unknown step" : op, "op must be rebase, branch, commit, merge, cherry-pick, pr, tag or delete");
        }
    }

    /// <summary>A commit a step names, read from git with all its parents (the graph trims those it does not show).</summary>
    private PlanNode? PlanCommit(PlanState s, string name)
    {
        CommandResult r = RunTimed(s.Root, 30_000, NoIsNotFailure, "rev-parse", "--verify", "--quiet", name.Trim() + "^{commit}");
        if (r.ExitCode != 0) return null;
        string sha = r.StdOut.Trim();
        string[] f = Run(s.Root, "log", "-1", "--format=%H%x1f%P%x1f%an%x1f%ct%x1f%s%x1f%T", sha).StdOut.Trim().Split('\u001f');
        if (f.Length < 6) return null;
        return new PlanNode
        {
            Id = f[0], Sha = f[0], Parents = [.. f[1].Split(' ', StringSplitOptions.RemoveEmptyEntries)], Kind = "exists",
            Subject = f[4], Author = f[2], Tree = f[5],
        };
    }

    /// <summary>
    ///  v0.22.1: the commits replayed one by one onto <paramref name="onto"/>,
    ///  exactly as rebase and cherry-pick apply them. git 2.38's merge-tree
    ///  takes no merge base, so each replay merges the commit with a throwaway
    ///  commit whose tree is the result so far and whose parent is the commit's
    ///  parent: their merge base is that parent, which is the three-way merge
    ///  git itself runs. The throwaway commits are never referenced. Returns
    ///  the planned copies (each with its tree while the replay stays clean).
    /// </summary>
    private (string Result, string Because, List<BranchPlanConflictDto>? Conflicts, List<string> Copies) ReplayOnto(
        PlanState s, List<PlanNode> commits, string onto, string ontoLabel, int step, Func<long> tick)
    {
        string? tree = s.Nodes.GetValueOrDefault(onto)?.Tree;
        string result = "ok", because = $"{commits.Count} commit{S(commits.Count)} replay{(commits.Count == 1 ? "s" : "")} cleanly";
        List<BranchPlanConflictDto>? conflicts = null;
        if (tree is null) (result, because) = ("unknown", $"{ontoLabel} is planned at this point: checked once its commits exist");
        string parent = onto;
        List<string> copies = [];
        foreach (PlanNode c in commits)
        {
            if (result == "ok" && tree is not null)
            {
                if (c.Sha is null || c.Parents.Count != 1)
                {
                    (result, because, tree) = ("unknown", "planned commits are checked once they exist", null);
                }
                else
                {
                    (string? next, string? stop, List<BranchPlanConflictDto>? files) = ReplayOne(s, tree, c, onto, ontoLabel);
                    if (stop is not null) (result, because, conflicts, tree) = (files is null ? "unknown" : "conflict", stop, files, null);
                    else tree = next;
                }
            }
            PlanNode copy = new()
            {
                Id = $"{c.Id}@{step}", Parents = [parent], Kind = "planned", From = step, Subject = c.Subject, Author = c.Author,
                Copy = c.Id, Files = s.FilesOf(c), Time = tick(), Tree = result == "ok" ? tree : null,
            };
            s.Nodes[copy.Id] = copy;
            parent = copy.Id;
            copies.Add(copy.Id);
        }
        return (result, because, conflicts, copies);
    }

    /// <summary>One commit replayed on a tree: the new tree, or why it stops (with the conflicted files when git says so).</summary>
    private (string? Tree, string? Stop, List<BranchPlanConflictDto>? Conflicts) ReplayOne(PlanState s, string tree, PlanNode c, string onto, string ontoLabel)
    {
        string parentSha = c.Parents[0];
        CommandResult temp = Run(s.Root, "-c", "user.name=PowerGit", "-c", "user.email=powergit@localhost",
            "commit-tree", tree, "-p", parentSha, "-m", "powergit branch plan check");
        if (temp.ExitCode != 0) return (null, "git could not stage the check: " + temp.StdErr.Trim(), null);
        CommandResult r = RunTimed(s.Root, 60_000, NoIsNotFailure, "-c", "core.quotepath=false", "merge-tree", "--write-tree", "--name-only", "--no-messages", temp.StdOut.Trim(), c.Sha!);
        string[] lines = r.StdOut.Split('\n');
        if (r.ExitCode == 0) return (lines[0].Trim(), null, null);
        if (r.ExitCode != 1)
            return (null, "this git cannot check it (merge-tree --write-tree needs git 2.38 or later): " + (r.StdErr.Trim() is { Length: > 0 } e ? e.Split('\n')[0] : "no output"), null);
        List<string> files = [.. lines.Skip(1).TakeWhile(l => l.Trim().Length > 0).Select(l => l.Trim()).Distinct(StringComparer.Ordinal)];
        string? mb = s.Nodes.GetValueOrDefault(onto)?.Sha is { } ontoSha ? RunTimed(s.Root, 30_000, NoIsNotFailure, "merge-base", ontoSha, c.Sha!).StdOut.Trim() : null;
        List<BranchPlanConflictDto> conflicts = [];
        foreach (string file in files.Take(10))
        {
            string[] last = mb is { Length: > 0 } && s.Nodes[onto].Sha is { } os
                ? Run(s.Root, "log", "-1", "--format=%h%x1f%s", $"{mb}..{os}", "--", file).StdOut.Trim().Split('\u001f')
                : [];
            conflicts.Add(new(file,
            [
                new(ontoLabel, last.Length > 0 && last[0].Length > 0 ? last[0] : null, last.Length > 1 ? last[1] : null, FilePatch(s, parentSha, tree, file)),
                new(c.Sha![..7], c.Sha[..7], c.Subject, FilePatch(s, parentSha, c.Sha, file)),
            ]));
        }
        return (null, $"stops at {c.Sha![..7]} ({c.Subject}) on {string.Join(", ", files)}", conflicts);
    }

    private string FilePatch(PlanState s, string from, string to, string file)
    {
        string[] lines = Run(s.Root, "-c", "core.quotepath=false", "diff", "--no-color", "-U2", from, to, "--", file).StdOut.Split('\n');
        int start = Array.FindIndex(lines, l => l.StartsWith("@@", StringComparison.Ordinal));
        return start < 0 ? "" : string.Join('\n', lines.Skip(start).Take(40)).TrimEnd();
    }

    /// <summary>
    ///  v0.22.1: a long history keeps what the plan needs (tips, branch points,
    ///  merges, refs, every node a step touches, the newest commits of each
    ///  ref) and folds each quiet run of commits between them into one node.
    /// </summary>
    private static void FoldQuietRuns(PlanState s, IReadOnlyList<BranchPlanStepDto> steps)
    {
        if (s.Nodes.Count <= PlanFoldAbove) return;
        Dictionary<string, int> children = s.Nodes.Keys.ToDictionary(k => k, _ => 0, StringComparer.Ordinal);
        Dictionary<string, string> childOf = new(StringComparer.Ordinal);
        foreach (PlanNode n in s.Nodes.Values)
            foreach (string p in n.Parents)
            {
                children[p]++;
                childOf[p] = n.Id;
            }
        HashSet<string> keep = new(StringComparer.Ordinal);
        foreach (PlanNode n in s.Nodes.Values)
            if (n.Kind != "exists" || n.GhostAt is not null || n.Parents.Count != 1 || children[n.Id] != 1) keep.Add(n.Id);
        foreach (BranchPlanStepDto step in steps) keep.UnionWith(step.Nodes ?? []);
        foreach (List<BranchPlanRefPosDto> at in s.Timeline.Values)
            foreach (BranchPlanRefPosDto pos in at)
            {
                // A ref's place and the newest commits under it.
                string? id = pos.Node;
                for (int i = 0; i < 4 && id is not null && s.Nodes.TryGetValue(id, out PlanNode? node); i++)
                {
                    keep.Add(id);
                    id = node.Parents.FirstOrDefault();
                }
            }
        foreach (PlanNode top in s.Nodes.Values.ToList())
        {
            if (keep.Contains(top.Id) || !s.Nodes.ContainsKey(top.Id) || !childOf.TryGetValue(top.Id, out string? child) || !keep.Contains(child)) continue;
            List<PlanNode> run = [top];
            while (run[^1].Parents[0] is var p && !keep.Contains(p) && s.Nodes.ContainsKey(p)) run.Add(s.Nodes[p]);
            if (run.Count < 2) continue;
            PlanNode fold = new()
            {
                Id = $"fold:{top.Id}", Parents = [run[^1].Parents[0]], Kind = "fold", Subject = $"{run.Count} commits", Time = top.Time,
            };
            foreach (PlanNode r in run) s.Nodes.Remove(r.Id);
            s.Nodes[fold.Id] = fold;
            PlanNode below = s.Nodes[child];
            int at = below.Parents.IndexOf(top.Id);
            below.Parents[at] = fold.Id;
        }
    }

    private static List<PlanNode> TopoOldestFirst(PlanState s, IEnumerable<string> ids)
    {
        HashSet<string> set = [.. ids.Where(s.Nodes.ContainsKey)];
        List<PlanNode> outList = [];
        HashSet<string> done = new(StringComparer.Ordinal);
        void Visit(string id)
        {
            if (!set.Contains(id) || !done.Add(id)) return;
            foreach (string p in s.Nodes[id].Parents) Visit(p);
            outList.Add(s.Nodes[id]);
        }
        foreach (string id in set.OrderBy(id => s.Nodes[id].Time)) Visit(id);
        return outList;
    }

    private static List<string>? JoinFiles(PlanState s, IEnumerable<string> ids)
    {
        HashSet<string> files = new(StringComparer.Ordinal);
        foreach (string id in ids)
        {
            if (!s.Nodes.TryGetValue(id, out PlanNode? node)) continue;
            if (s.FilesOf(node) is not { } f) return null;
            files.UnionWith(f);
        }
        return [.. files.Order(StringComparer.Ordinal)];
    }

    /// <summary>
    ///  Can <paramref name="b"/> join <paramref name="a"/>? Two existing commits:
    ///  git merge-tree answers, with both sides of each conflicted file. With a
    ///  planned commit on either side: the files each side changes since they
    ///  parted, declared ones for planned commits.
    /// </summary>
    private (string Result, string Because, List<BranchPlanConflictDto>? Conflicts) CheckJoin(PlanState s, string a, string b, string aName, string bName)
    {
        PlanNode? na = s.Nodes.GetValueOrDefault(a), nb = s.Nodes.GetValueOrDefault(b);
        if (na is { Kind: "exists", Sha: not null } && nb is { Kind: "exists", Sha: not null })
            return MergeTree(s, a, b, aName, bName);
        HashSet<string> aAnc = s.Ancestors(a), bAnc = s.Ancestors(b);
        List<string>? aFiles = JoinFiles(s, aAnc.Where(id => !bAnc.Contains(id)));
        List<string>? bFiles = JoinFiles(s, bAnc.Where(id => !aAnc.Contains(id)));
        if (aFiles is null || bFiles is null) return ("unknown", "planned commits without declared files: checked once they exist", null);
        List<string> both = [.. aFiles.Intersect(bFiles, StringComparer.Ordinal)];
        return both.Count > 0
            ? ("risk", $"both sides change {string.Join(", ", both)}", null)
            : ("unknown", "no file changed on both sides (declared files); checked again once the planned commits exist", null);
    }

    private (string, string, List<BranchPlanConflictDto>?) MergeTree(PlanState s, string a, string b, string aName, string bName)
    {
        CommandResult r = RunTimed(s.Root, 60_000, NoIsNotFailure, "-c", "core.quotepath=false", "merge-tree", "--write-tree", "--name-only", "--no-messages", a, b);
        if (r.ExitCode == 0) return ("ok", "git merge-tree: clean", null);
        if (r.ExitCode != 1) return ("unknown", "git merge-tree could not answer: " + (r.StdErr.Trim() is { Length: > 0 } e ? e : "no output"), null);
        List<string> files = [.. r.StdOut.Split('\n').Skip(1).TakeWhile(l => l.Trim().Length > 0).Select(l => l.Trim()).Distinct(StringComparer.Ordinal)];
        string mb = RunTimed(s.Root, 30_000, NoIsNotFailure, "merge-base", a, b).StdOut.Trim();
        List<BranchPlanConflictDto> conflicts = [];
        foreach (string file in files.Take(10))
            conflicts.Add(new(file, [Side(s, mb, a, aName, file), Side(s, mb, b, bName, file)]));
        return ("conflict", $"git merge-tree stops on {string.Join(", ", files)}", conflicts);
    }

    private BranchPlanSideDto Side(PlanState s, string mergeBase, string tip, string label, string file)
    {
        string[] last = Run(s.Root, "log", "-1", "--format=%h%x1f%s", $"{mergeBase}..{tip}", "--", file).StdOut.Trim().Split('\u001f');
        string patch = Run(s.Root, "-c", "core.quotepath=false", "diff", "--no-color", "-U2", mergeBase, tip, "--", file).StdOut;
        string[] lines = patch.Split('\n');
        int start = Array.FindIndex(lines, l => l.StartsWith("@@", StringComparison.Ordinal));
        string body = start < 0 ? "" : string.Join('\n', lines.Skip(start).Take(40)).TrimEnd();
        return new(label, last.Length > 0 && last[0].Length > 0 ? last[0] : null, last.Length > 1 ? last[1] : null, body);
    }

    /// <summary>
    ///  One lane per branch: the default branch first, then the plan's local
    ///  branches in the order the steps name them. Each claims the nodes on
    ///  the first-parent chain of every place it holds during the plan.
    /// </summary>
    private List<string> AssignPlanLanes(PlanState s, IReadOnlyList<BranchPlanStepRequest> steps)
    {
        List<string> order = [];
        string? def = DefaultBranchRef(s.Root);
        string? defName = def is null ? null : def.StartsWith("refs/heads/", StringComparison.Ordinal) ? def[11..] : def.StartsWith("refs/remotes/", StringComparison.Ordinal) ? def[(def.IndexOf('/', 13) + 1)..] : null;
        if (defName is not null && s.Timeline.ContainsKey(defName) && s.RefKind.GetValueOrDefault(defName) == "local") order.Add(defName);
        foreach (BranchPlanStepRequest st in steps)
            foreach (string? name in new[] { st.Into, st.Onto, st.Branch, st.From, st.Name, st.On })
                if (!string.IsNullOrWhiteSpace(name) && s.RefKind.GetValueOrDefault(name) == "local" && s.Timeline.ContainsKey(name) && !order.Contains(name))
                    order.Add(name);
        for (int lane = 0; lane < order.Count; lane++)
        {
            foreach (BranchPlanRefPosDto pos in s.Timeline[order[lane]].OrderByDescending(p => p.Step))
            {
                string? id = pos.Node;
                while (id is not null && s.Nodes.TryGetValue(id, out PlanNode? node) && node.Lane < 0)
                {
                    node.Lane = lane;
                    id = node.Parents.FirstOrDefault();
                }
            }
        }
        if (s.Nodes.Values.Any(x => x.Lane < 0))
        {
            foreach (PlanNode node in s.Nodes.Values.Where(x => x.Lane < 0)) node.Lane = order.Count;
            order.Add("");
        }
        return order;
    }

    /// <summary>Children before parents; the newest (planned last) first.</summary>
    private static List<PlanNode> OrderPlanNodes(PlanState s)
    {
        Dictionary<string, int> children = s.Nodes.Keys.ToDictionary(k => k, _ => 0, StringComparer.Ordinal);
        foreach (PlanNode n in s.Nodes.Values)
            foreach (string p in n.Parents) children[p]++;
        PriorityQueue<PlanNode, long> ready = new();
        foreach (PlanNode n in s.Nodes.Values.Where(n => children[n.Id] == 0)) ready.Enqueue(n, -n.Time);
        List<PlanNode> outList = [];
        while (ready.TryDequeue(out PlanNode? n, out _))
        {
            outList.Add(n);
            foreach (string p in n.Parents)
                if (--children[p] == 0) ready.Enqueue(s.Nodes[p], -s.Nodes[p].Time);
        }
        return outList;
    }

    // ---------------------------------------------------------------- sessions

    /// <summary>Opens a plan as a session of kind "plan"; a step that cannot run refuses it.</summary>
    public AgentReviewDto CreateBranchPlan(BranchPlanRequest req)
    {
        string mode = req.Mode?.Trim() ?? "";
        if (mode is not ("notify" or "wait")) throw new InvalidOperationException("mode must be notify or wait");
        string title = req.Title?.Trim() ?? "";
        if (title.Length == 0 || title.Length > 200) throw new InvalidOperationException("title must be 1 to 200 characters");
        BranchPlanPreviewDto plan = PreviewBranchPlan(req.Steps, req.Prs);
        RefuseInvalid(plan);
        string id = Convert.ToHexStringLower(System.Security.Cryptography.RandomNumberGenerator.GetBytes(20));
        string now = Timestamp();
        AgentReviewRoundDto round = new(1, now, null, null, [], [], [], plan);
        AgentReviewDto session = new(2, id, mode, title, req.Why?.Trim() ?? "", Clean(req.Agent), Current?.Branch, null, null, false,
            [], "pending", true, now, now, null, null, null, Rounds: [round], Comments: [], Kind: "plan");
        session = session with { Comments = WithPlanExplanations(session, round, req.Explanations) };
        session = AttachBoard(session, req.Board);
        lock (_agentReviewWriteGate) WriteAgentReview(session);
        AgentReviewRepos.Remember(RequireRoot());
        AfterRoundOpened(session, round);
        return session;
    }

    private static void RefuseInvalid(BranchPlanPreviewDto plan)
    {
        if (plan.Steps.FirstOrDefault(x => x.Result == "invalid") is { } bad)
            throw new InvalidOperationException($"step {bad.N} cannot run: {bad.Because}");
    }

    private static List<AgentReviewThreadDto> WithPlanExplanations(AgentReviewDto session, AgentReviewRoundDto round, IReadOnlyList<BranchPlanExplainRequest>? items)
    {
        List<AgentReviewThreadDto> threads = [.. session.Comments ?? []];
        if (items is not { Count: > 0 }) return threads;
        string author = session.Agent?.Trim() is { Length: > 0 } a ? a : "agent";
        int next = NextCommentId(session with { Comments = threads });
        int steps = round.Plan?.Steps.Count ?? 0;
        foreach (BranchPlanExplainRequest e in items)
        {
            string body = Clean(e.Body) ?? throw new InvalidOperationException("an explanation needs a body");
            if (e.Step < 1 || e.Step > steps) throw new InvalidOperationException($"explanation step must be 1 to {steps}: {e.Step}");
            threads.Add(new($"c{next++}", round.N, null, "plan", $"s{e.Step}", body, "explain", Timestamp(), [], author));
        }
        return threads;
    }

    private AgentReviewDto RequirePlanPending(string id)
    {
        AgentReviewDto session = RequireV2Pending(id);
        if (session.Kind != "plan") throw new InvalidOperationException("this agent review is not a branch plan");
        return session;
    }

    /// <summary>The agent's next round: new steps (or the same ones checked again), replies, explanations.</summary>
    public AgentReviewDto ReviseBranchPlan(string id, BranchPlanReviseRequest req)
    {
        lock (_agentReviewWriteGate)
        {
            AgentReviewDto session = RequirePlanPending(id);
            AgentReviewRoundDto previous = LatestRound(session)!;
            BranchPlanPreviewDto plan = PreviewBranchPlan(req.Steps is { Count: > 0 } steps ? steps : [.. previous.Plan!.Steps.Select(x => x.Spec)], req.Prs ?? previous.Plan!.Prs);
            RefuseInvalid(plan);
            AgentReviewRoundDto round = new(previous.N + 1, Timestamp(), null, Clean(req.Note), [], [], [], plan);
            List<AgentReviewThreadDto> threads = WithPlanExplanations(session, round, req.Explanations);
            foreach (AgentReviewReplyRequest reply in req.Replies ?? [])
            {
                int at = threads.FindIndex(t => t.Id == reply.Comment);
                if (at < 0 || string.IsNullOrWhiteSpace(reply.Body)) continue;
                threads[at] = threads[at] with { Replies = [.. threads[at].Replies, new(session.Agent ?? "agent", reply.Body.Trim(), Timestamp(), null)] };
            }
            AgentReviewDto updated = session with { Rounds = [.. session.Rounds!, round], Comments = threads, Unread = true, UpdatedAt = Timestamp() };
            WriteAgentReview(updated);
            AfterRoundOpened(updated, round);
            return updated;
        }
    }

    /// <summary>The owner's comment on a step: a conversation, posted on the board at once and sent with the round.</summary>
    public AgentReviewThreadDto CommentBranchPlanStep(string id, BranchPlanCommentRequest req)
    {
        string body = Clean(req.Body) ?? throw new InvalidOperationException("body is required");
        lock (_agentReviewWriteGate)
        {
            AgentReviewDto session = RequirePlanPending(id);
            AgentReviewRoundDto round = LatestRound(session)!;
            if (round.SentAt is not null) throw new AgentReviewStateException($"round {round.N} was sent to the agent; comment on round {round.N + 1}");
            if (req.Step < 1 || req.Step > (round.Plan?.Steps.Count ?? 0)) throw new InvalidOperationException($"no step {req.Step}");
            AgentReviewThreadDto thread = new($"c{NextCommentId(session)}", round.N, null, "plan", $"s{req.Step}", body, "round", Timestamp(), []);
            long? boardId = null;
            if (session.Board is not null)
            {
                try { boardId = Board()?.Post(BoardHuman, session.Board, $"{thread.Id} · step {req.Step}\n{body}").Id; }
                catch (Exception ex) when (ex is Microsoft.Data.Sqlite.SqliteException or InvalidOperationException or IOException)
                {
                    Console.Error.WriteLine($"[engine] board: could not post on {session.Board}: {ex.Message}");
                }
            }
            WriteAgentReview(session with { Comments = [.. session.Comments ?? [], thread], UpdatedAt = Timestamp() });
            return thread;
        }
    }

    /// <summary>The latest round's steps checked again against the repository as it is now.</summary>
    public AgentReviewDto RecheckBranchPlan(string id)
    {
        lock (_agentReviewWriteGate)
        {
            AgentReviewDto session = RequirePlanPending(id);
            AgentReviewRoundDto round = LatestRound(session)!;
            BranchPlanPreviewDto plan = PreviewBranchPlan([.. round.Plan!.Steps.Select(x => x.Spec)], round.Plan!.Prs);
            AgentReviewDto updated = session with { Rounds = [.. session.Rounds!.Take(session.Rounds!.Count - 1), round with { Plan = plan }], UpdatedAt = Timestamp() };
            WriteAgentReview(updated);
            return updated;
        }
    }

    /// <summary>
    ///  A plan as it stands now, for a read: while it waits for the owner, the
    ///  inputs that moved since the check; once approved, the steps the refs
    ///  show have run. Nothing is written.
    /// </summary>
    public AgentReviewDto WithBranchPlanState(AgentReviewDto session)
    {
        if (session.Kind != "plan" || LatestRound(session) is not { Plan: { } plan } round) return session;
        Dictionary<string, string> now = CurrentRefCommits();
        BranchPlanPreviewDto state = plan;
        if (session.Status == "pending")
        {
            List<string> moved = [.. plan.Inputs.Where(kv => now.GetValueOrDefault(kv.Key) != kv.Value).Select(kv => kv.Key)];
            state = plan with { Moved = moved };
        }
        else if (session.Status == "approved")
        {
            bool[] done = [.. plan.Steps.Select(x => StepRan(x, plan, now))];
            // A step that ran means the git steps before it ran. v0.22.5: a pr
            // step is the agent's word, not git's, so it neither ticks them
            // nor is ticked by them.
            bool later = false;
            for (int i = done.Length - 1; i >= 0; i--)
            {
                if (plan.Steps[i].Op == "pr") continue;
                done[i] |= later;
                later = done[i];
            }
            state = plan with { Steps = [.. plan.Steps.Select((x, i) => x with { Done = done[i] })] };
        }
        return session with { Rounds = [.. session.Rounds!.Take(session.Rounds!.Count - 1), round with { Plan = state }] };
    }

    private Dictionary<string, string> CurrentRefCommits()
    {
        Dictionary<string, string> map = new(StringComparer.Ordinal);
        CommandResult all = Run(RequireRoot(), "for-each-ref", "--format=%(refname)%09%(objectname)%09%(*objectname)", "refs/heads", "refs/tags", "refs/remotes");
        foreach (string line in all.StdOut.Split('\n', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
        {
            string[] p = line.Split('\t');
            if (p.Length < 2) continue;
            string target = p.Length > 2 && p[2].Length > 0 ? p[2] : p[1];
            string name = p[0].StartsWith("refs/heads/", StringComparison.Ordinal) ? p[0][11..]
                : p[0].StartsWith("refs/tags/", StringComparison.Ordinal) ? p[0][10..]
                : p[0].StartsWith("refs/remotes/", StringComparison.Ordinal) ? p[0][13..] : p[0];
            map.TryAdd(name, target);
        }
        return map;
    }

    private bool IsAncestor(string a, string b) => RunTimed(RequireRoot(), 30_000, NoIsNotFailure, "merge-base", "--is-ancestor", a, b).ExitCode == 0;

    /// <summary>Has the step run? Read from where the refs are now (an earlier step counts as run once a later one has).</summary>
    private bool StepRan(BranchPlanStepDto step, BranchPlanPreviewDto plan, Dictionary<string, string> now)
    {
        BranchPlanStepRequest st = step.Spec;
        string? At(string? name) => name is null ? null : now.GetValueOrDefault(name);
        switch (step.Op)
        {
            case "rebase":
            {
                string? tip = At(st.Branch), onto = At(st.Onto);
                return tip is not null && onto is not null && tip != plan.Inputs.GetValueOrDefault(st.Branch!) && IsAncestor(onto, tip);
            }
            case "branch":
                return At(st.Name) is not null;
            case "commit":
            {
                string? on = At(st.On);
                if (on is null) return false;
                List<string> others = [.. plan.Refs.Where(r => r.Kind == "local" && r.Name != st.On).Select(r => At(r.Name)).OfType<string>()];
                int planned = plan.Steps.Count(x => x.Op == "commit" && x.Spec.On == st.On && x.N <= step.N);
                CommandResult r = Run(RequireRoot(), ["rev-list", "--count", on, "--not", .. others]);
                return int.TryParse(r.StdOut.Trim(), out int count) && count >= planned;
            }
            case "merge":
            {
                string? from = At(st.From), into = At(st.Into);
                if (from is null || into is null || into == plan.Inputs.GetValueOrDefault(st.Into!)) return false;
                if (st.Mode == "squash") return true;
                return (st.Mode == "ff" || into != from) && IsAncestor(from, into);
            }
            case "cherry-pick":
            {
                // Done once the branch moved and git cherry finds each commit's change in it.
                string? onto = At(st.Onto);
                if (onto is null || onto == plan.Inputs.GetValueOrDefault(st.Onto!)) return false;
                foreach (string c in st.Commits ?? [])
                {
                    CommandResult r = RunTimed(RequireRoot(), 30_000, NoIsNotFailure, "cherry", onto, c, c + "^");
                    if (r.ExitCode != 0 || !r.StdOut.TrimStart().StartsWith('-')) return false;
                }
                return true;
            }
            case "pr":
                return (plan.Prs ?? []).Any(p => p.Branch == st.From && p.Url is not null && (p.Into is null || st.Into is null || p.Into == st.Into));
            case "tag":
                return At(st.Name) is not null;
            case "delete":
                return At(st.Branch) is null;
            default:
                return false;
        }
    }

    /// <summary>v0.22.5: a PR as the agent gives it: a branch, short free text, an http(s) link or none.</summary>
    private static BranchPlanPrDto CleanPr(BranchPlanPrDto pr)
    {
        static string? Cut(string? v, int max) => v?.Trim() is { Length: > 0 } t ? (t.Length > max ? t[..max] : t) : null;
        string branch = Cut(pr.Branch, 250) ?? throw new InvalidOperationException("a pull request needs its branch");
        string? url = Cut(pr.Url, 2000);
        if (url is not null && !(Uri.TryCreate(url, UriKind.Absolute, out Uri? u) && (u.Scheme == Uri.UriSchemeHttps || u.Scheme == Uri.UriSchemeHttp)))
            throw new InvalidOperationException($"a pull request's url must be an http(s) link: {url}");
        return new(branch, Cut(pr.Id, 40), Cut(pr.Title, 200), url, Cut(pr.State, 40), Cut(pr.Into, 250));
    }

    /// <summary>
    ///  v0.22.5: the agent adds or updates a PR on the plan (one per branch),
    ///  while it waits or once approved: a planned pr step then ticks.
    /// </summary>
    public AgentReviewDto SetBranchPlanPr(string id, BranchPlanPrDto pr)
    {
        BranchPlanPrDto clean = CleanPr(pr);
        lock (_agentReviewWriteGate)
        {
            AgentReviewDto session = GetAgentReview(id) ?? throw new KeyNotFoundException("agent review session not found");
            if (session.Kind != "plan") throw new InvalidOperationException("this agent review is not a branch plan");
            if (session.Status is not ("pending" or "approved")) throw new AgentReviewStateException($"the plan is {session.Status}");
            AgentReviewRoundDto round = LatestRound(session)!;
            List<BranchPlanPrDto> prs = [.. (round.Plan!.Prs ?? []).Where(p => p.Branch != clean.Branch), clean];
            AgentReviewDto updated = session with
            {
                Rounds = [.. session.Rounds!.Take(session.Rounds!.Count - 1), round with { Plan = round.Plan with { Prs = prs } }],
                UpdatedAt = Timestamp(),
            };
            WriteAgentReview(updated);
            return updated;
        }
    }

    /// <summary>The board's line for a plan's round (instead of the review's file and change counts).</summary>
    private static string PlanOpenedText(AgentReviewDto session, AgentReviewRoundDto round)
    {
        BranchPlanPreviewDto plan = round.Plan!;
        int risks = plan.Steps.Count(x => x.Result is "conflict" or "risk");
        StringBuilder text = new($"Plan round {round.N} opened · review {Short(session.Id)} · {plan.Steps.Count} step{S(plan.Steps.Count)}, {risks} conflict risk{S(risks)}");
        text.Append('\n').Append(session.Title);
        if (round.N == 1 && !string.IsNullOrWhiteSpace(session.Why)) text.Append('\n').Append(session.Why.Trim());
        if (round.Note is not null) text.Append('\n').Append(round.Note);
        foreach (BranchPlanStepDto x in plan.Steps.Where(x => x.Result is "conflict" or "risk"))
            text.Append($"\nstep {x.N} {x.Text}: {x.Because}");
        foreach (AgentReviewThreadDto t in (session.Comments ?? []).Where(t => t.Round == round.N && t.Kind == "explain"))
            text.Append($"\n{t.Id} explains step {t.Line[1..]}: {t.Body}");
        return text.ToString();
    }

    private static string PlanSentText(AgentReviewDto session, AgentReviewRoundDto round)
    {
        List<AgentReviewThreadDto> comments = [.. (session.Comments ?? []).Where(c => c.Round == round.N && c.Kind == "round" && c.Path == "plan")];
        StringBuilder text = new($"Round {round.N} sent · plan {Short(session.Id)} · {comments.Count} comment{S(comments.Count)}");
        if (round.Note is not null) text.Append('\n').Append(round.Note);
        foreach (AgentReviewThreadDto c in comments) text.Append($"\nstep {c.Line[1..]}  {c.Id}  {c.Body}");
        text.Append($"\ndetails: branch_plan_get plan_id={session.Id} · revise with branch_plan_revise");
        return text.ToString();
    }
}
