namespace PowerGit.Engine;

/// <summary>
/// Finds the diff/merge tools and editors a user is likely to have
/// (v0.15.0, owner: an enhanced settings menu). Git already knows how to
/// drive most of these by name — setting <c>diff.tool=meld</c> is enough,
/// and only the path may need saying — so the locator's job is to report
/// what exists, not to invent command lines. VS Code is the exception git
/// has no built-in entry for; its commands live in <see cref="VsCodeLocator"/>.
/// </summary>
public static class ToolLocator
{
    /// <summary>A tool git knows by name, and where to look for it.</summary>
    private sealed record Candidate(string Name, string Label, ToolKinds Kinds, string[] Executables, string[] Directories);

    [Flags]
    private enum ToolKinds
    {
        Diff = 1,
        Merge = 2,
        Editor = 4,
    }

    private static string Exe(string name) => OperatingSystem.IsWindows() ? name + ".exe" : name;

    private static string[] ProgramDirs(params string[] relative)
    {
        if (!OperatingSystem.IsWindows())
        {
            return [];
        }

        string[] roots =
        [
            Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles),
            Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86),
        ];
        return [.. roots.Where(r => !string.IsNullOrEmpty(r)).SelectMany(r => relative.Select(rel => Path.Combine(r, rel)))];
    }

    private static Candidate[] Candidates() =>
    [
        new("meld", "Meld", ToolKinds.Diff | ToolKinds.Merge, [Exe("meld")], ProgramDirs("Meld")),
        new("kdiff3", "KDiff3", ToolKinds.Diff | ToolKinds.Merge, [Exe("kdiff3")], ProgramDirs("KDiff3")),
        new("bc", "Beyond Compare", ToolKinds.Diff | ToolKinds.Merge, [Exe("BCompare"), Exe("bcompare")], ProgramDirs("Beyond Compare 5", "Beyond Compare 4")),
        new("p4merge", "P4Merge", ToolKinds.Diff | ToolKinds.Merge, [Exe("p4merge")], ProgramDirs(Path.Combine("Perforce", "p4merge"))),
        new("winmerge", "WinMerge", ToolKinds.Diff, [Exe("WinMergeU")], ProgramDirs("WinMerge")),
        new("vimdiff", "Vim", ToolKinds.Diff | ToolKinds.Merge | ToolKinds.Editor, [Exe("vim")], []),
        new("nano", "Nano", ToolKinds.Editor, [Exe("nano")], []),
        new("notepad++", "Notepad++", ToolKinds.Editor, [Exe("notepad++")], ProgramDirs("Notepad++")),
    ];

    /// <summary>Everything found on this machine, plus VS Code.</summary>
    public static ToolInfoDto[] Detect()
    {
        List<ToolInfoDto> found = [];

        VsCodeInfo code = VsCodeLocator.Detect();
        found.Add(new ToolInfoDto("vscode", "VS Code", code.Path, code.Found, ["diff", "merge", "editor"]));

        foreach (Candidate c in Candidates())
        {
            string? path = Locate(c);
            found.Add(new ToolInfoDto(c.Name, c.Label, path, path is not null, KindNames(c.Kinds)));
        }

        return [.. found];
    }

    private static string[] KindNames(ToolKinds kinds)
    {
        List<string> names = [];
        if (kinds.HasFlag(ToolKinds.Diff))
        {
            names.Add("diff");
        }

        if (kinds.HasFlag(ToolKinds.Merge))
        {
            names.Add("merge");
        }

        if (kinds.HasFlag(ToolKinds.Editor))
        {
            names.Add("editor");
        }

        return [.. names];
    }

    private static string? Locate(Candidate candidate)
    {
        foreach (string exe in candidate.Executables)
        {
            string? onPath = FindOnPath(exe);
            if (onPath is not null)
            {
                return onPath;
            }
        }

        foreach (string dir in candidate.Directories)
        {
            foreach (string exe in candidate.Executables)
            {
                string full = Path.Combine(dir, exe);
                if (File.Exists(full))
                {
                    return full;
                }
            }
        }

        return null;
    }

    internal static string? FindOnPath(string fileName)
    {
        string[] paths = (Environment.GetEnvironmentVariable("PATH") ?? string.Empty)
            .Split(Path.PathSeparator, StringSplitOptions.RemoveEmptyEntries);
        foreach (string dir in paths)
        {
            try
            {
                string candidate = Path.Combine(dir.Trim('"'), fileName);
                if (File.Exists(candidate))
                {
                    return candidate;
                }
            }
            catch (ArgumentException)
            {
                // A malformed PATH entry is not worth failing detection over.
            }
        }

        return null;
    }
}
