import { describe, expect, test } from "vitest"
import {
  cycle,
  emptyDoc,
  fileProgress,
  lineKeyOf,
  nextUnreviewed,
  parseDoc,
  recount,
  toggleReject,
  withLine,
  type FileReview,
  type ReviewDoc,
} from "./reviewModel"

// The rows DiffView's parser produces for this hunk, in order:
//   @@ -10,3 +10,4 @@
//    ctx          (10 / 10)
//   -old          (11 / -)
//   +new one      (- / 11)
//   +new two      (- / 12)
//    ctx          (12 / 13)
const ROWS = [
  { kind: "other" as const, oldNum: null, newNum: null },
  { kind: "context" as const, oldNum: 10, newNum: 10 },
  { kind: "remove" as const, oldNum: 11, newNum: null },
  { kind: "add" as const, oldNum: null, newNum: 11 },
  { kind: "add" as const, oldNum: null, newNum: 12 },
  { kind: "context" as const, oldNum: 12, newNum: 13 },
]

const keysOf = (rows: typeof ROWS) => rows.map(lineKeyOf).filter((k): k is string => k !== null)

function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null) {
    Object.freeze(value)
    for (const v of Object.values(value)) deepFreeze(v)
  }
  return value
}

describe("lineKeyOf", () => {
  test("an added line is keyed by its new number, a removed one by its old number", () => {
    expect(lineKeyOf({ kind: "add", oldNum: null, newNum: 29 })).toBe("+29")
    expect(lineKeyOf({ kind: "remove", oldNum: 13, newNum: null })).toBe("-13")
  })

  test("context, hunk headers and meta rows have no key", () => {
    expect(lineKeyOf({ kind: "context", oldNum: 5, newNum: 6 })).toBeNull()
    expect(lineKeyOf({ kind: "other", oldNum: null, newNum: null })).toBeNull()
  })

  test("a changed row without its number is not keyed rather than keyed wrong", () => {
    expect(lineKeyOf({ kind: "add", oldNum: 3, newNum: null })).toBeNull()
    expect(lineKeyOf({ kind: "remove", oldNum: null, newNum: 3 })).toBeNull()
  })

  test("over a parsed hunk only the + and - rows are keyed, in row order", () => {
    expect(keysOf(ROWS)).toEqual(["-11", "+11", "+12"])
  })
})

describe("cycle", () => {
  test("unreviewed → ok → rejected → unreviewed", () => {
    expect(cycle(undefined)).toBe("ok")
    expect(cycle("ok")).toBe("rejected")
    expect(cycle("rejected")).toBeUndefined()
  })

  test("three presses bring any state back to itself", () => {
    for (const start of [undefined, "ok", "rejected"] as const) {
      expect(cycle(cycle(cycle(start)))).toBe(start)
    }
  })

  test("x toggles rejected from any state and back", () => {
    expect(toggleReject(undefined)).toBe("rejected")
    expect(toggleReject("ok")).toBe("rejected")
    expect(toggleReject("rejected")).toBeUndefined()
    expect(toggleReject(toggleReject(undefined))).toBeUndefined()
  })
})

describe("fileProgress", () => {
  test("nothing marked: 0 of the changed lines, none rejected", () => {
    expect(fileProgress(undefined, ["+1", "+2", "-3"])).toEqual({ reviewed: 0, changed: 3, rejected: 0 })
    expect(fileProgress({ lines: {}, comments: [] }, [])).toEqual({ reviewed: 0, changed: 0, rejected: 0 })
  })

  test("rejected counts as reviewed and is listed separately", () => {
    const file: FileReview = { lines: { "+1": "ok", "-3": "rejected" }, comments: [] }
    expect(fileProgress(file, ["+1", "+2", "-3"])).toEqual({ reviewed: 2, changed: 3, rejected: 1 })
  })

  test("context rows are never part of the count", () => {
    const keys = keysOf(ROWS)
    const file: FileReview = { lines: { "-11": "ok", "+11": "ok", "+12": "rejected" }, comments: [] }
    expect(fileProgress(file, keys)).toEqual({ reviewed: 3, changed: 3, rejected: 1 })
    expect(keys).not.toContain("+10")
    expect(keys).not.toContain("+13")
  })

  test("a stale mark whose line is not in the diff any more is ignored", () => {
    const file: FileReview = { lines: { "+1": "ok", "+99": "rejected" }, comments: [] }
    expect(fileProgress(file, ["+1", "+2"])).toEqual({ reviewed: 1, changed: 2, rejected: 0 })
  })
})

