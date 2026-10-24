namespace PowerGit.Engine;

// Branch plans (v0.22.0, docs/design/branch-planner.md, prototype
// docs/prototypes/branch-plan-v1.html). A plan is an agent review session of
// kind "plan": its rounds carry a BranchPlanPreviewDto instead of files, so
// the inbox, the board, rounds, waiting and approval are the review's.

/// <summary>
///  One step as the agent writes it. <c>op</c>: rebase {branch, onto}, branch
///  {name, from}, commit {on, label?, subject?, files?}, merge {from, into,
///  mode: no-ff | ff | squash}, tag {name, at}, delete {branch}; v0.22.1:
///  cherry-pick {commits, onto}; v0.22.5: pr {from, into, title}, a pull
///  request the agent will open on its host.
/// </summary>
public sealed record BranchPlanStepRequest(
    string? Op, string? Branch = null, string? Onto = null, string? Name = null, string? From = null,
    string? Into = null, string? On = null, string? Label = null, string? Subject = null,
    IReadOnlyList<string>? Files = null, string? Mode = null, string? At = null,
    IReadOnlyList<string>? Commits = null, string? Title = null);

/// <summary>One side of a predicted conflict: the ref, its last commit on the file, and its change.</summary>
public sealed record BranchPlanSideDto(string Label, string? Commit, string? Subject, string Patch);

public sealed record BranchPlanConflictDto(string Path, IReadOnlyList<BranchPlanSideDto> Sides);

/// <summary>
///  A checked step. Result: ok (git or the refs say it works), conflict (git
///  merge-tree stops), risk (declared files overlap), unknown (planned
///  commits nobody can check yet), invalid (it cannot run). Nodes: the graph
///  nodes it creates or replaces. Done: set on a read once the refs show it ran.
/// </summary>
public sealed record BranchPlanStepDto(
    int N, string Op, string Text, BranchPlanStepRequest Spec, string Result, string Because,
    IReadOnlyList<string> Commands, IReadOnlyList<BranchPlanConflictDto>? Conflicts = null,
    IReadOnlyList<string>? Nodes = null, bool Done = false);

/// <summary>
///  A commit of the plan's graph, newest first. Kind: exists, planned, merge.
///  From: the step that brings it (0 for an existing commit); GhostAt: the
///  step whose rebase replaces it; Copy: the original a rebased copy repeats.
/// </summary>
public sealed record BranchPlanNodeDto(
    string Id, string? Sha, IReadOnlyList<string> Parents, int Lane, string Kind, int From, int? GhostAt,
    string Subject, string? Author, string? Copy);

public sealed record BranchPlanRefPosDto(int Step, string? Node);

/// <summary>A ref's place through the plan: where it is now (step 0) and where each step moves it (null: deleted).</summary>
public sealed record BranchPlanRefDto(string Name, string Kind, IReadOnlyList<BranchPlanRefPosDto> At);

/// <summary>
///  The checked plan. Inputs: every ref it read, with the commit it was at;
///  Moved (set on a read): the inputs that moved since, so the plan needs a
///  new check before it is approved.
/// </summary>
public sealed record BranchPlanPreviewDto(
    IReadOnlyList<BranchPlanStepDto> Steps, IReadOnlyList<BranchPlanNodeDto> Nodes, IReadOnlyList<string> Lanes,
    IReadOnlyList<BranchPlanRefDto> Refs, IReadOnlyDictionary<string, string> Inputs, string CheckedAt,
    bool Truncated = false, IReadOnlyList<string>? Moved = null, IReadOnlyList<BranchPlanPrDto>? Prs = null);

/// <summary>
///  v0.22.5: a pull request the agent describes, on any host (owner: "At work,
///  we work with bitbucket. So keep it generic, agents should be able to fill
///  their PR infos"). Id is free text ("#42", "PR-17", "!9"); State too
///  (open, merged, declined, draft ...); Url, when given, is an http(s) link.
///  PowerGit never asks a host about it: it shows and links what it is told.
/// </summary>
public sealed record BranchPlanPrDto(string? Branch, string? Id = null, string? Title = null, string? Url = null, string? State = null, string? Into = null);

public sealed record BranchPlanExplainRequest(int Step, string? Body);

public sealed record BranchPlanRequest(
    string? Mode, string? Title, string? Why, string? Agent, IReadOnlyList<BranchPlanStepRequest>? Steps,
    string? Board = null, IReadOnlyList<BranchPlanExplainRequest>? Explanations = null, IReadOnlyList<BranchPlanPrDto>? Prs = null);

public sealed record BranchPlanReviseRequest(
    string? Note, IReadOnlyList<BranchPlanStepRequest>? Steps, IReadOnlyList<AgentReviewReplyRequest>? Replies,
    IReadOnlyList<BranchPlanExplainRequest>? Explanations = null, IReadOnlyList<BranchPlanPrDto>? Prs = null);

public sealed record BranchPlanCommentRequest(int Step, string? Body);

public sealed record BranchPlanPreviewRequest(IReadOnlyList<BranchPlanStepRequest>? Steps);
