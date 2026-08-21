namespace PowerGit.Engine;

public static class VsCodeLocator
{
    public static VsCodeInfo Detect()
    {
        string exe = OperatingSystem.IsWindows() ? "Code.exe" : "code";
        List<string> candidates = [];

        string local = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
        candidates.Add(Path.Combine(local, "Programs", "Microsoft VS Code", exe));
        candidates.Add(Path.Combine(local, "Programs", "Microsoft VS Code Insiders", OperatingSystem.IsWindows() ? "Code - Insiders.exe" : "code-insiders"));

        string? pathHit = FindOnPath(exe) ?? FindOnPath(OperatingSystem.IsWindows() ? "code.cmd" : "code");
        if (pathHit is not null)
        {
            candidates.Insert(0, pathHit);
        }

        foreach (string candidate in candidates)
        {
            if (File.Exists(candidate))
            {
                return new VsCodeInfo(true, candidate, Applied: false);
            }
        }

        return new VsCodeInfo(false, null, Applied: false);
    }

    public static string EditorCommand(string vsCodePath)
        => $"\"{vsCodePath}\" --new-window --wait";

    public static string DiffCommand => "--new-window --wait --diff \"$LOCAL\" \"$REMOTE\"";

    public static string MergeCommand => "--new-window --wait --merge \"$REMOTE\" \"$LOCAL\" \"$BASE\" \"$MERGED\"";

    private static string? FindOnPath(string fileName)
    {
        string[] paths = (Environment.GetEnvironmentVariable("PATH") ?? string.Empty)
            .Split(Path.PathSeparator, StringSplitOptions.RemoveEmptyEntries);
        foreach (string dir in paths)
        {
            string candidate = Path.Combine(dir.Trim('"'), fileName);
            if (File.Exists(candidate))
            {
                return candidate;
            }
        }

        return null;
    }
}
