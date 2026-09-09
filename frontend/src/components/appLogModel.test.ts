import { describe, expect, it } from "vitest"
import type { DiagnosticEntry } from "../diagnostics"
import { copyAppLogText, diagnosticText, entryTime, filterDiagnostics } from "./appLogModel"

const entry = (over: Partial<DiagnosticEntry> = {}): DiagnosticEntry => ({
  at: "2026-09-09T18:04:05.123Z",
  level: "info",
  source: "console",
  message: "hello",
  ...over,
})

describe("filterDiagnostics", () => {
  const entries = [
    entry({ message: "engine unreachable", level: "error", source: "engine.health" }),
    entry({ message: "window blur focused=false", source: "window" }),
    entry({ message: "refresh 3 end ms=120 failed=false", source: "refresh" }),
  ]

  it("keeps everything for a blank filter", () => {
    expect(filterDiagnostics(entries, "   ")).toHaveLength(3)
  })

  it("matches the source and the message, case-insensitively", () => {
    expect(filterDiagnostics(entries, "WINDOW")).toHaveLength(1)
    expect(filterDiagnostics(entries, "unreachable")).toHaveLength(1)
  })

  it("matches the level, so 'error' finds the failures", () => {
    expect(filterDiagnostics(entries, "error")).toHaveLength(1)
  })

  it("requires every term, so two words narrow rather than widen", () => {
    expect(filterDiagnostics(entries, "refresh failed")).toHaveLength(1)
    expect(filterDiagnostics(entries, "refresh unreachable")).toHaveLength(0)
  })

  it("returns a copy, never the caller's array", () => {
    const source = [entry()]
    expect(filterDiagnostics(source, "")).not.toBe(source)
  })
})

describe("text", () => {
  it("renders one entry with its timestamp, level and source", () => {
    expect(diagnosticText(entry())).toBe("2026-09-09T18:04:05.123Z [info] console: hello")
  })

  it("joins the log with newlines for the copy button", () => {
    expect(copyAppLogText([entry(), entry({ message: "again" })]).split("\n")).toHaveLength(2)
  })

  it("shows the clock, since the date repeats on every row", () => {
    expect(entryTime("2026-09-09T18:04:05.123Z")).toBe("18:04:05.123")
  })
})
