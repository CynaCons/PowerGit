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
new probe to the engine means adding a line there.** Spellings matter: pull
and push ask with `@{u}`, the status reads with `@{upstream}`; the regex
covers both since v0.16.0 (a first push popped a card for the question).

## The caller's verdict: `Ok` on the entry (v0.16.0)

Owner: "one of the files is new, I see 'git failed - exit 1' with a diff of
the new file." `git diff --no-index` exits 1 whenever the sides differ,
which every new file with content does; `GetUntrackedDiff` tolerated it, the
log entry did not. `GitLogEntryDto.Ok` is the caller's verdict, default
`ExitCode == 0`; the overload `RunTimed(root, timeout, okWhen, args)` in
`GitHost.CommandLog.cs` passes a predicate through `RunLogged` to
`RecordCommand`. A negative exit (timeout, cancel) is never ok, whatever the
predicate. Frontend: `isOk(e) = e.ok ?? e.exitCode === 0`, so a pre-v0.16
engine still reads as before; `failed` and `notableFailure` build on it.
A probe (above) is still recorded `Ok = false` with its exit 1 — it *is* a
"no"; the verdict is for commands whose non-zero exit is the wanted answer.

## The panel folds the engine's reads (v0.16.0)

Owner: "there's always tons of stuff in that window, I can't even see my
push when I push. Hard to understand where my stuff is." `entryKind` in
`gitLogModel.ts` says `action` (push, pull, fetch, commit, merge, rebase,
stash push/pop, checkout, branch/tag create/delete, remote add/set-url,
config set, add/rm/restore/apply …) or `background` (status, log,
rev-parse, ls-files, diff, show, for-each-ref, cat-file, config --get,
remote -v, stash list, branch --list, …). **The reads are the closed list;
anything unknown is shown**, because hiding what the user did is the whole
complaint. `groupEntries` folds each run of reads between two actions into
one "N background commands" row that opens on click; the list is **newest
first** (the pin and the last action sit at the top, no scroll-follow), and
the dock line names the newest action rather than the `git status` the
refresh ran after it. "Show all" (`showAll` in `pg.console`) flattens; a
typed filter also flattens, so a hit is never hidden inside a fold. A failed
action is pinned at the top (`git-console-pinned`) until its X is clicked;
the dismissal is per repository and in memory only (ids restart with the
engine's buffer). Rows live in `GitConsoleRows.tsx` (the 400-line lint cap).

## Surfaces

`GitConsole.tsx` is the dock line (about 22 px, at the bottom, below the
status bar) and the panel it opens; `Ctrl` + `` ` `` is `browse.gitConsole`
in the hotkey catalog, the first entry with a null `ge` field since Git
Extensions has no equivalent. `GitFailureCard.tsx` is the corner card, shown
only for a notable failure, dismissing itself after a few seconds unless
pinned. Panel height persists in `pg.console` (96–480); there is no drag
handle yet.
