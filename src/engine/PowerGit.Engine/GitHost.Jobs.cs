using System.Collections.Concurrent;

namespace PowerGit.Engine;

/// <summary>
/// A network job. v0.13.12 added the timing, the sanitized command context
/// and the cancel flag so the UI can show an inspectable operation instead
/// of an anonymous progress line.
/// </summary>
public sealed record GitJobDto(
    string Id,
    string Kind,
    string Status,
    string? Output,
    string? Error,
    string? Command = null,
    string? StartedAt = null,
    string? FinishedAt = null,
    bool Cancelled = false);

public sealed partial class GitHost
{
    private sealed record JobEntry(GitJobDto Dto, TaskCompletionSource<GitJobDto> Done, CancellationTokenSource Cancel);

    private readonly ConcurrentDictionary<string, JobEntry> _jobs = new();

    /// <summary>
    /// Runs a long git operation detached. Returns the job id immediately;
    /// clients poll GET /jobs/{id}. Only one network operation may run at a
    /// time so two overlapping pushes cannot corrupt repo assumptions.
    /// </summary>
    public string StartJob(string kind, Func<CancellationToken, string> work, string? command = null)
    {
        // v0.13.6: a job holds the session write gate until it finishes, so a
        // checkout during a fetch (or a second fetch) fails fast with 409.
        if (!_writeGate.Wait(0))
        {
            throw new RepoBusyException(_writeHolder ?? "another operation");
        }

        string id = Guid.NewGuid().ToString("N")[..12];
        _writeHolder = $"{kind} (job {id})";
        CancellationTokenSource cts = new();
        JobEntry entry = new(
            new GitJobDto(id, kind, "running", null, null, command, DateTime.UtcNow.ToString("O"), null),
            new TaskCompletionSource<GitJobDto>(TaskCreationOptions.RunContinuationsAsynchronously),
            cts);
        _jobs[id] = entry;

        _ = Task.Run(() =>
        {
            GitJobDto done;
            try
            {
                string output = work(cts.Token);
                done = entry.Dto with { Status = "completed", Output = output, FinishedAt = DateTime.UtcNow.ToString("O") };
            }
            catch (OperationCanceledException) when (cts.IsCancellationRequested)
            {
                done = entry.Dto with { Status = "failed", Error = $"{kind} was cancelled", Cancelled = true, FinishedAt = DateTime.UtcNow.ToString("O") };
            }
            catch (Exception ex) when (cts.IsCancellationRequested)
            {
                // git reports the kill as a plain failure; the cancel flag is what the UI keys on.
                done = entry.Dto with { Status = "failed", Error = $"{kind} was cancelled ({ex.Message})", Cancelled = true, FinishedAt = DateTime.UtcNow.ToString("O") };
            }
            catch (Exception ex)
            {
                done = entry.Dto with { Status = "failed", Error = ex.Message, FinishedAt = DateTime.UtcNow.ToString("O") };
            }

            _jobs[id] = entry with { Dto = done };
            _writeHolder = null;
            _writeGate.Release();
            entry.Done.TrySetResult(done);
            cts.Dispose();
            PruneJobs();
        });

        return id;
    }

    /// <summary>Back-compat overload for callers that cannot observe cancellation.</summary>
    public string StartJob(string kind, Func<string> work) => StartJob(kind, _ => work(), null);

    public GitJobDto? GetJob(string id) => _jobs.TryGetValue(id, out JobEntry? entry) ? entry.Dto : null;

    /// <summary>Requests cancellation of a running job; false when unknown or already finished.</summary>
    public bool CancelJob(string id)
    {
        if (!_jobs.TryGetValue(id, out JobEntry? entry) || entry.Dto.Status != "running")
        {
            return false;
        }

        try
        {
            entry.Cancel.Cancel();
        }
        catch (ObjectDisposedException)
        {
            return false; // finished between the check and the cancel
        }

        return true;
    }

    public bool HasRunningJob => _jobs.Values.Any(j => j.Dto.Status == "running");

    private void CancelAllJobs()
    {
        foreach (JobEntry entry in _jobs.Values.Where(j => j.Dto.Status == "running"))
        {
            try { entry.Cancel.Cancel(); } catch (ObjectDisposedException) { /* finished */ }
        }
    }

    public IReadOnlyList<GitJobDto> ListJobs() =>
        [.. _jobs.Values.Select(j => j.Dto).OrderByDescending(j => j.StartedAt)];

    private void PruneJobs()
    {
        List<string> finished = [.. _jobs.Where(kv => kv.Value.Dto.Status != "running").OrderBy(kv => kv.Value.Dto.StartedAt).Select(kv => kv.Key)];
        while (finished.Count > 50 && _jobs.TryRemove(finished[0], out _))
        {
            finished.RemoveAt(0);
        }
    }
}
