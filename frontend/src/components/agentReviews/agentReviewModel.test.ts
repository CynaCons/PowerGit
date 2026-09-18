import { describe, expect, it } from "vitest"
import type { AgentReviewSummary } from "../../engine"
import { ageOf, badgeOf, statusLabel } from "./agentReviewModel"

const item = (patch: Partial<AgentReviewSummary>): AgentReviewSummary => ({
  id: "a".repeat(40),
  mode: "wait",
  title: "Review",
  agent: null,
  branch: null,
  fileCount: 1,
  status: "pending",
  unread: true,
  createdAt: "2026-09-18T10:00:00Z",
  updatedAt: "2026-09-18T10:00:00Z",
  ...patch,
})
describe("agent review presentation", () => {
  it("formats useful relative ages", () => {
    const now = Date.parse("2026-09-18T12:00:00Z")
    expect(ageOf("2026-09-18T11:58:00Z", now)).toBe("2 min ago")
    expect(ageOf("2026-09-17T12:00:00Z", now)).toBe("1 day ago")
  })
  it("counts pending waits and unread notifications", () => {
    expect(badgeOf([item({ mode: "wait" }), item({ mode: "notify" }), item({ status: "approved" })])).toBe(2)
  })
  it("labels statuses", () => expect(statusLabel("changes_requested")).toBe("Changes requested"))
})
