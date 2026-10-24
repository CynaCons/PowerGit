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
///  place at every step. A rebase is checked as the merge of its two tips,
///  which is what git 2.38's merge-tree can answer in one call.
/// </summary>
public sealed partial class GitHost
{
    private const int PlanCommitCap = 200;

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
    public BranchPlanPreviewDto PreviewBranchPlan(IReadOnlyList<BranchPlanStepRequest>? steps)
    {
        string root = RequireRoot();
        if (steps is not { Count: > 0 }) throw new InvalidOperationException("a plan needs at least one step");
        if (steps.Count > 40) throw new InvalidOperationException("a plan has at most 40 steps");
        PlanState s = new(root, this);
        LoadPlanRefs(s, steps);
        bool truncated = LoadPlanCommits(s);
        List<BranchPlanStepDto> checkedSteps = [];
        for (int i = 0; i < steps.Count; i++) checkedSteps.Add(PlayStep(s, steps[i], i + 1));
        List<string> lanes = AssignPlanLanes(s, steps);
        List<PlanNode> ordered = OrderPlanNodes(s);
        return new(
            checkedSteps,
            [.. ordered.Select(n => new BranchPlanNodeDto(n.Id, n.Sha, n.Parents, n.Lane, n.Kind, n.From, n.GhostAt, n.Subject, n.Author, n.Copy))],
            lanes,
            [.. s.Timeline.Select(kv => new BranchPlanRefDto(kv.Key, s.RefKind.GetValueOrDefault(kv.Key, "local"), kv.Value))],
            new Dictionary<string, string>(s.Inputs, StringComparer.Ordinal),
            Timestamp(),
            truncated);
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
    }

    /// <summary>The commits from the plan's refs down to their common base, newest first.</summary>
    private bool LoadPlanCommits(PlanState s)
    {
        List<string> tips = [.. s.Inputs.Values.Distinct(StringComparer.Ordinal)];
        if (tips.Count == 0) return false;
        string baseSha = tips[0];
        if (tips.Count > 1)
        {
            CommandResult mb = RunTimed(s.Root, 30_000, NoIsNotFailure, ["merge-base", "--octopus", .. tips]);
            if (mb.ExitCode == 0 && mb.StdOut.Trim().Length > 0) baseSha = mb.StdOut.Trim();
        }
        List<string> args = ["-c", "core.quotepath=false", "log", "--topo-order", "--decorate=full", $"-n{PlanCommitCap + 1}",
            "--format=%H%x1f%P%x1f%an%x1f%ct%x1f%s%x1f%D", .. tips, "--not", baseSha + "^@"];
        CommandResult log = Run(s.Root, [.. args]);
        string[] lines = log.StdOut.Split('\n', StringSplitOptions.RemoveEmptyEntries);
        bool truncated = lines.Length > PlanCommitCap;
        foreach (string line in lines.Take(PlanCommitCap))
        {
            string[] f = line.Split('\u001f');
            if (f.Length < 6) continue;
            long time = long.TryParse(f[3], NumberStyles.Integer, CultureInfo.InvariantCulture, out long t) ? t : 0;
            s.Clock = Math.Max(s.Clock, time);
            s.Nodes[f[0]] = new PlanNode
            {
                Id = f[0], Sha = f[0], Parents = [.. f[1].Split(' ', StringSplitOptions.RemoveEmptyEntries)],
                Kind = "exists", Subject = f[4], Author = f[2], Time = time,
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
                (string result, string because, List<BranchPlanConflictDto>? conflicts) = CheckJoin(s, onto, tip, st.Onto!, st.Branch!);
                string parent = onto;
                List<string> touched = [];
                foreach (PlanNode c in moving)
                {
                    PlanNode copy = new()
                    {
                        Id = $"{c.Id}@{n}", Parents = [parent], Kind = "planned", From = n, Subject = c.Subject, Author = c.Author,
                        Copy = c.Id, Files = s.FilesOf(c), Time = Tick(),
                    };
                    s.Nodes[copy.Id] = copy;
                    c.GhostAt ??= n;
                    parent = copy.Id;
                    touched.Add(copy.Id);
                    touched.Add(c.Id);
                }
                s.Move(st.Branch!, parent, n);
                return new(n, op, text, st, result, because, cmd, conflicts, touched);
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
            default:
                return Invalid(op.Length == 0 ? "Unknown step" : op, "op must be rebase, branch, commit, merge, tag or delete");
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
        BranchPlanPreviewDto plan = PreviewBranchPlan(req.Steps);
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
            BranchPlanPreviewDto plan = PreviewBranchPlan(req.Steps is { Count: > 0 } steps ? steps : [.. previous.Plan!.Steps.Select(x => x.Spec)]);
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
            BranchPlanPreviewDto plan = PreviewBranchPlan([.. round.Plan!.Steps.Select(x => x.Spec)]);
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
            for (int i = done.Length - 1; i > 0; i--) if (done[i]) done[i - 1] = true;
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
            case "tag":
                return At(st.Name) is not null;
            case "delete":
                return At(st.Branch) is null;
            default:
                return false;
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
