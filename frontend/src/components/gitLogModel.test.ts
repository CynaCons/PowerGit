import { expect, test } from "vitest"
import type { GitLogEntry } from "../engine"
import {
  GIT_LOG_CAPACITY,
  TRUNCATION_MARKER,
  copyAllText,
  entryKind,
  entryOutput,
  entryText,
  failed,
  filterEntries,
  firstLines,
  formatDuration,
  formatExit,
  groupEntries,
  isOk,
  isProbe,
  mergeEntries,
  newestAction,
  notableFailure,
  outputSummary,
  pinnedFailure,
  subcommand,
} from "./gitLogModel"

function entry(patch: Partial<GitLogEntry> = {}): GitLogEntry {
  return {
    id: 1,
    at: "2026-09-08T11:00:00.0000000Z",
    command: "git status --porcelain=v1",
    exitCode: 0,
    durationMs: 12,
    output: "",
    truncated: false,
    ...patch,
  }
}

test("a duration reads at a glance from milliseconds to minutes", () => {
  expect(formatDuration(0)).toBe("0 ms")
  expect(formatDuration(12.4)).toBe("12 ms")
  expect(formatDuration(999)).toBe("999 ms")
  expect(formatDuration(1000)).toBe("1.0 s")
  expect(formatDuration(2500)).toBe("2.5 s")
  expect(formatDuration(59_900)).toBe("59.9 s")
  expect(formatDuration(65_000)).toBe("1m 5s")
  expect(formatDuration(-1)).toBe("—")
})

test("exit code 0 is not a failure, anything else is", () => {
  expect(failed(entry({ exitCode: 0 }))).toBe(false)
  expect(failed(entry({ exitCode: 128 }))).toBe(true)
  expect(formatExit(entry({ exitCode: 128 }))).toBe("exit 128")
  // -1 is the engine's "timed out or cancelled": there was never an exit.
  expect(failed(entry({ exitCode: -1 }))).toBe(true)
  expect(formatExit(entry({ exitCode: -1 }))).toBe("no exit")
})

test("the engine's verdict wins over the exit code, and an old engine has none", () => {
  // Owner (2026-09-11): "one of the files is new, I see 'git failed - exit
  // 1' with a diff of the new file." `git diff --no-index` exits 1 whenever
  // the sides differ, and the engine now says so on the entry (v0.16.0).
  const newFile = entry({
    command: "git -c core.quotepath=false diff --no-color --no-index -U3 -- NUL new.txt",
    exitCode: 1,
    ok: true,
    output: "diff --git a/NUL b/new.txt\n+hello",
  })
  expect(isOk(newFile)).toBe(true)
  expect(failed(newFile)).toBe(false)
  expect(notableFailure(newFile)).toBe(false)
  // The verdict can also refuse an exit 0.
  expect(failed(entry({ exitCode: 0, ok: false }))).toBe(true)
  expect(notableFailure(entry({ command: "git push origin main", exitCode: 0, ok: false }))).toBe(true)
  // A pre-v0.16 engine sends no `ok`: exit 0 stands in, exactly as before.
  const legacy = entry({ command: "git push origin main", exitCode: 1 })
  delete (legacy as { ok?: boolean }).ok
  expect(isOk(legacy)).toBe(false)
  expect(notableFailure(legacy)).toBe(true)
  expect(isOk(entry({ exitCode: 0 }))).toBe(true)
  // The verdict never forgives a timeout: there was nothing to judge.
  expect(notableFailure(entry({ command: "git push origin main", exitCode: -1, ok: false }))).toBe(false)
})

// ---- what the user did versus what the engine did on its own (v0.16.0) ----

