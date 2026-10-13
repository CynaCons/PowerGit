import { describe, expect, it } from "vitest"
import type { AgentReviewChange, AgentReviewRound, AgentReviewThread } from "../../engine"
import { emptyDoc, withComment, withLine } from "../../review/reviewModel"
import {
  commentRef,
  earlierThreads,
  hunksOf,
  presenceLabel,
  roundComments,
  roundCounts,
  turnLabel,
  verdictOf,
  withVerdict,
} from "./roundModel"

const patch = [
  "diff --git a/t.cs b/t.cs",
  "--- a/t.cs",
  "+++ b/t.cs",
  "@@ -2,4 +2,5 @@ class T",
  " a",
  "-b",
  "+B",
  "+B2",
  " c",
  "@@ -20,3 +21,2 @@ class T",
  " x",
  "-y",
  " z",
  "",
].join("\n")

const change = (
  id: string,
  oldStart: number,
  newStart: number,
  extra: Partial<AgentReviewChange> = {},
): AgentReviewChange => ({
  id,
  path: "t.cs",
  oldStart,
  oldLines: 0,
  newStart,
  newLines: 0,
  hash: id,
  origin: "new",
  from: null,
  verdict: "undecided",
  rejectedLines: null,
  ...extra,
})

const round = (extra: Partial<AgentReviewRound> = {}): AgentReviewRound => ({
  n: 1,
  openedAt: "2026-10-13T10:00:00Z",
  sentAt: null,
  note: null,
  files: [{ path: "t.cs", status: "M", patch }],
  changes: [change("h1", 2, 2), change("h2", 20, 21)],
  removed: [],
  ...extra,
})

describe("hunksOf", () => {
  it("splits a patch into changes with the engine's line keys, matched by header numbers", () => {
    const hunks = hunksOf(patch, round().changes)
    expect(hunks.map((h) => h.change?.id)).toEqual(["h1", "h2"])
    expect(hunks[0].keys).toEqual(["-3", "+3", "+4"])
    expect(hunks[0].rows.map((r) => r.key)).toEqual(["+2", "-3", "+3", "+4", "+5"])
    expect(hunks[1].keys).toEqual(["-21"])
    expect(hunksOf(null, [])).toEqual([])
  })
})

describe("verdictOf", () => {
  it("is the engine's rule", () => {
    const keys = ["-3", "+3"]
    const file = (lines: Record<string, "ok" | "rejected">) => ({ lines, comments: [] })
    expect(verdictOf(keys, file({ "-3": "ok", "+3": "ok" }))).toBe("accept")
    expect(verdictOf(keys, file({ "-3": "rejected", "+3": "rejected" }))).toBe("reject")
    expect(verdictOf(keys, file({ "-3": "ok", "+3": "rejected" }))).toBe("mixed")
    expect(verdictOf(keys, file({ "-3": "ok" }))).toBe("undecided")
    expect(verdictOf(keys, undefined)).toBe("undecided")
  })
})

describe("roundCounts", () => {
  it("counts live verdicts from the marks while the round is open, and the comments that go with it", () => {
    let doc = withVerdict(emptyDoc("k"), "t.cs", ["-3", "+3", "+4"], "ok")
    doc = withLine(doc, "t.cs", "-21", "rejected")
    doc = withComment(doc, "t.cs", "-21", "keep y")
    doc = withComment(doc, "t.cs", "+3", "why B?")
    const asked: AgentReviewThread = {
      id: "c1",
      round: 1,
      change: "h1",
      path: "t.cs",
      line: "+3",
      body: "why B?",
      kind: "ask",
      postedAt: "",
      replies: [],
    }
    expect(roundCounts(round(), doc, [asked])).toEqual({
      accept: 1,
      reject: 1,
      mixed: 0,
      undecided: 0,
      comments: 1,
      total: 2,
    })
    expect(roundComments(round(), doc, [asked])).toEqual([{ path: "t.cs", line: "-21", text: "keep y" }])
  })

  it("reads the stamped verdicts once the round is sent", () => {
    const sent = round({
      sentAt: "x",
      changes: [change("h1", 2, 2, { verdict: "reject" }), change("h2", 20, 21, { verdict: "accept" })],
    })
    expect(roundCounts(sent, null, [])).toMatchObject({ accept: 1, reject: 1, undecided: 0 })
  })
})

describe("labels", () => {
  it("says whose turn it is", () => {
    const base = { status: "pending" as const, mode: "wait" as const, unread: true }
    expect(turnLabel({ ...base, round: 1, turn: "user" }).label).toBe("round 1 · your turn")
    expect(turnLabel({ ...base, round: 2, turn: "agent" })).toEqual({
      label: "round 2 sent · agent revising",
      tone: "agent",
    })
    expect(turnLabel({ ...base, status: "approved", round: 2 }).label).toBe("approved · round 2")
    expect(turnLabel({ ...base, mode: "notify" }).label).toBe("unread")
  })

  it("says when the agent last read the channel", () => {
    const now = Date.parse("2026-10-13T10:00:30Z")
    expect(presenceLabel("2026-10-13T10:00:27Z", true, now)).toBe("reading this channel · 3 s ago")
    expect(presenceLabel("2026-10-13T09:58:30Z", false, now)).toBe("last read 2 min ago")
    expect(presenceLabel(null, false, now)).toBe("has not read the channel")
  })

  it("finds the comment a board message names", () => {
    expect(commentRef("c3: because")).toBe("c3")
    expect(commentRef("c12 · src/a.cs:4\nwhy?")).toBe("c12")
    expect(commentRef("Round 1 sent")).toBeNull()
  })

  it("carries earlier threads onto the change that kept or revised their id", () => {
    const t = (id: string, r: number, changeId: string): AgentReviewThread => ({
      id,
      round: r,
      change: changeId,
      path: "t.cs",
      line: "+3",
      body: "",
      kind: "round",
      postedAt: "",
      replies: [],
    })
    const threads = [t("c1", 1, "h1"), t("c2", 1, "h2"), t("c3", 2, "h3")]
    expect(earlierThreads(threads, 2, change("h3", 1, 1, { origin: "revised", from: "h2" })).map((x) => x.id)).toEqual([
      "c2",
    ])
    expect(earlierThreads(threads, 2, change("h1", 1, 1, { origin: "carried" })).map((x) => x.id)).toEqual(["c1"])
  })
})
