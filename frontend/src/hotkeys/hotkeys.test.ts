import { expect, test } from "vitest"
import { CATALOG, commandsInScope } from "./catalog"
import { resolveHotkey } from "./dispatch"
import { chord, chordsEqual, formatChord, fromEvent, isTextEditKey, type Chord } from "./parse"

function fakeEvent(key: string, mods: { ctrl?: boolean; shift?: boolean; alt?: boolean } = {}): KeyboardEvent {
  return {
    key,
    ctrlKey: Boolean(mods.ctrl),
    shiftKey: Boolean(mods.shift),
    altKey: Boolean(mods.alt),
    metaKey: false,
  } as KeyboardEvent
}

test("parse matches Git Extensions Ctrl+Space / Ctrl+, / Ctrl+.", () => {
  expect(fromEvent(fakeEvent(" ", { ctrl: true }))).toEqual(chord("Space", { ctrl: true }))
  expect(fromEvent(fakeEvent(",", { ctrl: true }))).toEqual(chord(",", { ctrl: true }))
  expect(fromEvent(fakeEvent(".", { ctrl: true }))).toEqual(chord(".", { ctrl: true }))
  expect(fromEvent(fakeEvent("s"))).toEqual(chord("S"))
  expect(fromEvent(fakeEvent("E", { ctrl: true, shift: true }))).toEqual(chord("E", { ctrl: true, shift: true }))
})

test("formatChord is GE-like", () => {
  expect(formatChord(chord("Space", { ctrl: true }))).toBe("Ctrl+Space")
  expect(formatChord(chord("E", { ctrl: true, shift: true }))).toBe("Ctrl+Shift+E")
  expect(formatChord(chord("ArrowUp", { ctrl: true, alt: true }))).toBe("Ctrl+Alt+Up")
  expect(formatChord(chord("S"))).toBe("S")
})

test("IsTextEditKey port: S types, Ctrl+Space does not", () => {
  expect(isTextEditKey(chord("S"), true)).toBe(true)
  expect(isTextEditKey(chord("U"), true)).toBe(true)
  expect(isTextEditKey(chord("Space", { ctrl: true }), true)).toBe(false)
  expect(isTextEditKey(chord("F5"), true)).toBe(false)
  expect(isTextEditKey(chord("A", { ctrl: true }), true)).toBe(true)
  expect(isTextEditKey(chord("ArrowDown"), false)).toBe(false)
  expect(isTextEditKey(chord("ArrowDown"), true)).toBe(true)
})

test("available chords in a scope are unique", () => {
  for (const scope of ["browse", "commit"] as const) {
    const bound = commandsInScope(scope).filter((c) => c.available && c.chord)
    for (let i = 0; i < bound.length; i++) {
      for (let j = i + 1; j < bound.length; j++) {
        expect(chordsEqual(bound[i].chord!, bound[j].chord!), `${bound[i].id} vs ${bound[j].id}`).toBe(false)
      }
    }
  }
})

test("unavailable commands stay unbound (GitBash)", () => {
  const gitBash = CATALOG.find((c) => c.id === "browse.gitBash")
  expect(gitBash?.available).toBe(false)
  expect(
    resolveHotkey("browse", chord("G", { ctrl: true }), { editing: false, multiLine: false, fileListFocused: false }),
  ).toBeNull()
})

test("browse Ctrl+Space opens commit", () => {
  expect(
    resolveHotkey("browse", chord("Space", { ctrl: true }), { editing: false, multiLine: false, fileListFocused: false }),
  ).toBe("browse.commit")
})

test("S stages only when a file list is focused", () => {
  const s = chord("S")
  expect(resolveHotkey("commit", s, { editing: false, multiLine: false, fileListFocused: true })).toBe("diff.stageSelected")
  expect(resolveHotkey("commit", s, { editing: true, multiLine: true, fileListFocused: false })).toBeNull()
  expect(resolveHotkey("commit", s, { editing: false, multiLine: false, fileListFocused: false })).toBeNull()
})

test("U unstages only when a file list is focused", () => {
  expect(resolveHotkey("commit", chord("U"), { editing: false, multiLine: false, fileListFocused: true })).toBe(
    "diff.unstageSelected",
  )
  expect(resolveHotkey("commit", chord("U"), { editing: true, multiLine: true, fileListFocused: false })).toBeNull()
})

test("GE default chords we claim", () => {
  const want: Record<string, Chord> = {
    "browse.commit": chord("Space", { ctrl: true }),
    "browse.openRepo": chord("O", { ctrl: true }),
    "browse.openSettings": chord(",", { ctrl: true }),
    "browse.createBranch": chord("B", { ctrl: true }),
    "browse.createTag": chord("T", { ctrl: true }),
    "browse.checkoutBranch": chord(".", { ctrl: true }),
    "browse.rebase": chord("E", { ctrl: true, shift: true }),
    "browse.pull": chord("ArrowDown", { ctrl: true }),
    "browse.push": chord("ArrowUp", { ctrl: true }),
    "browse.quickFetch": chord("ArrowDown", { ctrl: true, shift: true }),
    "browse.quickPull": chord("P", { ctrl: true, shift: true }),
    "browse.quickPush": chord("ArrowUp", { ctrl: true, shift: true }),
    "browse.quickPullOrFetch": chord("F8"),
    "browse.stash": chord("ArrowUp", { ctrl: true, alt: true }),
    "browse.stashPop": chord("ArrowDown", { ctrl: true, alt: true }),
    "browse.toggleLeftPanel": chord("C", { ctrl: true, alt: true }),
    "browse.focusLeftPanel": chord("0", { ctrl: true }),
    "browse.focusRevisionGrid": chord("1", { ctrl: true }),
    "browse.focusCommitInfo": chord("2", { ctrl: true }),
    "browse.focusDiff": chord("3", { ctrl: true }),
    "browse.focusFileTree": chord("4", { ctrl: true }),
    "diff.stageSelected": chord("S"),
    "diff.unstageSelected": chord("U"),
    "browse.refresh": chord("F5"),
  }
  for (const [id, c] of Object.entries(want)) {
    const def = CATALOG.find((x) => x.id === id)
    expect(def, id).toBeTruthy()
    expect(def!.available, id).toBe(true)
    expect(chordsEqual(def!.chord!, c), id).toBe(true)
  }
})