test("the subcommand is read past the engine's global options and quoted arguments", () => {
  expect(subcommand("git status --porcelain=v1")).toBe("status")
  expect(subcommand("git -c core.quotepath=false diff --no-color -U3 -- a.txt")).toBe("diff")
  expect(subcommand('git -c user.email=t@t -c "user.name=t t" commit -m "a subject with spaces"')).toBe("commit")
  expect(subcommand("git -c rebase.instructionFormat=%s rebase -i --autostash HEAD~3")).toBe("rebase")
  expect(subcommand("git --no-pager log")).toBe("log")
  expect(subcommand("git")).toBe("")
})

test("a push, a commit or a checkout is the user's; a refresh's reads are the engine's", () => {
  const actions = [
    "git push",
    "git push -u origin HEAD",
    "git pull --rebase",
    "git fetch --prune origin",
    'git -c user.email=t@t commit -m "a subject with spaces"',
    "git merge --ff-only topic",
    "git -c rebase.instructionFormat=%s rebase -i --autostash HEAD~3",
    "git cherry-pick abc123",
    "git revert --no-edit abc123",
    "git reset --hard abc123",
    "git reset -q HEAD -- a.txt",
    "git stash push -m wip",
    "git stash",
    "git stash pop stash@{0}",
    "git stash drop stash@{0}",
    "git checkout -f topic",
    "git checkout -q -- a.txt",
    "git switch topic",
    "git branch topic abc123",
    "git branch -D topic",
    "git tag v1.0 abc123",
    "git tag -d v1.0",
    "git remote add origin https://host/o/r.git",
    "git remote set-url origin https://host/o/r.git",
    "git remote remove origin",
    "git config --local core.editor code",
    "git config --local --unset merge.tool",
    "git add -- a.txt",
    "git restore --staged -- a.txt",
    "git rm -f -q --cached -- a.txt",
    "git apply --whitespace=nowarn --recount --cached",
    "git submodule update --init",
    "git worktree add ../wt topic",
  ]
  for (const command of actions) expect(entryKind(entry({ command })), command).toBe("action")

  const background = [
    "git status --porcelain=v1 -uall",
    "git log --date-order --decorate=short",
    "git rev-parse --abbrev-ref HEAD",
    "git rev-parse --verify -q refs/stash",
    "git ls-files --others --exclude-standard",
    "git -c core.quotepath=false diff --no-color -U3 -- a.txt",
    "git -c core.quotepath=false diff --no-color --no-index -U3 -- NUL new.txt",
    "git diff --quiet",
    "git -c core.quotepath=false show --format= -U3 abc123",
    "git for-each-ref --format=%(refname)",
    "git cat-file -e HEAD:a.txt",
    "git cat-file -s HEAD:a.txt",
    "git diff-tree --root -r --no-commit-id --name-status -M abc123",
    "git -c core.quotepath=false ls-tree -z abc123",
    "git rev-list --left-right --count HEAD...@{upstream}",
    "git name-rev --name-only abc123",
    "git merge-base --is-ancestor a b",
    "git check-ignore -q a.txt",
    "git version",
    "git config --get user.name",
    "git config --local --get merge.tool",
    "git config --show-origin --get user.email",
    "git config --list",
    "git remote -v",
    "git remote get-url origin",
    "git remote",
    "git stash list --format=%gd",
    "git stash show -p stash@{0}",
    "git branch",
    "git branch --list",
    "git branch -a --contains abc123",
    "git tag -l",
    "git tag",
    "git submodule status --recursive",
    "git worktree list",
  ]
  for (const command of background) expect(entryKind(entry({ command })), command).toBe("background")
})

