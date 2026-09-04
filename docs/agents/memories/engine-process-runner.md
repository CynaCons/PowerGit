# Engine process runner (v0.13.10 / v0.13.11)

## Why it exists
`GitHost.RunTimed` used to `ReadToEnd()` stdout, then stderr, then
`WaitForExit(timeout)`. Three failure modes, all seen or reproducible:
1. git fills the stderr pipe (64 KB on Linux) while we are still blocked on
   stdout → both sides wait forever (deadlock; the per-session write gate
   then blocks every mutation on that repo).
2. The timeout only started after the reads, so a git that never writes
   and never exits hung the request thread indefinitely.
3. A 500 MB blob was read into one string and handed to WebKit.

## Contract (`GitProcess.cs`, internal, InternalsVisibleTo tests)
`GitProcess.Run(file, args, cwd, timeoutMs, ct, maxStdOutChars, env)`:
- both pipes are drained concurrently (16 KB chunks), stderr capped at 1 MB;
- `timeoutMs` and `ct` are armed BEFORE any read; either kills the whole
  process tree (`Kill(entireProcessTree: true)`); readers always drain to
  EOF afterwards; the process is always disposed;
- past `maxStdOutChars` the child is killed and the result comes back with
  `StdOutTruncated = true` and `ExitCode = 0` (the caller asked for a prefix);
- timeout → `TimeoutException`; caller cancellation → `OperationCanceledException`.
`GitHost.RunTimed(cwd, timeout, ct, args)` and `RunCapped(...)` wrap it and
set `GIT_OPTIONAL_LOCKS=0` + `GIT_TERMINAL_PROMPT=0`.

## Who passes what
- Read routes (`/revisions`, `/commits/{id}`, `/files`, `/tree`, `/diff`,
  `/blob`, `/diff/worktree`) pass `HttpContext.RequestAborted`; a cancelled
  request answers 499 and the git child is gone. The UI aborts superseded
  requests (`AbortController` per selection in BottomPanel/CommitDialog/
  CommitFileTree/useHistory) — latest selection wins end-to-end.
- Jobs (`/fetch|/pull|/push`) get the job's `CancellationTokenSource`;
  `POST /jobs/{id}/cancel` cancels it.
- Bounds: `GitHost.MaxBlobBytes` (2 MB, probed with `git cat-file -s`
  first), `MaxDiffChars` (1 M), `MaxLines` (50 k). `DiffDto` carries
  `sizeBytes`, `truncated`, `truncatedReason` ("size" | "lines"); no text
  sentinel is appended any more.

## Tests
`GitProcessTests` use PowerShell (Windows) / `sh` (elsewhere) as the child:
a 4 MB stderr flood, a child that never exits (timeout + cancel), a stdout
cap. `LifecycleTests` cover the Location header, cancel, idle eviction,
watcher disposal and the truncated-blob DTO.

## Landmines
- `dotnet` on this machine lives in `%LOCALAPPDATA%\Microsoft\dotnet`
  (user-level SDK 10.0.400); `C:\Program Files\dotnet` has runtimes only.
  Prefix PATH / set DOTNET_ROOT or the SDK "is not found".
- `QueryTests.ListRevisions_pages_consistently` runs against this checkout;
  it flakes while another worktree/agent is committing (refs move between
  the two `git log` calls). Re-run when the tree is quiet.
