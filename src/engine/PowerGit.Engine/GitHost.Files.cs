using System.Diagnostics;

namespace PowerGit.Engine;

/// <summary>
///  File operations of the commit dialog's right-click menu (v0.16.0), the
///  routes under <c>/files/*</c>. Owner: "on the left we have the files
///  staged and unstaged. We need functional parity with what GE has. Should
///  be able to right click on my files and do operations on them." The item
///  set is Git Extensions' <c>FileStatusList</c> menu; each method here is
///  one of its handlers (<c>FileStatusList.ContextMenu.cs</c>).
/// </summary>
public sealed partial class GitHost
{
    /// <summary>
    ///  A repository-relative path made absolute, refused when it points
    ///  outside the working tree. Every route below takes paths from the UI,
    ///  and "open this file" must never become "open any file". Two checks:
    ///  the lexical one on the normalised path, with the file system's own
    ///  case rule (a sibling <c>/tmp/Repo</c> is not <c>/tmp/repo</c> on
    ///  Linux), then the same on the real path with every link followed, so
    ///  <c>link -> /etc</c> inside the tree does not let <c>link/passwd</c>
    ///  through. The lexical path is what comes back: it is the name the
    ///  caller and git know the file by.
    /// </summary>
    internal static string ResolveInRoot(string root, string path)
    {
        if (string.IsNullOrWhiteSpace(path))
        {
            throw new InvalidOperationException("path is required");
        }

        string rootFull = WithTrailingSeparator(Path.GetFullPath(root));
        string full = Path.GetFullPath(Path.Combine(rootFull, path.Replace('/', Path.DirectorySeparatorChar)));
        if (!full.StartsWith(rootFull, PathComparison))
        {
            throw new InvalidOperationException($"{path} is outside the repository");
        }

        string rootReal = WithTrailingSeparator(RealPath(rootFull));
        string fullReal = WithTrailingSeparator(RealPath(full));
        if (!fullReal.StartsWith(rootReal, PathComparison))
        {
            throw new InvalidOperationException($"{path} is outside the repository");
        }

        return full;
    }

    /// <summary>
    ///  How two paths compare on this file system: case matters on Linux,
    ///  not on Windows or macOS (their default file systems fold case).
    /// </summary>
    internal static StringComparison PathComparison
        => OperatingSystem.IsWindows() || OperatingSystem.IsMacOS() ? StringComparison.OrdinalIgnoreCase : StringComparison.Ordinal;