describe("nextUnreviewed", () => {
  const keys = ["+1", "+2", "+3", "+4"]

  test("the first unreviewed line after the cursor", () => {
    const file: FileReview = { lines: { "+2": "ok" }, comments: [] }
    expect(nextUnreviewed(keys, file, 0)).toBe(2)
    expect(nextUnreviewed(keys, undefined, 0)).toBe(1)
  })

  test("starts at the top when there is no cursor yet", () => {
    expect(nextUnreviewed(keys, undefined, -1)).toBe(0)
    expect(nextUnreviewed(keys, { lines: { "+1": "rejected" }, comments: [] }, -1)).toBe(1)
  })

  test("wraps round the end", () => {
    expect(nextUnreviewed(keys, undefined, 3)).toBe(0)
    expect(nextUnreviewed(keys, { lines: { "+1": "ok" }, comments: [] }, 3)).toBe(1)
    // A cursor past the end behaves like the last row.
    expect(nextUnreviewed(keys, undefined, 99)).toBe(0)
  })

  test("the current line is the last candidate, so the cursor stays on the only one left", () => {
    const file: FileReview = { lines: { "+1": "ok", "+3": "ok", "+4": "rejected" }, comments: [] }
    expect(nextUnreviewed(keys, file, 1)).toBe(1)
  })

  test("null when every line is marked or there are none", () => {
    const all: FileReview = { lines: { "+1": "ok", "+2": "ok", "+3": "rejected", "+4": "ok" }, comments: [] }
    expect(nextUnreviewed(keys, all, 0)).toBeNull()
    expect(nextUnreviewed([], undefined, -1)).toBeNull()
  })
})

describe("emptyDoc", () => {
  test("version 1, the key, nothing reviewed, in progress", () => {
    expect(emptyDoc("abc")).toEqual({
      version: 1,
      commit: "abc",
      reviewed: 0,
      changed: 0,
      status: "in-progress",
      files: {},
    })
    expect("head" in emptyDoc("abc")).toBe(false)
    expect(emptyDoc("abc-worktree", "abc").head).toBe("abc")
  })
})

describe("withLine", () => {
  test("marks a line, creating the file entry, and recounts", () => {
    const doc = withLine(emptyDoc("c1"), "a.ts", "+3", "ok")
    expect(doc.files).toEqual({ "a.ts": { lines: { "+3": "ok" }, comments: [] } })
    expect(doc.reviewed).toBe(1)
    expect(doc.changed).toBe(0)
    expect(doc.status).toBe("in-progress")
  })

  test("never mutates the input or anything it holds", () => {
    const before = deepFreeze(withLine(withLine(emptyDoc("c1"), "a.ts", "+1", "ok"), "b.ts", "-2", "rejected"))
    const snapshot = JSON.stringify(before)
    const after = withLine(before, "a.ts", "+5", "rejected")
    expect(JSON.stringify(before)).toBe(snapshot)
    expect(after).not.toBe(before)
    expect(after.files).not.toBe(before.files)
    expect(after.files["a.ts"]).not.toBe(before.files["a.ts"])
    expect(after.files["a.ts"].lines).toEqual({ "+1": "ok", "+5": "rejected" })
    // The file that was not touched keeps its identity.
    expect(after.files["b.ts"]).toBe(before.files["b.ts"])
  })

  test("clearing removes the mark, and an empty file entry goes with it", () => {
    const marked = withLine(withLine(emptyDoc("c1"), "a.ts", "+1", "ok"), "a.ts", "+2", "ok")
    const one = withLine(marked, "a.ts", "+1", undefined)
    expect(one.files["a.ts"].lines).toEqual({ "+2": "ok" })
    expect(one.reviewed).toBe(1)
    const none = withLine(one, "a.ts", "+2", undefined)
    expect(none.files).toEqual({})
    expect(none.reviewed).toBe(0)
  })

  test("a file with comments but no marks left stays listed", () => {
    const doc: ReviewDoc = {
      ...emptyDoc("c1"),
      files: { "a.ts": { lines: { "+1": "ok" }, comments: [{ line: "+1", text: "why" }] } },
    }
    const cleared = withLine(doc, "a.ts", "+1", undefined)
    expect(cleared.files["a.ts"]).toEqual({ lines: {}, comments: [{ line: "+1", text: "why" }] })
  })

  test("the same state again is a no-op that returns the same document", () => {
    const doc = withLine(emptyDoc("c1"), "a.ts", "+1", "ok")
    expect(withLine(doc, "a.ts", "+1", "ok")).toBe(doc)
    expect(withLine(doc, "a.ts", "+9", undefined)).toBe(doc)
    expect(withLine(doc, "zz.ts", "+9", undefined)).toBe(doc)
  })

  test("status follows the marks against a supplied changed count", () => {
    const doc: ReviewDoc = { ...emptyDoc("c1"), changed: 2 }
    const one = withLine(doc, "a.ts", "+1", "ok")
    expect(one.status).toBe("in-progress")
    const two = withLine(one, "a.ts", "-1", "rejected")
    expect(two).toMatchObject({ reviewed: 2, changed: 2, status: "complete" })
    expect(withLine(two, "a.ts", "+1", undefined).status).toBe("in-progress")
    // Marks alone never complete a review whose denominator is unknown.
    expect(withLine(emptyDoc("c1"), "a.ts", "+1", "ok").status).toBe("in-progress")
  })

  test("recount is how the caller supplies the denominator later", () => {
    const doc = withLine(emptyDoc("c1"), "a.ts", "+1", "ok")
    expect(recount({ ...doc, changed: 1 })).toMatchObject({ reviewed: 1, changed: 1, status: "complete" })
    expect(recount(doc)).toBe(doc)
  })
})

