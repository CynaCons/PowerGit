import { describe, expect, it } from "vitest"
import {
  initialUpdateState,
  progressPercent,
  progressText,
  updateReducer,
  type UpdateEvent,
  type UpdateState,
} from "./updateMachine"

const update = { version: "0.14.1", notes: "Fixes", date: "2026-09-08T10:00:00Z" }

function run(events: UpdateEvent[], from: UpdateState = initialUpdateState): UpdateState {
  return events.reduce(updateReducer, from)
}

describe("updateReducer", () => {
  it("check → none is up to date", () => {
    expect(run([{ type: "check" }, { type: "none", current: "0.14.0" }])).toEqual({
      phase: "upToDate",
      current: "0.14.0",
    })
  })

  it("check → found is available", () => {
    expect(run([{ type: "check" }, { type: "found", update }])).toEqual({ phase: "available", update })
  })

  it("install downloads with progress and ends ready", () => {
    const s = run([
      { type: "check" },
      { type: "found", update },
      { type: "install" },
      { type: "started", total: 1000 },
      { type: "progress", chunk: 400 },
      { type: "progress", chunk: 600 },
    ])
    expect(s).toEqual({ phase: "downloading", update, received: 1000, total: 1000 })
    expect(updateReducer(s, { type: "finished" })).toEqual({ phase: "ready", update })
  })

  it("a failure keeps the update so Retry can install again", () => {
    const s = run([
      { type: "check" },
      { type: "found", update },
      { type: "install" },
      { type: "failed", message: "net" },
    ])
    expect(s).toEqual({ phase: "error", message: "net", update })
    expect(updateReducer(s, { type: "install" }).phase).toBe("downloading")
  })

  it("a second check resets, except while downloading", () => {
    expect(run([{ type: "check" }, { type: "none", current: "1" }, { type: "check" }])).toEqual({ phase: "checking" })
    const dl = run([{ type: "check" }, { type: "found", update }, { type: "install" }])
    expect(updateReducer(dl, { type: "check" })).toBe(dl)
  })

  it("results that arrive outside a check are ignored", () => {
    expect(updateReducer(initialUpdateState, { type: "found", update })).toEqual(initialUpdateState)
    expect(updateReducer(initialUpdateState, { type: "install" })).toEqual(initialUpdateState)
  })
})

describe("progress helpers", () => {
  it("formats megabytes and percent", () => {
    expect(progressText(3_355_443, 124_780_544)).toBe("3.2 MB of 119.0 MB")
    expect(progressText(1_048_576, null)).toBe("1.0 MB")
    expect(progressPercent(50, 200)).toBe(25)
    expect(progressPercent(50, null)).toBeNull()
    expect(progressPercent(500, 200)).toBe(100)
  })
})
