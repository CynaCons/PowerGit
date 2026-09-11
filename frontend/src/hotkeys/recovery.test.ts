import { expect, test, vi } from "vitest"
import { CATALOG, recoveryStepOf, shortcutLabel } from "./catalog"
import { handleHotkey, resolveHotkey } from "./dispatch"
import { chord, formatChord, fromEvent } from "./parse"
import { recoveryHandlers } from "./recovery"

function fakeEvent(key: string, mods: { ctrl?: boolean; shift?: boolean; alt?: boolean } = {}): KeyboardEvent {
  return {
    key,
    ctrlKey: Boolean(mods.ctrl),
    shiftKey: Boolean(mods.shift),
    altKey: Boolean(mods.alt),
    metaKey: false,
    target: null,
  } as unknown as KeyboardEvent
}

const ctx = { editing: false, multiLine: false, fileListFocused: false, reviewFocused: false }

// v0.15.6: Ctrl+Shift+F1..F9 → recovery step 1..9, in the `global` scope.

test("Ctrl+Shift+F<n> maps to recovery step n, for every n in 1..9", () => {
  for (let n = 1; n <= 9; n++) {
    const id = resolveHotkey("global", fromEvent(fakeEvent(`F${n}`, { ctrl: true, shift: true })), ctx)
    expect(id, `F${n}`).toBe(`recovery.step${n}`)
    expect(recoveryStepOf(id!)).toBe(n)
    expect(shortcutLabel(id!)).toBe(`Ctrl+Shift+F${n}`)
  }
  expect(formatChord(chord("F3", { ctrl: true, shift: true }))).toBe("Ctrl+Shift+F3")
})

test("the chords need both modifiers and stay out of the other scopes", () => {
  expect(resolveHotkey("global", chord("F3", { ctrl: true }), ctx)).toBeNull()
  expect(resolveHotkey("global", chord("F3", { shift: true }), ctx)).toBeNull()
  expect(resolveHotkey("global", chord("F3"), ctx)).toBeNull()
  expect(resolveHotkey("global", chord("F10", { ctrl: true, shift: true }), ctx)).toBeNull()
  expect(resolveHotkey("browse", chord("F3", { ctrl: true, shift: true }), ctx)).toBeNull()
  expect(resolveHotkey("commit", chord("F3", { ctrl: true, shift: true }), ctx)).toBeNull()
  expect(recoveryStepOf("browse.refresh")).toBeNull()
})

test("the chords still fire while a text field has focus (not text keys)", () => {
  expect(
    resolveHotkey("global", chord("F8", { ctrl: true, shift: true }), {
      editing: true,
      multiLine: true,
      fileListFocused: false,
      reviewFocused: false,
    }),
  ).toBe("recovery.step8")
})

test("recoveryHandlers covers the nine commands and hands the step to run", () => {
  // handleHotkey asks whether the target is editable; node has no DOM classes.
  vi.stubGlobal("HTMLElement", class {})
  vi.stubGlobal("Element", class {})
  const run = vi.fn()
  const handlers = recoveryHandlers(run)
  const ids = CATALOG.filter((c) => c.scope === "global").map((c) => c.id)
  expect(ids).toHaveLength(9)
  for (const id of ids) expect(handlers[id], id).toBeTypeOf("function")
  expect(handleHotkey(fakeEvent("F6", { ctrl: true, shift: true }), "global", handlers)).toBe(true)
  expect(run).toHaveBeenCalledWith(6)
  expect(handleHotkey(fakeEvent("F6", { ctrl: true }), "global", handlers)).toBe(false)
  expect(run).toHaveBeenCalledTimes(1)
})
