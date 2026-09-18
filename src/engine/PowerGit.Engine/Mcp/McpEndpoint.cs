using System.Text.RegularExpressions;

namespace PowerGit.Engine.Mcp;

public static partial class McpEndpoint
{
    public const string EnvironmentVariable = "POWERGIT_MCP_ENDPOINT";

    public static string Resolve()
    {
        string? overridden = Environment.GetEnvironmentVariable(EnvironmentVariable);
        if (!string.IsNullOrWhiteSpace(overridden)) return overridden;
        if (!OperatingSystem.IsWindows()) return Path.Combine(RecentsStore.DataDir, "mcp.sock");
        string user = InvalidUserCharacter().Replace(Environment.UserName.ToLowerInvariant(), "_");
        return $@"\\.\pipe\PowerGit.mcp.{user}";
    }

    internal static string PipeName(string endpoint) => endpoint.StartsWith(@"\\.\pipe\", StringComparison.OrdinalIgnoreCase)
        ? endpoint[9..] : endpoint;

    [GeneratedRegex("[^a-z0-9_-]")]
    private static partial Regex InvalidUserCharacter();
}
