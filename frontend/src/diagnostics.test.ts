import { afterEach, expect, test, vi } from "vitest"

const invoke = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
vi.mock("@tauri-apps/api/core", () => ({ invoke }))

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  vi.resetModules()
  invoke.mockClear()
})

test("focus loss and visibility evidence reaches the shell without waiting for timers", async () => {
  // Instrumentation for the report, not a reproduction or proof of a fix:
  // "whenever the windows loses focus on my ubuntu, it usually end up in a freeze."
  vi.useFakeTimers()
  const win = Object.assign(new EventTarget(), {
    __TAURI_INTERNALS__: {},
    setTimeout,
    clearTimeout,
    setInterval,
  })
  const doc = Object.assign(new EventTarget(), { hasFocus: () => false, visibilityState: "hidden" })
  vi.stubGlobal("window", win)
  vi.stubGlobal("document", doc)
  vi.spyOn(console, "info").mockImplementation(() => undefined)
  const { installDiagnostics } = await import("./diagnostics")
  installDiagnostics()
  win.dispatchEvent(new Event("blur"))
  doc.dispatchEvent(new Event("visibilitychange"))
  await vi.dynamicImportSettled()
  const lines = invoke.mock.calls.flatMap(([, args]) => args.lines)
  expect(lines.some((line: string) => line.includes("blur focused=false visibility=hidden"))).toBe(true)
  expect(lines.join("\n")).toContain("visibilitychange focused=false visibility=hidden")
})

test("developer tools action invokes the shell inspector command", async () => {
  vi.stubGlobal("window", { __TAURI_INTERNALS__: {} })
  const { openDeveloperTools } = await import("./diagnostics/snapshot")
  await openDeveloperTools()
  expect(invoke).toHaveBeenCalledWith("open_devtools")
})
