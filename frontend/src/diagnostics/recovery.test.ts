import { afterEach, expect, test, vi } from "vitest"

const invoke = vi.hoisted(() => vi.fn().mockResolvedValue("hide_show"))
vi.mock("@tauri-apps/api/core", () => ({ invoke }))

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
  invoke.mockClear()
})

// v0.15.6: the recovery ladder the owner drives from a frozen window. The
// shell side is `recover(step)`; this is the page's half.

test("the nine steps carry the contract keys in order", async () => {
  const { RECOVERY_STEPS, RECOVERY_TRY_FIRST } = await import("./recovery")
  expect(RECOVERY_STEPS.map((s) => s.step)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9])
  expect(RECOVERY_STEPS.map((s) => s.key)).toEqual([
    "queue_draw",
    "thaw",
    "hide_show",
    "resize",
    "present",
    "frame_sync_off_hide_show",
    "reload",
    "new_window",
    "webview_snapshot",
  ])
  for (const s of RECOVERY_STEPS) expect(s.meaning.length, s.key).toBeGreaterThan(0)
  expect(RECOVERY_TRY_FIRST).toEqual([3, 6, 8])
})

test("a request in the shell reports to the ring, then invokes recover with the step", async () => {
  vi.stubGlobal("window", Object.assign(new EventTarget(), { __TAURI_INTERNALS__: {}, setTimeout, clearTimeout }))
  const { requestRecovery } = await import("./recovery")
  const { diagnosticsSnapshot } = await import("../diagnostics")
  await expect(requestRecovery(3)).resolves.toBe("hide_show")
  expect(invoke).toHaveBeenCalledWith("recover", { step: 3 })
  const line = diagnosticsSnapshot().find((e) => e.source === "recovery")
  expect(line?.message).toBe("step 3 requested")
  expect(`${line?.source}: ${line?.message}`).toBe("recovery: step 3 requested")
})

test("in the browser a request is a no-op", async () => {
  vi.stubGlobal("window", Object.assign(new EventTarget(), { setTimeout, clearTimeout }))
  const { requestRecovery } = await import("./recovery")
  await expect(requestRecovery(8)).resolves.toBeNull()
  expect(invoke).not.toHaveBeenCalled()
})

test("an unknown step is refused before anything is logged", async () => {
  vi.stubGlobal("window", Object.assign(new EventTarget(), { __TAURI_INTERNALS__: {}, setTimeout, clearTimeout }))
  const { requestRecovery } = await import("./recovery")
  await expect(requestRecovery(10)).rejects.toThrow(/unknown step 10/)
  expect(invoke).not.toHaveBeenCalled()
})
