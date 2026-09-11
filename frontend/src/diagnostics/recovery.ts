import { report } from "../diagnostics"
import { isTauriShell } from "../shell"

// The recovery ladder the owner can drive while the picture is frozen
// (v0.15.6, Ubuntu freeze taskforce). IPC is proven alive during the freeze
// — heartbeats and snapshot presses reached the shell every time — so a
// hotkey or a button can still ask the shell to poke the window. The shell's
// `recover` command only enqueues a main-thread closure and logs
// `recover #<n> <key>: requested / done / probe ...` to engine.log; the nine
// steps and their keys are the contract shared with frontend/src-tauri.

export type RecoveryStep = {
  step: number
  key: string
  /** One line: what the shell does for this step. */
  meaning: string
}

export const RECOVERY_STEPS: readonly RecoveryStep[] = [
  { step: 1, key: "queue_draw", meaning: "ask GTK to redraw the window" },
  { step: 2, key: "thaw", meaning: "thaw the window's frozen update clock" },
  { step: 3, key: "hide_show", meaning: "hide the window, then show it again" },
  { step: 4, key: "resize", meaning: "grow the window by one pixel, then shrink it back" },
  { step: 5, key: "present", meaning: "present the window to the window manager again" },
  { step: 6, key: "frame_sync_off_hide_show", meaning: "switch off X11 frame sync, then hide and show" },
  { step: 7, key: "reload", meaning: "reload the page in the same window" },
  { step: 8, key: "new_window", meaning: "open a second window on the same page" },
  { step: 9, key: "webview_snapshot", meaning: "ask WebKit for a picture of the page (5 s timeout)" },
]

/** The order worth trying first under the leading hypothesis (frozen X11 frame clock). */
export const RECOVERY_TRY_FIRST: readonly number[] = [3, 6, 8]

export function recoveryStep(step: number): RecoveryStep | undefined {
  return RECOVERY_STEPS.find((s) => s.step === step)
}

/**
 * Ask the shell to run one recovery step. Reports to the diagnostics ring
 * first so frontend.log carries the press even if the invoke never returns.
 * Resolves with the step key the shell answered, or null in the browser
 * (no shell to ask).
 */
export async function requestRecovery(step: number): Promise<string | null> {
  if (!recoveryStep(step)) throw new Error(`recovery: unknown step ${step}`)
  if (!isTauriShell()) return null
  report("info", "recovery", `step ${step} requested`)
  const { invoke } = await import("@tauri-apps/api/core")
  return invoke<string>("recover", { step })
}
