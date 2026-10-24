using System.Text.Json;

namespace PowerGit.Engine;

/// <summary>
///  Which tags each remote has (v0.21.16, owner: "we don't have the ability
///  to differentiate between a remote tag and a local tag ... And if the tag
///  is local, then I don't have the ability to push it to remote"). git keeps
///  no remote-tracking tags, so after every fetch PowerGit asks the remote
///  (<c>ls-remote --tags --refs</c>) and keeps the answer in the git dir,
///  beside git's own files, as <see cref="RemoteTagsFile"/>: remote → tag →
///  the object id the remote has. A pushed tag refreshes its remote's entry.
///  The ref tree marks a tag with every remote that has the same object; a
///  remote never asked is left out of <see cref="RefTreeDto.RemoteTagsKnown"/>,
///  so "not on origin" is only said once origin has answered.
/// </summary>
public sealed partial class GitHost
{
    /// <summary>The record's file name in the git dir; the watcher ignores it (no refresh echo).</summary>
    public const string RemoteTagsFile = "powergit-remote-tags.json";
    private static readonly JsonSerializerOptions RemoteTagsJson = new() { WriteIndented = true };
    private readonly object _remoteTagsLock = new();

    /// <summary>remote → tag → object id; empty when nothing was recorded or the file is unreadable.</summary>
    internal Dictionary<string, Dictionary<string, string>> ReadRemoteTags(string root)
    {
        string file = Path.Combine(GitDir(root), RemoteTagsFile);
        lock (_remoteTagsLock)
        {
            try
            {
                if (!File.Exists(file)) return new(StringComparer.Ordinal);
                Dictionary<string, Dictionary<string, string>>? all =
                    JsonSerializer.Deserialize<Dictionary<string, Dictionary<string, string>>>(File.ReadAllText(file), RemoteTagsJson);
                return all is null
                    ? new(StringComparer.Ordinal)
                    : new(all.ToDictionary(kv => kv.Key, kv => new Dictionary<string, string>(kv.Value, StringComparer.Ordinal)), StringComparer.Ordinal);
            }
            catch (Exception ex) when (ex is IOException or JsonException or UnauthorizedAccessException)
            {
                return new(StringComparer.Ordinal);
            }
        }
    }

    private void UpdateRemoteTags(string root, string remote, Dictionary<string, string>? tags)
    {
        string file = Path.Combine(GitDir(root), RemoteTagsFile);
        lock (_remoteTagsLock)
        {
            Dictionary<string, Dictionary<string, string>> all = ReadRemoteTags(root);
            if (tags is null) all.Remove(remote);
            else all[remote] = tags;
            File.WriteAllText(file, JsonSerializer.Serialize(all, RemoteTagsJson));
        }
    }

    /// <summary>
    ///  Asks <paramref name="remote"/> for its tags and records them. A remote
    ///  that cannot answer keeps what was recorded before: the fetch that
    ///  called this has already succeeded and must not fail on it.
    /// </summary>
    internal void RecordRemoteTags(string root, string remote, CancellationToken ct = default)
    {
        CommandResult result = RunTimed(root, 60_000, ct, "ls-remote", "--tags", "--refs", remote);
        if (result.ExitCode != 0) return;
        Dictionary<string, string> tags = new(StringComparer.Ordinal);
        foreach (string line in result.StdOut.Split('\n', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
        {
            string[] p = line.Split('\t');
            if (p.Length == 2 && p[1].StartsWith("refs/tags/", StringComparison.Ordinal))
            {
                tags[p[1]["refs/tags/".Length..]] = p[0];
            }
        }

        try
        {
            UpdateRemoteTags(root, remote, tags);
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
        {
            // the record is a hint; an unwritable git dir only loses the marks
        }
    }

    /// <summary>A remote whose URL changed has other tags: forget what it had.</summary>
    private void ForgetRemoteTags(string root, string remote)
    {
        try
        {
            UpdateRemoteTags(root, remote, null);
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
        {
            // as above
        }
    }

    /// <summary>
    ///  <c>git push &lt;remote&gt; refs/tags/&lt;name&gt;</c>, then the remote's
    ///  tags are asked again so the tree marks the tag at once.
    /// </summary>
    public string PushTag(string name, string remote, CancellationToken ct = default)
    {
        string root = RequireRoot();
        if (string.IsNullOrWhiteSpace(name))
        {
            throw new InvalidOperationException("tag name is required");
        }

        if (string.IsNullOrWhiteSpace(remote))
        {
            throw new InvalidOperationException("remote is required");
        }

        if (Run(root, "rev-parse", "--verify", "--quiet", $"refs/tags/{name}").ExitCode != 0)
        {
            throw new InvalidOperationException($"There is no tag '{name}'.");
        }

        CommandResult result = RunTimed(root, 300_000, ct, "push", remote, $"refs/tags/{name}");
        if (result.ExitCode != 0)
        {
            string err = string.IsNullOrWhiteSpace(result.StdErr) ? result.StdOut.Trim() : result.StdErr.Trim();
            throw new InvalidOperationException(
                err.Contains("already exists", StringComparison.OrdinalIgnoreCase)
                    ? $"Push rejected: {remote} already has a different tag '{name}'. {err}"
                    : $"Push failed. {err}");
        }

        RecordRemoteTags(root, remote, ct);
        return string.IsNullOrWhiteSpace(result.StdErr) ? result.StdOut.Trim() : result.StdErr.Trim();
    }
}