test("the newest action and the newest failed action are found from the tail", () => {
  const entries = [
    entry({ id: 1, command: "git status" }),
    entry({ id: 2, command: "git push", exitCode: 128, output: "fatal: rejected" }),
    entry({ id: 3, command: "git log" }),
    entry({ id: 4, command: "git fetch origin" }),
    entry({ id: 5, command: "git rev-parse --verify -q refs/stash", exitCode: 1 }),
  ]
  expect(newestAction(entries)?.id).toBe(4)
  expect(newestAction([entry({ id: 1, command: "git status" })])).toBeNull()
  expect(newestAction([])).toBeNull()

  // The failed push pins; the failed probe after the fetch never does.
  expect(pinnedFailure(entries, 0)?.id).toBe(2)
  // Dismissed: gone until a newer failure.
  expect(pinnedFailure(entries, 2)).toBeNull()
  expect(pinnedFailure([...entries, entry({ id: 6, command: "git pull", exitCode: 1 })], 2)?.id).toBe(6)
  // A failed read is the engine's, not the user's.
  expect(pinnedFailure([entry({ id: 1, command: "git log", exitCode: 128 })], 0)).toBeNull()
  // A cancelled action was abandoned, not refused.
  expect(pinnedFailure([entry({ id: 1, command: "git fetch origin", exitCode: -1 })], 0)).toBeNull()
})

test("reads between two actions fold into one gap, newest first", () => {
  const entries = [
    entry({ id: 1, command: "git version" }),
    entry({ id: 2, command: "git status" }),
    entry({ id: 3, command: "git commit -m x" }),
    entry({ id: 4, command: "git status" }),
    entry({ id: 5, command: "git log" }),
    entry({ id: 6, command: "git push" }),
    entry({ id: 7, command: "git status" }),
  ]
  const rows = groupEntries(entries)
  expect(
    rows.map((r) => (r.kind === "gap" ? `gap:${r.key}:${r.entries.map((e) => e.id).join(",")}` : r.entry.id)),
  ).toEqual(["gap:7:7", 6, "gap:4:5,4", 3, "gap:1:2,1"])
  // The gap's key is its oldest id, so it survives the refresh that keeps
  // appending to it.
  const grown = groupEntries([...entries, entry({ id: 8, command: "git rev-parse HEAD" })])
  expect(grown[0]).toMatchObject({ kind: "gap", key: 7 })
  expect(grown[0].kind === "gap" && grown[0].entries.map((e) => e.id)).toEqual([8, 7])

  // Only actions: no gaps; only reads: one gap; nothing: nothing.
  const push = entry({ id: 1, command: "git push" })
  expect(groupEntries([push])).toEqual([{ kind: "entry", entry: push, entryKind: "action" }])
  expect(groupEntries([entry({ id: 1, command: "git status" }), entry({ id: 2, command: "git log" })])).toHaveLength(1)
  expect(groupEntries([])).toEqual([])
})

test("a folded row shows the first line that says something, and counts the rest", () => {
  expect(outputSummary("")).toEqual({ line: "", more: 0 })
  expect(outputSummary("\n\n")).toEqual({ line: "", more: 0 })
  expect(outputSummary("To github.com:o/r.git\n   abc..def  main -> main")).toEqual({
    line: "To github.com:o/r.git",
    more: 1,
  })
  expect(outputSummary("one\n\n \nfour")).toEqual({ line: "one", more: 1 })
})

test("the engine's probes never pop a failure card, real failures do", () => {
  // These run on every refresh and answer "no" with a non-zero exit.
  const probes = [
    "git rev-parse --verify -q refs/stash",
    "git rev-parse --abbrev-ref --symbolic-full-name @{upstream}",
    // Pull and push spell it `@{u}`; a first push has no upstream to find.
    "git rev-parse --abbrev-ref --symbolic-full-name @{u}",
    "git rev-list --left-right --count HEAD...@{upstream}",
    "git remote get-url origin",
    "git ls-files --error-unmatch -- a.txt",
    "git config --get user.name",
    // The settings dialog reads several keys that are usually unset, at a
    // named scope; each answers "no" with exit 1 (v0.15.0).
    "git config --local --get merge.tool",
    "git config --global --get core.editor",
    "git config --show-origin --get user.email",
  ]
  for (const command of probes) {
    const e = entry({ command, exitCode: 1 })
    expect(isProbe(e), command).toBe(true)
    expect(notableFailure(e), command).toBe(false)
  }
  expect(notableFailure(entry({ command: "git push origin main", exitCode: 128 }))).toBe(true)
  expect(notableFailure(entry({ command: "git push origin main", exitCode: 0 }))).toBe(false)
  // A cancelled or timed-out read is not the user's failure.
  expect(notableFailure(entry({ command: "git log --max-count=800", exitCode: -1 }))).toBe(false)
})

