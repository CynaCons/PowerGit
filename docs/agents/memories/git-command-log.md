# The git command log and its console (v0.15.0)

Owner (2026-09-08): "when we perform git operations, I'd like a small popup
or something to show the raw text coming from the git command. Git
Extensions has a popup for that, but it's too intrusive." Four prototypes
were reviewed; the owner chose the docked console plus a card on failures.

## Where the recording happens

`GitHost.RunLogged` in `GitHost.cs` wraps `GitProcess.Run`, and `Run`, every
`RunTimed` overload, `RunCapped` and `RunTimedWithEnv` go through it. **Every
git child the engine starts is recorded, reads included.** A timeout or
cancellation is recorded as exit code `-1` with the exception message and
then rethrown unchanged. The four children the engine starts detached
(difftool twice, mergetool, archive) call `RecordDetached`, which logs the
launch and says the exit code is not observed rather than inventing a zero.

The buffer is in `GitHost.CommandLog.cs`: a lock-guarded queue of 50, ids
monotonic per session, 8 KB per entry.

**Order matters in `RecordCommand`: cut first, sanitize second.** Running the
credential regexes over a full `git log` or `git diff` (hundreds of
kilobytes) before truncating cost every read a measurable slice of its
latency and pushed `diff-latency.spec.ts` past its budget. Cutting first is
safe: a secret past the cut is not stored.

## Sanitizing

`GitCommandSanitizer.cs`, applied to the command line **and** the output,
because git echoes the remote URL back in its own error lines:

- `scheme://user:secret@` becomes `scheme://user:***@`
- bare userinfo on http/https becomes `scheme://***@` (how a token is passed
  with no username)
- ssh and git schemes are left readable: `ssh://git@host` carries no secret
  and masking it would hide which remote was used
- `http.extraHeader=` loses its value

## Not on the change stream, deliberately

Bumping `ChangeVersion` per entry would be a feedback loop, not a cheap win:
`useRepoState`'s `/events` handler runs a full refresh on any version it does
not recognise, a refresh runs git commands, and those would record entries
and bump again. `useGitLog` polls a delta instead: 2 s while the panel is
open, 10 s while closed (the dock line still has to be current), nothing
while the window is hidden.

## Probes are not failures

Several git commands answer "no" with a non-zero exit, and the engine leans
on them on every refresh: `rev-parse --verify refs/stash`, `@{upstream}`,
`rev-list --left-right`, `ls-files --error-unmatch`. A failure card on each
would be a permanent nag, so `notableFailure` in `gitLogModel.ts` excludes
them, and excludes `-1` (a read the UI itself abandoned). They still appear
in the console; they just raise nothing. **That list is a heuristic: adding a
new probe to the engine means adding a line there.**

## Surfaces

`GitConsole.tsx` is the dock line (about 22 px, at the bottom, below the
status bar) and the panel it opens; `Ctrl` + `` ` `` is `browse.gitConsole`
in the hotkey catalog, the first entry with a null `ge` field since Git
Extensions has no equivalent. `GitFailureCard.tsx` is the corner card, shown
only for a notable failure, dismissing itself after a few seconds unless
pinned. Panel height persists in `pg.console` (96–480); there is no drag
handle yet.
