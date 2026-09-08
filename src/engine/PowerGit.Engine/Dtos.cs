namespace PowerGit.Engine;

public sealed record RevisionDto(
    string Id,
    string[] Parents,
    string Author,
    string AuthorEmail,
    string Committer,
    string CommitterEmail,
    string Date,
    string Subject,
    string Body,
    string[] Refs,
    bool IsHead);

public sealed record CommitDetailDto(
    string Id,
    string[] Parents,
    string Author,
    string AuthorEmail,
    string Committer,
    string CommitterEmail,
    string AuthorDate,
    string CommitDate,
    string Subject,
    string Body,
    string[] Refs);

public sealed record FileChangeDto(string Path, string Status, bool Binary);

public sealed record TreeEntryDto(string Name, string Type, string Sha);

/// <summary>
/// Text content (a diff or a blob). v0.13.11: <paramref name="SizeBytes"/> is
/// the object's real size, and when the text was cut <paramref name="Truncated"/>
/// says so explicitly with a machine-readable <paramref name="TruncatedReason"/>
/// ("size" past MaxBlobBytes/MaxDiffChars, "lines" past MaxLines) instead of a
/// sentinel string appended to the content.
/// </summary>
public sealed record DiffDto(
    string Path,
    string Text,
    bool Binary,
    long SizeBytes = 0,
    bool Truncated = false,
    string? TruncatedReason = null);

/// <summary>
/// v0.13.14: the changed files of a commit and the diff of the first one in a
/// single response, so the Diff tab needs one round trip per selection.
/// <paramref name="FirstDiff"/> is null when the commit changed nothing.
/// </summary>
public sealed record CommitChangesDto(IReadOnlyList<FileChangeDto> Files, DiffDto? FirstDiff);

public sealed record StatusFileDto(string Path, string Status, bool Staged);

/// <summary>
/// v0.15.0: one unmerged index entry as `git ls-files -u` reports it. Kind is
/// derived from which stages exist: both-modified (1,2,3), added-by-both (2,3),
/// deleted-by-us (1,3), deleted-by-them (1,2), added-by-us (2), added-by-them
/// (3), both-deleted (1). Stage numbers are git's: 1 base, 2 ours, 3 theirs
/// (during a rebase "ours" is the branch being rebased onto; the UI relabels).
/// </summary>
public sealed record ConflictFileDto(
    string Path,
    bool HasBase,
    bool HasOurs,
    bool HasTheirs,
    string? BaseSha,
    string? OursSha,
    string? TheirsSha,
    string Kind);

/// <summary>
/// v0.15.0: the operation the repository is in the middle of (Kind is merge,
/// rebase, cherry-pick or revert). Step/Total come from rebase-merge/msgnum
/// and end (or rebase-apply/next and last); StoppedSha is the commit the
/// sequencer stopped at; Message is MERGE_MSG / SQUASH_MSG while merging.
/// </summary>
public sealed record RepoOperationDto(
    string Kind,
    string? HeadName = null,
    string? Onto = null,
    string? OntoName = null,
    int? Step = null,
    int? Total = null,
    string? StoppedSha = null,
    bool Interactive = false,
    string? Message = null);

public sealed record RepoStatusDto(
    string Branch,
    int UnstagedCount,
    int StagedCount,
    StatusFileDto[] Unstaged,
    StatusFileDto[] Staged,
    int? Ahead = null,
    int? Behind = null,
    string? Upstream = null,
    // v0.15.0: "none" | "merging" | "rebasing" | "cherry-picking" | "reverting".
    // A stopped operation is a state, not an error (Git Extensions parity).
    string State = "none",
    RepoOperationDto? Operation = null,
    ConflictFileDto[]? Conflicts = null);

public sealed record RefItemDto(string Name, string FullName, string Target, bool Current);

public sealed record SubmoduleDto(string Name, string Path, string? Head);

public sealed record RefTreeDto(
    RefItemDto[] Branches,
    RefItemDto[] Remotes,
    RefItemDto[] Tags,
    SubmoduleDto[] Submodules);

public sealed record GitConfigDto(
    string? UserName,
    string? UserEmail,
    string? AutoCrlf,
    string Scope,
    // v0.15.0 settings: the tools, and where the identity actually comes
    // from ("global", "local", "system" or null when unset), so the dialog
    // can say "inherited from global" instead of pretending it is local.
    string? Editor = null,
    string? DiffTool = null,
    string? MergeTool = null,
    string? UserNameOrigin = null,
    string? UserEmailOrigin = null);

public sealed record GitConfigUpdate(
    string? UserName,
    string? UserEmail,
    string? AutoCrlf,
    bool Global = false,
    string? Editor = null,
    string? DiffTool = null,
    string? MergeTool = null,
    /// <summary>Where the chosen diff/merge tool lives, when git cannot find it itself.</summary>
    string? DiffToolPath = null,
    string? MergeToolPath = null);