test("a truncated entry always carries the marker", () => {
  const fromEngine = entry({ output: `body\n${TRUNCATION_MARKER}`, truncated: true })
  expect(entryOutput(fromEngine)).toBe(`body\n${TRUNCATION_MARKER}`)
  // A flagged entry that lost its marker still gets one, exactly once.
  const bare = entry({ output: "body", truncated: true })
  expect(entryOutput(bare)).toBe(`body\n${TRUNCATION_MARKER}`)
  expect(entryOutput(entry({ output: "body" }))).toBe("body")
})

test("the failure card shows only the first lines", () => {
  const text = "fatal: could not read Username\nhint: one\nhint: two\nhint: three\nhint: four"
  expect(firstLines(text, 3)).toBe("fatal: could not read Username\nhint: one\nhint: two")
  expect(firstLines("only one line")).toBe("only one line")
})

test("the filter matches command or output, and every term must match", () => {
  const entries = [
    entry({ id: 1, command: "git status --porcelain=v1" }),
    entry({ id: 2, command: "git push origin main", exitCode: 128, output: "fatal: Authentication failed" }),
    entry({ id: 3, command: "git fetch --prune origin" }),
  ]
  expect(filterEntries(entries, "").map((e) => e.id)).toEqual([1, 2, 3])
  expect(filterEntries(entries, "  ").map((e) => e.id)).toEqual([1, 2, 3])
  expect(filterEntries(entries, "origin").map((e) => e.id)).toEqual([2, 3])
  // Case-insensitive, and matching against the output as well as the command.
  expect(filterEntries(entries, "FATAL").map((e) => e.id)).toEqual([2])
  expect(filterEntries(entries, "push fatal").map((e) => e.id)).toEqual([2])
  expect(filterEntries(entries, "push fetch")).toEqual([])
})

test("a delta merges in newest last and the buffer stays capped", () => {
  const first = mergeEntries([], [entry({ id: 1 }), entry({ id: 2 })])
  expect(first.map((e) => e.id)).toEqual([1, 2])
  // Ids already held are ignored, so a re-poll cannot double an entry.
  expect(mergeEntries(first, [entry({ id: 2 }), entry({ id: 3 })]).map((e) => e.id)).toEqual([1, 2, 3])
  expect(mergeEntries(first, [])).toEqual(first)

  const many = Array.from({ length: GIT_LOG_CAPACITY + 10 }, (_, i) => entry({ id: i + 1 }))
  const capped = mergeEntries([], many)
  expect(capped).toHaveLength(GIT_LOG_CAPACITY)
  expect(capped[0].id).toBe(11)
  expect(capped[capped.length - 1].id).toBe(GIT_LOG_CAPACITY + 10)
})

test("copy-all is the command, its result and its output", () => {
  const e = entry({ command: "git push origin main", exitCode: 128, durationMs: 1500, output: "fatal: rejected" })
  expect(entryText(e)).toBe("$ git push origin main   [exit 128, 1.5 s]\nfatal: rejected")
  // A silent command keeps one line.
  expect(entryText(entry({ command: "git rev-parse HEAD", durationMs: 8 }))).toBe(
    "$ git rev-parse HEAD   [exit 0, 8 ms]",
  )
  expect(copyAllText([entry({ id: 1, command: "git a", durationMs: 1 }), entry({ id: 2, command: "git b" })])).toBe(
    "$ git a   [exit 0, 1 ms]\n\n$ git b   [exit 0, 12 ms]",
  )
})