    private static string WithTrailingSeparator(string path)
        => path.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar) + Path.DirectorySeparatorChar;

    /// <summary>
    ///  <paramref name="full"/> with every symbolic link, junction or other
    ///  reparse point on it followed, for the part of it that exists; the
    ///  missing tail (a file about to be created by <c>git mv</c>) is kept
    ///  as given. <see cref="FileSystemInfo.ResolveLinkTarget"/> follows
    ///  only the entry it is asked about, not the links in the directories
    ///  above it, so this walks the path one component at a time from the
    ///  drive or <c>/</c> and starts over from the target whenever it meets
    ///  a link. A link that cannot be followed (dangling, cyclic, denied)
    ///  is left in place: the OS will not open it either.
    /// </summary>
    internal static string RealPath(string full)
    {
        string? existing = full;
        string tail = "";
        while (existing is not null && !Directory.Exists(existing) && !File.Exists(existing))
        {
            string name = Path.GetFileName(existing);
            if (name.Length == 0)
            {
                break;
            }

            tail = tail.Length == 0 ? name : Path.Combine(name, tail);
            existing = Path.GetDirectoryName(existing);
        }

        if (existing is null)
        {
            return full;
        }

        string real = FollowLinks(existing, hops: 0);
        return tail.Length == 0 ? real : Path.Combine(real, tail);
    }

    private static string FollowLinks(string existing, int hops)
    {
        string? drive = Path.GetPathRoot(existing);
        if (string.IsNullOrEmpty(drive) || hops > 40)
        {
            return existing;
        }

        string[] parts = existing[drive.Length..].Split([Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar], StringSplitOptions.RemoveEmptyEntries);
        string current = drive;
        for (int i = 0; i < parts.Length; i++)
        {
            current = Path.Combine(current, parts[i]);
            FileSystemInfo info = Directory.Exists(current) ? new DirectoryInfo(current) : new FileInfo(current);
            string? target;
            try
            {
                target = info.LinkTarget is null ? null : info.ResolveLinkTarget(returnFinalTarget: true)?.FullName;
            }
            catch (IOException)
            {
                target = null;
            }
            catch (UnauthorizedAccessException)
            {
                target = null;
            }

            if (target is null)
            {
                continue;
            }

            string rest = string.Join(Path.DirectorySeparatorChar, parts[(i + 1)..]);
            string rebuilt = Path.GetFullPath(rest.Length == 0 ? target : Path.Combine(target, rest));
            return FollowLinks(rebuilt, hops + 1);
        }

        return current;
    }

    /// <summary>
    ///  GE "Open working directory file" / "Open working directory file with...":
    ///  the OS default handler (<c>start</c> / <c>xdg-open</c> / <c>open</c>), or
    ///  <paramref name="with"/> — a program path or command — given the file as
    ///  its argument. Detached: the app owns its own lifetime.
    /// </summary>
    public void OpenFile(string path, string? with = null)
    {
        string root = RequireRoot();
        string full = ResolveInRoot(root, path);
        if (!File.Exists(full))
        {
            throw new InvalidOperationException($"{path} does not exist in the working tree");
        }

        if (string.IsNullOrWhiteSpace(with))
        {
            StartDetached(ShellOpen(full), root);
            return;
        }

        StartDetached(WithProgram(with.Trim(), full), root);
    }

    /// <summary>
    ///  GE "Edit working directory file". Git Extensions opens its own editor;
    ///  PowerGit has none, so this is the editor the user configured for git
    ///  (<c>core.editor</c>, the Settings → Tools field) when there is one,
    ///  else the OS default handler as <see cref="OpenFile"/>.
    /// </summary>
    public void EditFile(string path)
    {
        string root = RequireRoot();
        string full = ResolveInRoot(root, path);
        if (!File.Exists(full))
        {
            throw new InvalidOperationException($"{path} does not exist in the working tree");
        }

        CommandResult cfg = Run(root, "config", "--get", "core.editor");
        string editor = cfg.ExitCode == 0 ? cfg.StdOut.Trim() : "";
        StartDetached(editor.Length > 0 && !IsTerminalEditor(editor) ? WithProgram(editor, full) : ShellOpen(full), root);
    }

    /// <summary>
    ///  vi and friends need a terminal we do not have; started detached they
    ///  would sit invisible or die at once, so such a setting falls back to
    ///  the OS handler.
    /// </summary>
    internal static bool IsTerminalEditor(string editor)
    {
        string name = Path.GetFileNameWithoutExtension(FirstToken(editor)).ToLowerInvariant();
        return name is "vi" or "vim" or "nvim" or "nano" or "pico" or "ed" or "joe" or "micro"
            || (name == "emacs" && editor.Contains("-nw", StringComparison.Ordinal));
    }

    /// <summary>The program of a command line: the first quoted or space-delimited token, unquoted.</summary>
    internal static string FirstToken(string commandLine)
    {
        string text = commandLine.Trim();
        if (text.StartsWith('"'))
        {
            int close = text.IndexOf('"', 1);
            return close > 0 ? text[1..close] : text.Trim('"');
        }

        int space = text.IndexOf(' ');
        return space > 0 ? text[..space] : text;
    }

    /// <summary>The OS "open with the default application" for one file.</summary>
    private static ProcessStartInfo ShellOpen(string full)
    {
        if (OperatingSystem.IsWindows())
        {
            return new ProcessStartInfo(full) { UseShellExecute = true };
        }

        ProcessStartInfo psi = new(OperatingSystem.IsMacOS() ? "open" : "xdg-open") { UseShellExecute = false };
        psi.ArgumentList.Add(full);
        return psi;
    }

    /// <summary>
    ///  <paramref name="program"/> is either an executable path or a command
    ///  line (git's <c>core.editor</c> looks like <c>"C:\...\Code.exe" --wait</c>);
    ///  the file is appended as the last argument through the platform shell,
    ///  which is the same reading git gives the editor setting.
    /// </summary>
    private static ProcessStartInfo WithProgram(string program, string full)
    {
        if (File.Exists(program))
        {
            ProcessStartInfo direct = new(program) { UseShellExecute = false };
            direct.ArgumentList.Add(full);
            return direct;
        }

        // "C:\apps\x.exe --flag": an explicit path that is not there is a
        // typo in the Open-with prompt, and the shell would fail it silently.
        string head = FirstToken(program);
        if ((head.Contains(Path.DirectorySeparatorChar) || head.Contains(Path.AltDirectorySeparatorChar)) && !File.Exists(head))
        {
            throw new InvalidOperationException($"could not start {head}: no such program");
        }

        if (OperatingSystem.IsWindows())
        {
            // Raw Arguments, not ArgumentList: the list would escape the inner
            // quotes as \" which cmd.exe does not read. /s strips the outer pair.
            return new ProcessStartInfo("cmd.exe")
            {
                UseShellExecute = false,
                CreateNoWindow = true,
                Arguments = $"/d /s /c \"{program} \"{full}\"\"",
            };
        }

        ProcessStartInfo sh = new("/bin/sh") { UseShellExecute = false };
        sh.ArgumentList.Add("-c");
        sh.ArgumentList.Add($"{program} \"$1\"");
        sh.ArgumentList.Add("sh");
        sh.ArgumentList.Add(full);
        return sh;
    }

    private static void StartDetached(ProcessStartInfo psi, string workingDirectory)
    {
        psi.WorkingDirectory = workingDirectory;
        try
        {
            using Process? process = Process.Start(psi);
            if (process is null)
            {
                throw new InvalidOperationException($"could not start {psi.FileName}");
            }

            // Not awaited — but a launch that dies within the blink of an
            // eye (shell: "not recognized as a command") is a failure the
            // user must hear about, not a window that never appeared.
            if (process.WaitForExit(400) && process.ExitCode != 0)
            {
                throw new InvalidOperationException($"{psi.FileName} exited with code {process.ExitCode} before opening the file");
            }
        }
        catch (System.ComponentModel.Win32Exception ex)
        {
            throw new InvalidOperationException($"could not start {psi.FileName}: {ex.Message}");
        }
    }

    /// <summary>GE "Skip worktree" (check item): <c>git update-index --[no-]skip-worktree</c>.</summary>
    public void SetSkipWorktree(IReadOnlyList<string> paths, bool on)
        => UpdateIndexBit(paths, on ? "--skip-worktree" : "--no-skip-worktree");

    /// <summary>GE "Assume unchanged" (check item): <c>git update-index --[no-]assume-unchanged</c>.</summary>
    public void SetAssumeUnchanged(IReadOnlyList<string> paths, bool on)
        => UpdateIndexBit(paths, on ? "--assume-unchanged" : "--no-assume-unchanged");

    private void UpdateIndexBit(IReadOnlyList<string> paths, string flag)
    {
        string root = RequireRoot();
        List<string> clean = CleanPaths(root, paths);
        if (clean.Count == 0)
        {
            throw new InvalidOperationException("no paths given");
        }

        CommandResult result = Run(root, ["update-index", flag, "--", .. clean]);
        if (result.ExitCode != 0)
        {
            throw new InvalidOperationException(Explain(result, flag));
        }
    }

    /// <summary>
    ///  GE "Add file to .git/info/exclude": like "Add file to .gitignore" but
    ///  in the repository-local exclude file that is never committed. Each
    ///  path is written anchored (<c>/dir/file</c>), as GE does, so it
    ///  matches that file only. Nothing under <c>.git</c> is watched, so the
    ///  change stream is bumped by hand for the UI to re-read status.
    /// </summary>
    public void ExcludeFiles(IReadOnlyList<string> patterns)
    {
        string root = RequireRoot();
        List<string> lines = [];
        foreach (string raw in patterns)
        {
            string line = raw.Trim().Replace('\\', '/');
            if (line.Length > 0)
            {
                lines.Add(line);
            }
        }

        if (lines.Count == 0)
        {
            throw new InvalidOperationException("pattern is required");
        }

        string gitDir = Run(root, "rev-parse", "--git-path", "info/exclude").StdOut.Trim();
        string exclude = Path.IsPathRooted(gitDir) ? gitDir : Path.Combine(root, gitDir.Replace('/', Path.DirectorySeparatorChar));
        Directory.CreateDirectory(Path.GetDirectoryName(exclude)!);
        // A file that does not end in a newline would glue our first line to
        // its last one.
        if (File.Exists(exclude))
        {
            string existing = File.ReadAllText(exclude);
            if (existing.Length > 0 && !existing.EndsWith('\n'))
            {
                File.AppendAllText(exclude, "\n");
            }
        }

        File.AppendAllLines(exclude, lines);
        NotifyStatusChanged();
    }

    /// <summary>GE "Stop tracking this file": <c>git rm --cached</c>, the file stays on disk.</summary>
    public void StopTracking(IReadOnlyList<string> paths)
    {
        string root = RequireRoot();
        List<string> clean = CleanPaths(root, paths);
        if (clean.Count == 0)
        {
            throw new InvalidOperationException("no paths given");
        }

        CommandResult result = Run(root, ["rm", "-r", "-q", "--cached", "--", .. clean]);
        if (result.ExitCode != 0)
        {
            throw new InvalidOperationException(Explain(result, "stop tracking"));
        }
    }

    /// <summary>GE "Rename / move": <c>git mv</c>; the new name is repository-relative.</summary>
    public void MoveFile(string path, string newPath)
    {
        string root = RequireRoot();
        ResolveInRoot(root, path);
        string target = ResolveInRoot(root, newPath);
        if (File.Exists(target) || Directory.Exists(target))
        {
            throw new InvalidOperationException($"{newPath} already exists");
        }

        Directory.CreateDirectory(Path.GetDirectoryName(target)!);
        CommandResult result = Run(root, "mv", "--", path, newPath);
        if (result.ExitCode != 0)
        {
            throw new InvalidOperationException(Explain(result, "move"));
        }
    }

    /// <summary>
    ///  The index bits per tracked path, from <c>git ls-files -v</c>: an
    ///  upper-case letter is an ordinary entry, lower-case means
    ///  assume-unchanged, <c>S</c>/<c>s</c> skip-worktree (GE
    ///  <c>GitModule.GetAllChangedFiles</c> reads the same letters). Only
    ///  flagged paths are returned, so the dictionary is empty for the
    ///  ordinary repository.
    /// </summary>
    internal Dictionary<string, (bool SkipWorktree, bool AssumeUnchanged)> ReadFileFlags(string root)
    {
        Dictionary<string, (bool, bool)> flags = new(StringComparer.Ordinal);
        CommandResult result = Run(root, "-c", "core.quotepath=false", "ls-files", "-v", "-z");
        if (result.ExitCode != 0)
        {
            return flags;
        }

        foreach (string entry in result.StdOut.Split('\0', StringSplitOptions.RemoveEmptyEntries))
        {
            if (entry.Length < 3 || entry[1] != ' ')
            {
                continue;
            }

            char tag = entry[0];
            bool assume = char.IsLower(tag);
            bool skip = tag is 'S' or 's';
            if (assume || skip)
            {
                flags[entry[2..]] = (skip, assume);
            }
        }

        return flags;
    }

    /// <summary>
    ///  Stamps the bits onto the rows git did report, and returns the flagged
    ///  paths it left out of <c>status</c> entirely (a skip-worktree or
    ///  assume-unchanged file with no staged change). Those are what GE lists
    ///  when "Show skip-worktree files" / "Show assumed-unchanged files" is
    ///  on, with git's own letter as the status.
    /// </summary>
    internal StatusFileDto[] ApplyFileFlags(string root, List<StatusFileDto> unstaged, List<StatusFileDto> staged)
    {
        Dictionary<string, (bool SkipWorktree, bool AssumeUnchanged)> flags = ReadFileFlags(root);
        if (flags.Count == 0)
        {
            return [];
        }

        HashSet<string> listed = new(StringComparer.Ordinal);
        foreach (List<StatusFileDto> list in new[] { unstaged, staged })
        {
            for (int i = 0; i < list.Count; i++)
            {
                listed.Add(list[i].Path);
                if (flags.TryGetValue(list[i].Path, out (bool SkipWorktree, bool AssumeUnchanged) bits))
                {
                    list[i] = list[i] with { SkipWorktree = bits.SkipWorktree, AssumeUnchanged = bits.AssumeUnchanged };
                }
            }
        }

        List<StatusFileDto> hidden = [];
        foreach ((string path, (bool skip, bool assume)) in flags)
        {
            if (listed.Contains(path))
            {
                continue;
            }

            hidden.Add(new StatusFileDto(path, FlagLetter(skip, assume), Staged: false, SkipWorktree: skip, AssumeUnchanged: assume));
        }

        hidden.Sort((a, b) => string.Compare(a.Path, b.Path, StringComparison.OrdinalIgnoreCase));
        return [.. hidden];
    }

    /// <summary>
    ///  `GET /files/hidden`: every tracked path carrying either bit, one
    ///  `ls-files` and no status. The commit dialog's list fetches this when
    ///  "Show skip-worktree files" / "Show assumed-unchanged files" is on and
    ///  drops the paths it already shows.
    /// </summary>
    public StatusFileDto[] ListHiddenFiles()
    {
        string root = RequireRoot();
        List<StatusFileDto> hidden = [];
        foreach ((string path, (bool skip, bool assume)) in ReadFileFlags(root))
        {
            hidden.Add(new StatusFileDto(path, FlagLetter(skip, assume), Staged: false, SkipWorktree: skip, AssumeUnchanged: assume));
        }

        hidden.Sort((a, b) => string.Compare(a.Path, b.Path, StringComparison.OrdinalIgnoreCase));
        return [.. hidden];
    }

    private static string FlagLetter(bool skip, bool assume) => skip && assume ? "s" : skip ? "S" : "h";

    private static List<string> CleanPaths(string root, IReadOnlyList<string> paths)
    {
        List<string> clean = [];
        foreach (string path in paths)
        {
            if (string.IsNullOrWhiteSpace(path))
            {
                continue;
            }

            ResolveInRoot(root, path);
            clean.Add(path);
        }

        return clean;
    }

    /// <summary>
    ///  Bumps the change stream the way the watcher does (see
    ///  <c>GitHost.Watch.cs</c>), for a write the watcher cannot see:
    ///  <c>.git/info/exclude</c> sits one level below the watched git dir.
    ///  Without it the excluded file would linger in the Unstaged list until
    ///  the next poll.
    /// </summary>
    private void NotifyStatusChanged()
    {
        lock (_changeLock)
        {
            _changeSequence++;
            _changeVersion = (_changeSequence << 2) | (long)GitChangeKind.Status;
        }
    }
}
