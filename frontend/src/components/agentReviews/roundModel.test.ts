import { describe, expect, it } from "vitest"
import type { AgentReviewChange, AgentReviewRound, AgentReviewThread } from "../../engine"
import { emptyDoc, withComment, withLine } from "../../review/reviewModel"
import {
  commentRef,
  filesLeft,
  hunksOf,
  placeThreads,
  presenceLabel,
  quotedLine,
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

  it("counts a reviewer agent's comments with the owner's (v0.21.14)", () => {
    const doc = withComment(emptyDoc("k"), "t.cs", "-21", "keep y")
    const reviewer = (id: string, kind: AgentReviewThread["kind"], r = 1): AgentReviewThread => ({
      id,
      round: r,
      change: "h1",
      path: "t.cs",
      line: "+3",
      body: `note ${id}`,
      kind,
      postedAt: "",
      replies: [],
      author: "codex-review",
    })
    const threads = [reviewer("c1", "round"), reviewer("c2", "withdrawn"), reviewer("c3", "round", 2)]
    expect(roundCounts(round(), doc, threads).comments).toBe(2)
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
    expect(presenceLabel("2026-10-13T10:00:27Z", true, now)).toBe("reading now")
    expect(presenceLabel("2026-10-13T09:58:30Z", false, now)).toBe("last read 2 min ago")
    expect(presenceLabel(null, false, now)).toBe("has not read the channel")
  })

  it("finds the comment a board message names", () => {
    expect(commentRef("c3: because")).toBe("c3")
    expect(commentRef("c12 · src/a.cs:4\nwhy?")).toBe("c12")
    expect(commentRef("Round 1 sent")).toBeNull()
  })

  // v0.21.13, owner: "if I drop a comment on round one, when the agent comes
  // with round two, I lose the comments."
  describe("placeThreads", () => {
    const t = (id: string, r: number, changeId: string | null, path = "t.cs"): AgentReviewThread => ({
      id,
      round: r,
      change: changeId,
      path,
      line: "+3",
      body: id,
      kind: "round",
      postedAt: "",
      replies: [],
    })
    const r1 = round({ n: 1, changes: [change("h1", 2, 2), change("h2", 20, 21)] })
    const r2 = round({
      n: 2,
      changes: [change("h1", 2, 2, { origin: "carried" }), change("h3", 20, 21, { origin: "revised", from: "h2" })],
    })
    const r3 = round({ n: 3, changes: [change("h4", 2, 2, { origin: "revised", from: "h1" })], removed: ["h3"] })
    const r4 = round({ n: 4, files: [], changes: [], removed: ["h4"] })
    const rounds = [r1, r2, r3, r4]
    const ids = (ts: AgentReviewThread[] | undefined) => (ts ?? []).map((x) => x.id)

    it("follows a change carried and revised over any number of rounds", () => {
      const threads = [t("c1", 1, "h1"), t("c2", 1, "h2"), t("c3", 2, "h3"), t("c4", 3, "h4")]
      const two = placeThreads(rounds, threads, 2)
      expect(ids(two.byChange.get("h1"))).toEqual(["c1"])
      expect(ids(two.byChange.get("h3"))).toEqual(["c2"])
      const three = placeThreads(rounds, threads, 3)
      expect(ids(three.byChange.get("h4"))).toEqual(["c1"])
      expect(three.removed.map((e) => [e.change.id, e.round, ids(e.threads)])).toEqual([["h3", 3, ["c2", "c3"]]])
      expect(three.byChange.has("h3")).toBe(false)
    })

    it("keeps a removed change's conversations in later rounds and names the files that left", () => {
      const threads = [t("c1", 1, "h1"), t("c2", 1, "h2"), t("c5", 1, null, "gone.cs")]
      const four = placeThreads(rounds, threads, 4)
      expect(four.removed.map((e) => [e.change.id, e.round])).toEqual([
        ["h4", 4],
        ["h3", 3],
      ])
      expect(ids(four.byFile.get("gone.cs"))).toEqual(["c5"])
      expect(filesLeft(four, r4)).toEqual(["gone.cs", "t.cs"])
      expect(filesLeft(placeThreads(rounds, threads, 2), r2)).toEqual(["gone.cs"])
    })

    it("leaves the viewed round's own threads and withdrawn ones alone", () => {
      const threads = [t("c1", 2, "h1"), { ...t("c2", 1, "h1"), kind: "withdrawn" as const }]
      const two = placeThreads(rounds, threads, 2)
      expect(two.byChange.size + two.removed.length + two.byFile.size).toBe(0)
    })

    it("quotes the commented line as it read in its own round", () => {
      expect(quotedLine(rounds, t("c1", 1, "h1"))).toEqual({ kind: "add", text: "B" })
      expect(quotedLine(rounds, { ...t("c1", 1, "h1"), line: "-3" })).toEqual({ kind: "remove", text: "b" })
      expect(quotedLine(rounds, t("c9", 7, "h1"))).toBeNull()
    })
  })
})
