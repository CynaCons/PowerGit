namespace PowerGit.Engine;

public sealed partial class GitHost
{
    public RepoStatusDto Checkout(string branch, bool force)
    {
        string root = RequireRoot();
        if (string.IsNullOrWhiteSpace(branch))
        {
            throw new InvalidOperationException("branch is required");
        }

        if (!force && IsDirty(root))
        {
            throw new InvalidOperationException(
                "The working tree has uncommitted changes. Commit or stash them first, or force the checkout to discard them.");
        }

        List<string> args = force ? ["checkout", "-f", branch] : ["checkout", branch];
        CommandResult result = Run(root, [.. args]);
        if (result.ExitCode != 0)
        {
            throw new InvalidOperationException(string.IsNullOrWhiteSpace(result.StdErr) ? result.StdOut.Trim() : result.StdErr.Trim());
        }

        return GetStatus();
    }

    public RepoStatusDto ResetTo(string commit, string mode)
    {
        string root = RequireRoot();
        if (string.IsNullOrWhiteSpace(commit))
        {
            throw new InvalidOperationException("commit is required");
        }

        if (mode is not ("soft" or "mixed" or "hard"))
        {
            throw new InvalidOperationException($"unsupported reset mode '{mode}'");
        }

        CommandResult result = Run(root, "reset", $"--{mode}", commit);
        if (result.ExitCode != 0)
        {
            throw new InvalidOperationException(string.IsNullOrWhiteSpace(result.StdErr) ? result.StdOut.Trim() : result.StdErr.Trim());
        }

        return GetStatus();
    }

    public RepoStatusDto Rebase(string onto)
    {
        string root = RequireRoot();
        if (string.IsNullOrWhiteSpace(onto))
        {
            throw new InvalidOperationException("onto is required");
        }

        if (IsDirty(root))
        {
            throw new InvalidOperationException(
                "The working tree has uncommitted changes. Commit or stash them before rebasing.");
        }

        CommandResult result = RunTimed(root, 300_000, "rebase", onto);
        if (result.ExitCode != 0)
        {
            // Abort a conflicted rebase so the repo is not left mid-rebase.
            Run(root, "rebase", "--abort");
            throw new InvalidOperationException(
                "Rebase stopped (conflicts or errors); the rebase was aborted. " +
                (string.IsNullOrWhiteSpace(result.StdErr) ? result.StdOut.Trim() : result.StdErr.Trim()));
        }

        return GetStatus();
    }

    private bool IsDirty(string root)
    {
        CommandResult status = Run(root, "status", "--porcelain=v1");
        return !string.IsNullOrWhiteSpace(status.StdOut);
    }
}