/// <summary>A diff/merge tool or editor found on this machine (v0.15.0).</summary>
public sealed record ToolInfoDto(string Name, string Label, string? Path, bool Found, string[] Kinds);

public sealed record VsCodeInfo(bool Found, string? Path, bool Applied);

public sealed record StageRequest(string[] Paths, bool Unstage = false);

public sealed record CommitRequest(string Message, bool Amend = false);

public sealed record CheckoutRequest(string Ref, bool Force = false);

public sealed record ResetRequest(string Commit, string Mode);

/// <summary>
/// v0.15.0: `git rebase [--autostash] [--rebase-merges] [--autosquash] onto`.
/// With <paramref name="Todo"/> the rebase is interactive and runs the given
/// list (see <see cref="RebaseTodoEntry"/>) instead of git's own.
/// </summary>
public sealed record RebaseRequest(
    string Onto,
    bool Autosquash = false,
    bool RebaseMerges = false,
    bool Autostash = false,
    RebaseTodoEntry[]? Todo = null);

/// <summary>
/// One line the UI sends back for an interactive rebase. Action is
/// pick | reword | edit | squash | fixup | drop with <paramref name="Sha"/>;
/// reword and squash may carry the new <paramref name="Message"/>. Any other
/// action (label, reset, merge, exec, break, …) is written from
/// <paramref name="Raw"/> verbatim.
/// </summary>
public sealed record RebaseTodoEntry(string Action, string? Sha = null, string? Message = null, string? Raw = null);

/// <summary>A todo line as git generated it (POST /rebase/todo). Non-commit lines have no Sha and are read-only.</summary>
public sealed record RebaseTodoLine(string Action, string? Sha, string? Subject, string Raw);

public sealed record RebaseTodoDto(RebaseTodoLine[] Lines, string Onto, string HeadName);

public sealed record RebaseTodoRequest(string Onto, bool Autosquash = false, bool RebaseMerges = false);

/// <summary>
/// v0.15.0: Git Extensions FormMergeBranch. Ff is only | allow | no; Squash
/// excludes no-ff; a dirty tree is accepted only with Autostash.
/// </summary>
public sealed record MergeRequest(
    string Branch,
    string Ff = "allow",
    bool Squash = false,
    string? Message = null,
    bool Autostash = false,
    bool NoCommit = false);

public sealed record MergeContinueRequest(string? Message = null);

/// <summary>Take is ours | theirs | base | mark | delete (GE HandleConflictSelectSide, stage based).</summary>
public sealed record ConflictResolveRequest(string[] Paths, string Take);

public sealed record MergetoolRequest(string Path);

public sealed record PullRequest(bool Rebase = false);

public sealed record PushRequest(bool ForceWithLease = false);

public sealed record CreateRefRequest(string Name, string? Commit = null);

public sealed record JobStartedDto(string Id, string Kind);

public sealed record RemoteInfoDto(string Name, string Url);

public sealed record RemoteUpdate(string Name, string Url);

public sealed record FetchRequest(string Remote);

public sealed record FilesDeleteRequest(string[] Paths);

/// <summary>v0.13.14: discard working-tree and index changes of the given paths (Git Extensions "Reset file(s) to HEAD").</summary>
public sealed record FilesResetRequest(string[] Paths);

/// <summary>v0.13.14: apply a (partial) unified diff. Cached targets the index (stage / unstage), Reverse undoes it (unstage with Cached, reset selected lines in the working tree without).</summary>
public sealed record ApplyPatchRequest(string Patch, bool Cached = false, bool Reverse = false);

/// <summary>v0.13.14: open the external difftool on a working-tree file (index vs HEAD when <paramref name="Staged"/>).</summary>
public sealed record WorkTreeDifftoolRequest(string Path, bool Staged = false);

public sealed record IgnoreRequest(string Pattern);

public sealed record IgnorePreviewDto(string Pattern, string[] Files, int Count);

public sealed record NameRequest(string Name);

public sealed record StashDto(string Reference, string Id, string Subject);

public sealed record StashRequest(string? Message, bool KeepIndex = false, bool IncludeUntracked = false);

public sealed record StashApplyRequest(string Reference, bool Pop = false);

public sealed record DifftoolRequest(string Commit, string Path);

/// <summary>409 body: a mutation collided with a running operation on the same session (v0.13.6).</summary>
public sealed record BusyResponse(string Error, string Running);

/// <summary>GET /repos entry (v0.13.11): session plus lifecycle facts for diagnostics.</summary>
public sealed record SessionDto(string Id, string Name, string Root, string Branch, string LastUsed, bool Busy, int Watchers);
