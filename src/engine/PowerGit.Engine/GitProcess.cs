using System.Diagnostics;
using System.Text;

namespace PowerGit.Engine;

/// <summary>
/// v0.13.10: the one place a child process is run. Both pipes are drained
/// concurrently (the old sequential ReadToEnd deadlocked once git filled the
/// stderr pipe while we were still reading stdout), the timeout and the
/// caller's cancellation token start <em>before</em> either stream is awaited,
/// a timeout or cancellation kills the whole process tree, and the readers
/// are always drained and the process always disposed afterwards.
/// </summary>
internal static class GitProcess
{
    /// <summary>Hard cap for stderr: enough for any git error, never a memory hazard.</summary>
    private const int MaxStdErrChars = 1 << 20;

    internal sealed record Result(int ExitCode, string StdOut, string StdErr, bool StdOutTruncated);

    /// <summary>Thrown when <paramref name="maxStdOutChars"/> is exceeded and the caller asked to fail rather than truncate.</summary>
    internal sealed class OutputTooLargeException(long limit) : InvalidOperationException($"output exceeds {limit} characters")
    {
        public long Limit { get; } = limit;
    }

    internal static Result Run(
        string fileName,
        IReadOnlyList<string> args,
        string? workingDirectory,
        int timeoutMs,
        CancellationToken ct = default,
        int maxStdOutChars = int.MaxValue,
        IReadOnlyDictionary<string, string>? environment = null)
        => RunAsync(fileName, args, workingDirectory, timeoutMs, ct, maxStdOutChars, environment).GetAwaiter().GetResult();

    internal static async Task<Result> RunAsync(
        string fileName,
        IReadOnlyList<string> args,
        string? workingDirectory,
        int timeoutMs,
        CancellationToken ct,
        int maxStdOutChars,
        IReadOnlyDictionary<string, string>? environment)
    {
        ProcessStartInfo psi = new()
        {
            FileName = fileName,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            RedirectStandardInput = false,
            UseShellExecute = false,
            CreateNoWindow = true,
            StandardOutputEncoding = Encoding.UTF8,
            StandardErrorEncoding = Encoding.UTF8,
        };
        if (environment is not null)
        {
            foreach ((string key, string value) in environment)
            {
                psi.Environment[key] = value;
            }
        }

        foreach (string arg in args)
        {
            psi.ArgumentList.Add(arg);
        }

        if (!string.IsNullOrWhiteSpace(workingDirectory))
        {
            psi.WorkingDirectory = workingDirectory;
        }

        using Process process = Process.Start(psi) ?? throw new InvalidOperationException($"Failed to start {fileName}.");

        // Timeout + caller cancellation are armed before any read starts, so
        // a child that never writes AND never exits is still killed on time.
        using CancellationTokenSource timeout = new(timeoutMs);
        using CancellationTokenSource linked = CancellationTokenSource.CreateLinkedTokenSource(ct, timeout.Token);
        bool truncated = false;
        using CancellationTokenRegistration kill = linked.Token.Register(() => KillTree(process));

        Task<string> stdoutTask = ReadCappedAsync(process.StandardOutput, maxStdOutChars, () =>
        {
            // Past the cap the rest of the output is useless to the caller;
            // stop the producer instead of draining megabytes for nothing.
            truncated = true;
            KillTree(process);
        });
        Task<string> stderrTask = ReadCappedAsync(process.StandardError, MaxStdErrChars, null);

        try
        {
            await process.WaitForExitAsync(CancellationToken.None).ConfigureAwait(false);
        }
        finally
        {
            // Killed or not, the pipes close once the tree is gone, so both
            // readers complete; never leave a reader dangling on a live pipe.
            if (!process.HasExited)
            {
                KillTree(process);
            }
        }

        string stdout = await stdoutTask.ConfigureAwait(false);
        string stderr = await stderrTask.ConfigureAwait(false);

        if (truncated)
        {
            return new Result(0, stdout, stderr, StdOutTruncated: true);
        }

        if (ct.IsCancellationRequested)
        {
            throw new OperationCanceledException($"{Path.GetFileName(fileName)} {string.Join(' ', args)} was cancelled", ct);
        }

        if (timeout.IsCancellationRequested)
        {
            throw new TimeoutException($"{Path.GetFileName(fileName)} timed out after {timeoutMs} ms: {string.Join(' ', args)}");
        }

        return new Result(process.ExitCode, stdout, stderr, StdOutTruncated: false);
    }

    private static async Task<string> ReadCappedAsync(StreamReader reader, int maxChars, Action? onCap)
    {
        StringBuilder sb = new();
        char[] buffer = new char[16 * 1024];
        bool capped = false;
        while (true)
        {
            int n;
            try
            {
                n = await reader.ReadAsync(buffer, 0, buffer.Length).ConfigureAwait(false);
            }
            catch (IOException)
            {
                break; // pipe torn down by a kill
            }
            catch (ObjectDisposedException)
            {
                break;
            }

            if (n <= 0)
            {
                break;
            }

            if (capped)
            {
                continue; // keep draining so the child can exit
            }

            int room = maxChars - sb.Length;
            if (n >= room)
            {
                sb.Append(buffer, 0, Math.Max(0, room));
                capped = true;
                onCap?.Invoke();
                continue;
            }

            sb.Append(buffer, 0, n);
        }

        return sb.ToString();
    }

    private static void KillTree(Process process)
    {
        try
        {
            if (!process.HasExited)
            {
                process.Kill(entireProcessTree: true);
            }
        }
        catch
        {
            // Already gone, or not ours to kill any more.
        }
    }
}
