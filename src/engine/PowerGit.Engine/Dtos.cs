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

public sealed record DiffDto(string Path, string Text, bool Binary);

public sealed record StatusFileDto(string Path, string Status, bool Staged);

public sealed record RepoStatusDto(
    string Branch,
    int UnstagedCount,
    int StagedCount,
    StatusFileDto[] Unstaged,
    StatusFileDto[] Staged);

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

public sealed record CommitRequest(string Message);

public sealed record CheckoutRequest(string Ref, bool Force = false);

public sealed record ResetRequest(string Commit, string Mode);

public sealed record RebaseRequest(string Onto);
