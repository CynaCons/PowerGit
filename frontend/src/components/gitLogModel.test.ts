import { expect, test } from "vitest"
import type { GitLogEntry } from "../engine"
import {
  GIT_LOG_CAPACITY,
  TRUNCATION_MARKER,
  copyAllText,
  entryOutput,
  entryText,
  failed,
  filterEntries,
  firstLines,
  formatDuration,
  formatExit,
  isProbe,
  mergeEntries,
  notableFailure,
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

test("the engine's probes never pop a failure card, real failures do", () => {
  // These run on every refresh and answer "no" with a non-zero exit.
  const probes = [
    "git rev-parse --verify -q refs/stash",
    "git rev-parse --abbrev-ref --symbolic-full-name @{upstream}",
    "git rev-list --left-right --count HEAD...@{upstream}",
    "git remote get-url origin",
    "git ls-files --error-unmatch -- a.txt",
    "git config --get user.name",
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
