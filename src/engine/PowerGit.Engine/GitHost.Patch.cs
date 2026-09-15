namespace PowerGit.Engine;

/// <summary>
/// v0.18.6, owner: "Being able to export a patch from a commit. Probably
/// from the right click menu." Git Extensions' FormFormatPatch runs
/// <c>git format-patch --find-renames --find-copies --break-rewrites</c>
/// over a range into a directory; PowerGit exports one commit at a time
/// and streams the mailbox-format text (<c>-1 --stdout</c>) so the shell
/// or the browser can write it where the user points. The engine never
/// touches the destination. The pending rows get the plain
/// <c>git diff --binary</c> of the working tree or the index.
/// </summary>
public sealed partial class GitHost
{
    public const string PatchContentType = "text/x-patch; charset=utf-8";

    /// <summary>
    ///  git's own file name for a formatted patch (<c>log-tree.c</c>
    ///  <c>fmt_output_subject</c>): <c>0001-</c>, the sanitized subject
    ///  (<c>%f</c>), chopped so the whole name stays under the 64-byte
    ///  default, then <c>.patch</c>. Matching git matters: the user sees
    ///  the same name as on the command line.
    /// </summary>
    internal static string PatchFileName(string sanitizedSubject)
    {
        const string suffix = ".patch";
        const int nameMax = 64;
        string stem = "0001-" + sanitizedSubject;
        int max = nameMax - (suffix.Length + 1);
        return (stem.Length > max ? stem[..max] : stem) + suffix;
    }

    /// <summary>
    /// `git format-patch -1 --stdout` of one commit with Git Extensions'
    /// three flags, streamed like <see cref="OpenArchive"/>: the returned
    /// stream is git's stdout and disposing it ends the process. The
    /// revision is verified first, so a bad id is an
    /// <see cref="InvalidOperationException"/> with git's words, not an
    /// empty file; so is a merge, which format-patch silently skips.
    /// </summary>
    public Stream OpenPatch(string id, out string fileName, out string contentType)
    {
        string root = RequireRoot();
        if (string.IsNullOrWhiteSpace(id))
        {
            throw new InvalidOperationException("commit is required");
        }

        CommandResult verified = Run(root, "rev-parse", "--verify", id + "^{commit}");
        if (verified.ExitCode != 0)
        {
            // git's own line is "fatal: Needed a single revision": name the id for it.
            throw new InvalidOperationException($"'{id}' is not a commit ({ErrorText(verified)})");
        }

        string sha = verified.StdOut.Trim();
        // One read for both: the name git would give the file, and the
        // parent list that tells a merge apart.
        CommandResult meta = Run(root, "log", "-1", "--format=%f%n%P", sha);
        if (meta.ExitCode != 0)
        {
            throw new InvalidOperationException(ErrorText(meta));
        }

        string[] lines = meta.StdOut.Split('\n');
        string parents = lines.Length > 1 ? lines[1].Trim() : string.Empty;
        if (parents.Contains(' '))
        {
            throw new InvalidOperationException($"{sha[..7]} is a merge commit; git format-patch has no patch for a merge.");
        }

        fileName = PatchFileName(lines[0].Trim());
        contentType = PatchContentType;
        return StartStreamed(root, ["format-patch", "-1", "--stdout", "--find-renames", "--find-copies", "--break-rewrites", sha]);
    }

    /// <summary>
    /// The pending change as a patch: `git diff --binary` for the working
    /// tree (<paramref name="scope"/> "worktree") or `git diff --cached
    /// --binary` for the index ("index"), named
    /// <c>&lt;repo&gt;-&lt;scope&gt;.patch</c>. Untracked files are not in
    /// a diff, as on the command line.
    /// </summary>
    public Stream OpenWorktreePatch(string? scope, out string fileName, out string contentType)
    {
        string root = RequireRoot();
        scope = string.IsNullOrWhiteSpace(scope) ? "worktree" : scope.Trim().ToLowerInvariant();
        if (scope is not ("worktree" or "index"))
        {
            throw new InvalidOperationException("scope must be worktree or index");
        }

        fileName = $"{Current!.Name}-{scope}.patch";
        contentType = PatchContentType;
        List<string> args = ["diff", "--no-color", "--binary"];
        if (scope == "index")
        {
            args.Insert(1, "--cached");
        }

        return StartStreamed(root, args);
    }
}
