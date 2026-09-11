namespace PowerGit.Engine;

/// <summary>
///  One git invocation, as the Git console shows it (v0.15.1). <c>Id</c>
///  is monotonic per session so the UI can ask for "everything after 12"
///  instead of re-reading the whole buffer.
/// </summary>
/// <param name="Id">Monotonic, per session, starting at 1.</param>
/// <param name="At">UTC, round-trip ("O") format.</param>
/// <param name="Command">Sanitized command line, e.g. <c>git fetch --prune origin</c>.</param>
/// <param name="ExitCode">git's exit code; -1 when it timed out or was cancelled.</param>
/// <param name="Ok">
///  The caller's verdict (v0.16.0): did this invocation do what the engine
///  asked? Normally <c>ExitCode == 0</c>, but some commands answer with a
///  non-zero exit by design — <c>git diff --no-index</c> exits 1 whenever
///  the two sides differ, which is every new file with content — and the
///  console must not paint those red. A timeout or a cancellation is never ok.
/// </param>
/// <param name="DurationMs">Wall-clock milliseconds the child process took.</param>
/// <param name="Output">stdout then stderr, sanitized and capped at 8 KB.</param>
/// <param name="Truncated">True when <paramref name="Output"/> hit the cap.</param>
public sealed record GitLogEntryDto(
    long Id,
    string At,
    string Command,
    int ExitCode,
    bool Ok,
    long DurationMs,
    string Output,
    bool Truncated);

public sealed partial class GitHost
{
    /// <summary>How many invocations the rolling buffer keeps.</summary>
    public const int CommandLogCapacity = 50;

    /// <summary>Per-entry output cap; past this the entry carries a marker instead.</summary>
    internal const int CommandLogEntryChars = 8 * 1024;

    /// <summary>Appended to a capped entry so the console never lies about being complete.</summary>
    internal const string TruncationMarker = "\n… output truncated";

    /// <summary>What a detached difftool/mergetool launch shows instead of output.</summary>
    internal const string DetachedToolNote = "(started detached; the external tool owns its output)";

    private readonly Queue<GitLogEntryDto> _commandLog = new();
    private readonly object _commandLogLock = new();
    private long _commandLogSeq;

    /// <summary>
    ///  Like <see cref="RunTimed(string?, int, string[])"/>, but the caller
    ///  says which exit codes count as success for the console (v0.16.0).
    ///  Use it where git's own convention is "non-zero means no, not
    ///  failed": <c>diff --no-index</c> (1 = the sides differ). The
    ///  <see cref="CommandResult"/> comes back unchanged — the verdict only
    ///  colours the log entry; the caller still reads the exit code itself.
    /// </summary>
    internal CommandResult RunTimed(string? workingDirectory, int timeoutMs, Func<int, bool> okWhen, params string[] args)
    {
        GitProcess.Result r = RunLogged(args, workingDirectory, timeoutMs, CancellationToken.None, int.MaxValue, GitEnvironment, okWhen);
        return new CommandResult(r.ExitCode, r.StdOut, r.StdErr);
    }

    /// <summary>
    ///  Records one git invocation. Called from <see cref="RunTimed(string?, int, CancellationToken, string[])"/>
    ///  and its siblings — every git child in the engine funnels through
    ///  those, so reads are logged as well as mutations.
    ///  <paramref name="okWhen"/> is the caller's verdict on a real exit code
    ///  (default: zero); a negative code is the engine's "never finished"
    ///  and is never ok, whatever the caller would have accepted.
    /// </summary>
    internal void RecordCommand(
        IReadOnlyList<string> args,
        int exitCode,
        long durationMs,
        string? stdOut,
        string? stdErr,
        Func<int, bool>? okWhen = null)
    {
        bool ok = exitCode >= 0 && (okWhen?.Invoke(exitCode) ?? exitCode == 0);

        // Cut to what the console will keep BEFORE sanitizing. `git log` for
        // the graph and `git diff` on a large file produce hundreds of
        // kilobytes, and running the credential regexes over text that is
        // about to be discarded cost every read a measurable slice of its
        // latency (v0.15.0: it pushed click-to-diff past its budget).
        // Truncating first is safe: a secret past the cut is not stored.
        string combined = Combine(Cap(stdOut), Cap(stdErr));
        bool truncated = stdOut?.Length > CommandLogEntryChars || stdErr?.Length > CommandLogEntryChars
            || combined.Length > CommandLogEntryChars;
        string output = GitCommandSanitizer.Text(combined[..Math.Min(combined.Length, CommandLogEntryChars)]);
        if (truncated)
        {
            output += TruncationMarker;
        }

        lock (_commandLogLock)
        {
            _commandLog.Enqueue(new GitLogEntryDto(
                ++_commandLogSeq,
                DateTime.UtcNow.ToString("O"),
                GitCommandSanitizer.CommandLine(args),
                exitCode,
                ok,
                durationMs,
                output,
                truncated));
            while (_commandLog.Count > CommandLogCapacity)
            {
                _commandLog.Dequeue();
            }
        }
    }

    /// <summary>
    ///  Records a git child the engine starts detached (difftool, mergetool,
    ///  archive). Its exit code and output belong to the external tool or to
    ///  an HTTP stream, so the console shows the launch and says exactly that
    ///  instead of inventing a result.
    /// </summary>
    internal void RecordDetached(IReadOnlyList<string> args, string note)
        => RecordCommand(args, 0, 0, note, null);

    /// <summary>
    ///  The rolling buffer, oldest first. <paramref name="after"/> returns
    ///  only the entries newer than that id (what the console polls with).
    /// </summary>
    public IReadOnlyList<GitLogEntryDto> CommandLog(long? after = null)
    {
        lock (_commandLogLock)
        {
            return after is null
                ? [.. _commandLog]
                : [.. _commandLog.Where(e => e.Id > after.Value)];
        }
    }

    /// <summary>Enough of one stream to fill the entry on its own, no more.</summary>
    private static string? Cap(string? text)
        => text is not null && text.Length > CommandLogEntryChars ? text[..CommandLogEntryChars] : text;

    private static string Combine(string? stdOut, string? stdErr)
    {
        string a = (stdOut ?? string.Empty).TrimEnd('\r', '\n');
        string b = (stdErr ?? string.Empty).TrimEnd('\r', '\n');
        if (a.Length == 0)
        {
            return b;
        }

        return b.Length == 0 ? a : $"{a}\n{b}";
    }
}
