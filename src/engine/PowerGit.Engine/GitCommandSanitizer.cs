using System.Text;
using System.Text.RegularExpressions;

namespace PowerGit.Engine;

/// <summary>
///  Strips credentials out of anything the git command log shows (v0.15.1).
///  A remote URL is the only place a secret realistically reaches the engine
///  — <c>https://x-access-token:ghp_…@github.com/o/r.git</c> on a push or a
///  fetch — and git echoes that same URL back in its progress and error
///  lines, so the command line <em>and</em> the recorded output both go
///  through here. There was no reusable filter to inherit: the job command
///  strings in Program.cs are hand-built from a remote <em>name</em>
///  ("git fetch --prune origin"), so they never had a URL to strip.
/// </summary>
internal static partial class GitCommandSanitizer
{
    /// <summary>What replaces a secret. Short, obvious, and not a valid token.</summary>
    internal const string Mask = "***";

    /// <summary>
    ///  Userinfo in a URL: <c>scheme://user[:secret]@host</c>. The host and
    ///  path are deliberately kept — "which remote failed" is the whole point
    ///  of the console line.
    /// </summary>
    [GeneratedRegex(@"(?<scheme>[a-zA-Z][a-zA-Z0-9+.\-]*)://(?<user>[^\s/?#@:]+)(?::(?<secret>[^\s/?#@]*))?@")]
    private static partial Regex UrlCredential();

    private static string MaskCredential(Match m)
    {
        string scheme = m.Groups["scheme"].Value;
        if (m.Groups["secret"].Success)
        {
            // user:password / x-access-token:ghp_… — the half after the colon
            // is always the secret, whatever the half before it is called.
            return $"{scheme}://{m.Groups["user"].Value}:{Mask}@";
        }

        // `ssh://git@host` and `git://host` carry no secret and stay readable.
        // A bare userinfo on an http(s) URL is how a token is passed when
        // there is no username, so that one is masked whole.
        bool web = scheme.Equals("http", StringComparison.OrdinalIgnoreCase)
            || scheme.Equals("https", StringComparison.OrdinalIgnoreCase);
        return web ? $"{scheme}://{Mask}@" : m.Value;
    }

    /// <summary>Masks credentials in free text (git's stdout/stderr).</summary>
    internal static string Text(string? text)
        => string.IsNullOrEmpty(text) ? string.Empty : UrlCredential().Replace(text, MaskCredential);

    /// <summary>
    ///  Masks one argument: URL credentials, plus the value of a
    ///  <c>http.extraHeader=Authorization: …</c> config override, which is
    ///  the other way a bearer token can be handed to git.
    /// </summary>
    internal static string Argument(string arg)
    {
        string masked = Text(arg);
        int eq = masked.IndexOf('=');
        if (eq > 0 && masked.AsSpan(0, eq).Trim().Equals("http.extraheader", StringComparison.OrdinalIgnoreCase))
        {
            masked = string.Concat(masked.AsSpan(0, eq + 1), Mask);
        }

        return masked;
    }

    /// <summary>The sanitized command line the console shows, e.g. <c>git fetch --prune origin</c>.</summary>
    internal static string CommandLine(IReadOnlyList<string> args)
    {
        StringBuilder sb = new("git");
        foreach (string arg in args)
        {
            sb.Append(' ').Append(Quote(Argument(arg)));
        }

        return sb.ToString();
    }

    /// <summary>Shell-ish quoting so a commit message reads as one argument.</summary>
    private static string Quote(string arg)
    {
        if (arg.Length == 0)
        {
            return "\"\"";
        }

        if (!arg.Any(char.IsWhiteSpace) && !arg.Contains('"'))
        {
            return arg;
        }

        return $"\"{arg.Replace("\"", "\\\"")}\"";
    }
}
