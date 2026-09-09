import { afterEach, describe, expect, it, vi } from "vitest"
import { captureConsole, diagnosticsSnapshot, formatConsoleArgs, report } from "./diagnostics"

// v0.15.3. Owner (Ubuntu AppImage): "the fix in 0.15.2 to show the debugger
// panel did not work." The app log has to stand in for a WebKit inspector
// that will not open, so console.* must reach the ring — and must not eat
// the console on the way, or take the app down with a recursion.

let undo: (() => void) | null = null

afterEach(() => {
  undo?.()
  undo = null
  vi.restoreAllMocks()
})

const lastEntry = () => diagnosticsSnapshot()[diagnosticsSnapshot().length - 1]

describe("console capture", () => {
  it("puts a console.error in the ring and still writes to the real console", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined)
    undo = captureConsole()

    console.error("boom", 42)

    expect(spy).toHaveBeenCalledWith("boom", 42)
    expect(lastEntry()).toMatchObject({ level: "error", source: "console", message: "boom 42" })
  })

  it("maps log, info and debug to info and warn to warn", () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined)
    vi.spyOn(console, "warn").mockImplementation(() => undefined)
    undo = captureConsole()

    console.log("plain")
    expect(lastEntry()).toMatchObject({ level: "info", message: "plain" })
    console.warn("careful")
    expect(lastEntry()).toMatchObject({ level: "warn", message: "careful" })
  })

  it("does not recurse when report() echoes an error through the console", () => {
    // report() writes errors to console.error. If that echo went through the
    // replacement rather than the original, every error would report itself
    // for ever; this asserts one entry, not a stack overflow.
    vi.spyOn(console, "error").mockImplementation(() => undefined)
    undo = captureConsole()
    const before = diagnosticsSnapshot().length

    report("error", "test", "single")

    expect(diagnosticsSnapshot().length).toBe(before + 1)
  })

  it("restores the original methods when undone", () => {
    const original = console.log
    undo = captureConsole()
    expect(console.log).not.toBe(original)
    undo()
    undo = null
    expect(console.log).toBe(original)
  })

  it("is idempotent, so a second install does not double-report", () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined)
    undo = captureConsole()
    const second = captureConsole()
    const before = diagnosticsSnapshot().length

    console.log("once")

    expect(diagnosticsSnapshot().length).toBe(before + 1)
    second()
  })
})

describe("diagnosticsSnapshot", () => {
  it("returns a new reference per entry, so a subscribed view actually updates", () => {
    // The app log renders through useSyncExternalStore + useMemo, both of
    // which compare by reference. Returning the live ring made the panel
    // freeze at its first render: four entries held, one shown.
    const before = diagnosticsSnapshot()
    report("info", "test", "moved")
    const after = diagnosticsSnapshot()

    expect(after).not.toBe(before)
    expect(after.length).toBe(before.length + 1)
    // The earlier snapshot must not have grown behind the view's back.
    expect(before.length).toBe(after.length - 1)
  })

  it("is stable while nothing is reported", () => {
    report("info", "test", "settle")
    expect(diagnosticsSnapshot()).toBe(diagnosticsSnapshot())
  })
})

describe("formatConsoleArgs", () => {
  it("joins arguments and names an Error rather than printing {}", () => {
    expect(formatConsoleArgs(["a", 1, true])).toBe("a 1 true")
    expect(formatConsoleArgs([new TypeError("nope")])).toBe("TypeError: nope")
  })

  it("serialises plain objects and survives a circular one", () => {
    expect(formatConsoleArgs([{ a: 1 }])).toBe('{"a":1}')
    const loop: Record<string, unknown> = {}
    loop.self = loop
    expect(formatConsoleArgs([loop])).toBe("[object Object]")
  })

  it("caps one argument list so a dumped object cannot flush the ring", () => {
    const text = formatConsoleArgs(["x".repeat(5000)])
    expect(text.length).toBeLessThanOrEqual(2001)
    expect(text.endsWith("…")).toBe(true)
  })
})