describe("parseDoc", () => {
  test("round-trips what withLine wrote", () => {
    const doc = withLine(
      withLine({ ...emptyDoc("c1", "h1"), changed: 2 }, "a.ts", "+1", "ok"),
      "b.ts",
      "-4",
      "rejected",
    )
    expect(parseDoc(JSON.stringify(doc))).toEqual(doc)
  })

  test("ignores unknown keys at every level and drops what is not a mark or a comment", () => {
    const text = JSON.stringify({
      version: 1,
      commit: "c1",
      head: "h1",
      author: "someone",
      reviewed: 99,
      changed: 3,
      status: "complete",
      files: {
        "a.ts": {
          lines: { "+1": "ok", "+2": "maybe", "-3": "rejected", nope: "ok" },
          comments: [{ line: "+1", text: "fine" }, { line: "+2" }, "text", { line: 3, text: "x" }],
          flagged: true,
        },
        "empty.ts": { lines: {}, comments: [] },
        "b.ts": "not a file",
      },
    })
    expect(parseDoc(text)).toEqual({
      version: 1,
      commit: "c1",
      head: "h1",
      reviewed: 2,
      changed: 3,
      status: "in-progress",
      files: { "a.ts": { lines: { "+1": "ok", "-3": "rejected" }, comments: [{ line: "+1", text: "fine" }] } },
    })
  })

  test("the derived fields are recomputed, never trusted", () => {
    const doc = parseDoc(
      '{"version":1,"commit":"c1","reviewed":0,"changed":1,"status":"in-progress","files":{"a":{"lines":{"+1":"ok"}}}}',
    )
    expect(doc).toMatchObject({ reviewed: 1, changed: 1, status: "complete" })
    expect(parseDoc('{"version":1,"commit":"c1","changed":-5}')?.changed).toBe(0)
    expect(parseDoc('{"version":1,"commit":"c1","changed":"7"}')?.changed).toBe(0)
  })

  test("missing pieces read as an empty review", () => {
    expect(parseDoc('{"version":1,"commit":"c1"}')).toEqual(emptyDoc("c1"))
    expect(parseDoc('{"version":1,"commit":"c1","head":7,"files":[]}')).toEqual(emptyDoc("c1"))
  })

  test("the wrong version, or no commit, is not a review", () => {
    expect(parseDoc('{"version":2,"commit":"c1","files":{}}')).toBeNull()
    expect(parseDoc('{"version":"1","commit":"c1"}')).toBeNull()
    expect(parseDoc('{"commit":"c1","files":{}}')).toBeNull()
    expect(parseDoc('{"version":1}')).toBeNull()
    expect(parseDoc('{"version":1,"commit":""}')).toBeNull()
  })

  test("garbage is null", () => {
    for (const text of ["", "not json", "[]", "null", "42", '"c1"', "{", '{"version":1,"commit":"c1"', "[1]"]) {
      expect(parseDoc(text), text).toBeNull()
    }
  })
})
