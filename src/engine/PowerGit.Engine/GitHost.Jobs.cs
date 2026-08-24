using System.Collections.Concurrent;

namespace PowerGit.Engine;

public sealed record GitJobDto(string Id, string Kind, string Status, string? Output, string? Error);

public sealed partial class GitHost
{
    private sealed record JobEntry(GitJobDto Dto, TaskCompletionSource<GitJobDto> Done);

    private readonly ConcurrentDictionary<string, JobEntry> _jobs = new();

    /// <summary>
    /// Runs a long git operation detached. Returns the job id immediately;
    /// clients poll GET /jobs/{id}. Only one network operation may run at a
    /// time so two overlapping pushes cannot corrupt repo assumptions.
    /// </summary>
    public string StartJob(string kind, Func<string> work)
    {
        if (_jobs.Values.Any(j => j.Dto.Status == "running"))
        {
            throw new InvalidOperationException("Another git operation is already in progress.");
        }

        string id = Guid.NewGuid().ToString("N")[..12];
        JobEntry entry = new(new GitJobDto(id, kind, "running", null, null), new TaskCompletionSource<GitJobDto>(TaskCreationOptions.RunContinuationsAsynchronously));
        _jobs[id] = entry;

        _ = Task.Run(() =>
        {
            GitJobDto done;
            try
            {
                string output = work();
                done = entry.Dto with { Status = "completed", Output = output };
            }
            catch (Exception ex)
            {
                done = entry.Dto with { Status = "failed", Error = ex.Message };
            }

            _jobs[id] = entry with { Dto = done };
            entry.Done.TrySetResult(done);
            PruneJobs();
        });

        return id;
    }

    public GitJobDto? GetJob(string id) => _jobs.TryGetValue(id, out JobEntry? entry) ? entry.Dto : null;

    public IReadOnlyList<GitJobDto> ListJobs() =>
        [.. _jobs.Values.Select(j => j.Dto).OrderByDescending(j => j.Id)];

    private void PruneJobs()
    {
        List<string> finished = [.. _jobs.Where(kv => kv.Value.Dto.Status != "running").Select(kv => kv.Key)];
        while (finished.Count > 50 && _jobs.TryRemove(finished[0], out _))
        {
            finished.RemoveAt(0);
        }
    }
}
