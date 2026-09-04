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

public sealed record StatusFileDto(string Path, string Status, bool Staged);

public sealed record RepoStatusDto(
    string Branch,
    int UnstagedCount,
    int StagedCount,
    StatusFileDto[] Unstaged,
    StatusFileDto[] Staged,
    int? Ahead = null,
    int? Behind = null,
    string? Upstream = null);

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
    string Scope);

public sealed record GitConfigUpdate(
    string? UserName,
    string? UserEmail,
    string? AutoCrlf,
    bool Global = false);

public sealed record VsCodeInfo(bool Found, string? Path, bool Applied);

public sealed record StageRequest(string[] Paths, bool Unstage = false);

public sealed record CommitRequest(string Message, bool Amend = false);

public sealed record CheckoutRequest(string Ref, bool Force = false);

public sealed record ResetRequest(string Commit, string Mode);

public sealed record RebaseRequest(string Onto);

public sealed record PullRequest(bool Rebase = false);

public sealed record PushRequest(bool ForceWithLease = false);

public sealed record CreateRefRequest(string Name, string? Commit = null);

public sealed record JobStartedDto(string Id, string Kind);

public sealed record RemoteInfoDto(string Name, string Url);

public sealed record RemoteUpdate(string Name, string Url);

public sealed record FetchRequest(string Remote);

public sealed record FilesDeleteRequest(string[] Paths);

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
