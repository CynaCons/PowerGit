# Live-refresh (GET /events) change classification and testing it

## Encoding: `GitChangeKind` is packed into `ChangeVersion`, not a new field
`GitHost.Watch.cs` classifies every watched filesystem change into
`GitChangeKind.Status` (`.git/index`) or `GitChangeKind.Refs` (`HEAD`,
`packed-refs`, anything under `refs/`, including `refs/stash`). Rather than
adding a `kind` field to the `/events` SSE payload (which is built in
`Program.cs`), the kind is packed into the low 2 bits of `ChangeVersion`
itself (`(sequence << 2) | (long)kind`, decoded with
`GitHost.ChangeKindOf`/`engine.ts` `changeKindOf`). This was a deliberate
choice to avoid touching `Program.cs` while it was owned by a concurrent
worker — the wire shape (`data: <int>\n\n`) never changed. If `Program.cs`
becomes free to edit, consider promoting this to an explicit JSON payload
(`{version, kind}`) instead; the bit-packing works but is not self-describing
to anyone reading the SSE stream by hand.

Correctness note: overwriting (not accumulating) the kind on every bump is
safe because git always writes ref/HEAD updates *last* for crash safety — a
"Refs" classification from later in a burst is never shadowed by an earlier
"Status" one from the same git command.

## App.tsx's 2s self-action guard has no DOM-observable proxy
`App.tsx`'s live-refresh `useEffect` ignores any `/events` message that
arrives within 2000ms of `lastRefreshAt.current` (set at both the start and
end of every `refresh()` call, including the boot-time one) so an echo of
the app's own action never double-refreshes. When writing an e2e test that
makes a *real* external change (e.g. `git commit` in a fixture repo) and
expects the SSE-driven refresh to fire, you must wait out this window first
— there is nothing in the DOM to poll for "the guard has expired", so a
deliberate `page.waitForTimeout(3500)` (generous margin over 2000ms, since
the FileSystemWatcher + engine's 500ms SSE poll + 400ms debounce all stack
on top) is the only option. Do this after *every* refresh in the test
(including the boot-time one and any earlier SSE-triggered refresh in the
same test), not just once at the start.

## FileSystemWatcher.Dispose() doesn't always release its Windows handle instantly
An e2e test that opens a disposable fixture repo via `POST /repos/open`,
then switches the engine back to the real repo in `afterAll`, and then
`rmSync`'s the fixture directory can hit `EBUSY: resource busy or locked` —
the old `FileSystemWatcher` (torn down by `GitHost.Open()` rebuilding the
watcher for the new repo) doesn't always release its `ReadDirectoryChangesW`
handle in the same tick. Retry the `rmSync` a few times with backoff instead
of failing the test over fixture cleanup (see
`frontend/tests/e2e/live-refresh-scope.spec.ts`).

## Testing tip: never point the shared dev engine at a fixture repo without restoring it
The dev engine (`http://127.0.0.1:7733`) holds one `_current` repo for the
whole process and is shared across concurrent workers/specs. Any e2e test
that calls `POST /repos/open` on a different (fixture) path must restore the
real repo in `afterAll`/`finally` before finishing, or every later spec in
the same Playwright run (and any concurrent worker hitting the same engine)
will see the wrong — or a since-deleted — repo.
