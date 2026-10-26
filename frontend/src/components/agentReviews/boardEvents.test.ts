import { describe, expect, it } from "vitest"
import { commentPost, eventKind, parsePowerGitEvent } from "./boardEvents"

describe("board events", () => {
  it("reads a round opened post without the agent-facing lines", () => {
    const e = parsePowerGitEvent(
      "Round 1 opened · review abcd1234 · 1 file, 1 change\nFix the race\nTwo refreshes ran.\nReply with `cN: <answer>`; Markdown is shown.\nreview_id=abcd",
    )
    expect(e).toMatchObject({ kind: "opened", title: "Round 1 opened", facts: "1 file, 1 change" })
    expect(e.markdown).toBe("Fix the race\nTwo refreshes ran.")
  })

  it("reads a sent round's verdicts and details, whoever posted it", () => {
    const text =
      "Round 1 sent · review abcd1234 · 0 accepted, 1 rejected, 0 undecided, 1 comment\none thing\n✗ h1  f.txt:2  c2  keep b\n  more\ndetails: agent_review_get review_id=x round=1"
    expect(eventKind(text)).toBe("sent")
    const e = parsePowerGitEvent(text)
    expect(e.facts).toBe("0 accepted, 1 rejected, 0 undecided, 1 comment")
    expect(e.verdicts).toEqual([{ mark: "✗", text: "h1  f.txt:2  c2  keep b", children: ["more"] }])
    expect(e.details).toMatch(/^details: /)
    expect(e.markdown).toBe("one thing")
  })

  it("puts listed comments and explanations among the folded extra lines", () => {
    const sent = parsePowerGitEvent(
      "Round 2 sent · review abcd · 3 accepted, 0 rejected, 0 undecided, 1 comment\n  c4  f.txt:9  rename it\n✓ h1 h2 h3",
    )
    expect(sent.extra).toEqual(["c4  f.txt:9  rename it"])
    expect(sent.markdown).toBe("")
    const opened = parsePowerGitEvent(
      "Round 2 opened · review abcd · 1 unchanged, 1 revised, 0 new, 0 removed\nFixed it.\nc2 answered: done\nc5 explains f.txt:3: why",
    )
    expect(opened.markdown).toBe("Fixed it.")
    expect(opened.extra).toEqual(["c2 answered: done", "c5 explains f.txt:3: why"])
  })

  it("knows approvals and leaves other posts alone", () => {
    expect(eventKind("Approved · review abcd · round 2 · 1 of 2 changes accepted")).toBe("approved")
    expect(eventKind("Round about things")).toBeNull()
    expect(eventKind("c1: because")).toBeNull()
  })

  it("splits a comment reference from the post", () => {
    expect(commentPost("c1 · t.txt:3\nWhy this line?")).toEqual({ ref: "c1", where: "t.txt:3", body: "Why this line?" })
    expect(commentPost("c2: the old line raced")).toEqual({ ref: "c2", where: null, body: "the old line raced" })
    expect(commentPost("plain")).toEqual({ ref: null, where: null, body: "plain" })
  })
})
