import { describe, expect, it } from "vitest"
import type { RecentInfo } from "../engine"
import { recentGroup, relativeTime } from "./startPaneModel"

const now = new Date("2026-09-22T12:00:00Z")
const repo = (lastOpened?: string, pinned = false): RecentInfo => ({
  name: "repo",
  root: "/repo",
  branch: "main",
  id: "1",
  lastOpened,
  pinned,
})

describe("start pane time model", () => {
  it("formats the requested relative ages", () => {
    expect(relativeTime("2026-09-22T11:59:40Z", now)).toBe("now")
    expect(relativeTime("2026-09-22T10:00:00Z", now)).toBe("2 h ago")
    expect(relativeTime("2026-09-21T12:00:00Z", now)).toBe("yesterday")
    expect(relativeTime("2026-09-19T12:00:00Z", now)).toBe("3 d ago")
    expect(relativeTime("2026-09-08T12:00:00Z", now)).toBe("2 weeks ago")
  })

  it("buckets pinned, today, this week, earlier, and missing dates", () => {
    expect(recentGroup(repo("2026-01-01T00:00:00Z", true), now)).toBe("Pinned")
    expect(recentGroup(repo("2026-09-22T08:00:00Z"), now)).toBe("Today")
    expect(recentGroup(repo("2026-09-18T08:00:00Z"), now)).toBe("This week")
    expect(recentGroup(repo("2026-08-01T08:00:00Z"), now)).toBe("Earlier")
    expect(recentGroup(repo(), now)).toBe("Earlier")
  })
})
