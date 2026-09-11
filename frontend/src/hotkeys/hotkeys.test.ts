import { afterEach, expect, test, vi } from "vitest"
import { CATALOG, commandsInScope, type ReviewCommandId } from "./catalog"
import { dispatchLayers, resolveHotkey, type DispatchLayer, type HandlerMap } from "./dispatch"
import { chord, chordsEqual, formatChord, fromEvent, isTextEditKey, type Chord } from "./parse"

function fakeEvent(
  key: string,
  mods: { ctrl?: boolean; shift?: boolean; alt?: boolean } = {},
  target: unknown = null,
): KeyboardEvent {
  return {
    key,
    ctrlKey: Boolean(mods.ctrl),
    shiftKey: Boolean(mods.shift),
    altKey: Boolean(mods.alt),
    metaKey: false,
    target,
  } as unknown as KeyboardEvent
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
  for (const scope of ["browse", "commit", "global", "review"] as const) {
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
    resolveHotkey("browse", chord("G", { ctrl: true }), {
      editing: false,
      multiLine: false,
      fileListFocused: false,
      reviewFocused: false,
    }),
  ).toBeNull()
})

test("browse Ctrl+Space opens commit", () => {
  expect(
    resolveHotkey("browse", chord("Space", { ctrl: true }), {
      editing: false,
      multiLine: false,
      fileListFocused: false,
      reviewFocused: false,
    }),
  ).toBe("browse.commit")
})

test("S stages only when a file list is focused", () => {
  const s = chord("S")
  expect(
    resolveHotkey("commit", s, { editing: false, multiLine: false, fileListFocused: true, reviewFocused: false }),
  ).toBe("diff.stageSelected")
  expect(
    resolveHotkey("commit", s, { editing: true, multiLine: true, fileListFocused: false, reviewFocused: false }),
  ).toBeNull()
  expect(
    resolveHotkey("commit", s, { editing: false, multiLine: false, fileListFocused: false, reviewFocused: false }),
  ).toBeNull()
})

test("U unstages only when a file list is focused", () => {
  expect(
    resolveHotkey("commit", chord("U"), {
      editing: false,
      multiLine: false,
      fileListFocused: true,
      reviewFocused: false,
    }),
  ).toBe("diff.unstageSelected")
  expect(
    resolveHotkey("commit", chord("U"), {
      editing: true,
      multiLine: true,
      fileListFocused: false,
      reviewFocused: false,
    }),
  ).toBeNull()
})

test("Ctrl+` toggles the Git console, a PowerGit command with no GE twin", () => {
  const def = CATALOG.find((c) => c.id === "browse.gitConsole")
  expect(def?.available).toBe(true)
  expect(def?.ge ?? null).toBeNull()
  expect(chordsEqual(def!.chord!, chord("`", { ctrl: true }))).toBe(true)
  expect(formatChord(def!.chord!)).toBe("Ctrl+`")
  expect(fromEvent(fakeEvent("`", { ctrl: true }))).toEqual(chord("`", { ctrl: true }))
  expect(
    resolveHotkey("browse", chord("`", { ctrl: true }), {
      editing: false,
      multiLine: false,
      fileListFocused: false,
      reviewFocused: false,
    }),
  ).toBe("browse.gitConsole")
  // It must still work while a text field has focus — it is not a text key.
  expect(
    resolveHotkey("browse", chord("`", { ctrl: true }), {
      editing: true,
      multiLine: true,
      fileListFocused: false,
      reviewFocused: false,
    }),
  ).toBe("browse.gitConsole")
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
    "browse.mergeBranch": chord("M", { ctrl: true }),
    "browse.pull": chord("ArrowDown", { ctrl: true }),
    "browse.push": chord("ArrowUp", { ctrl: true }),
    "browse.quickFetch": chord("ArrowDown", { ctrl: true, shift: true }),
    "browse.quickPull": chord("P", { ctrl: true, shift: true }),
    "browse.quickPush": chord("ArrowUp", { ctrl: true, shift: true }),
    "browse.quickPullOrFetch": chord("F8"),
    "browse.stash": chord("ArrowUp", { ctrl: true, alt: true }),
    "browse.stashPop": chord("ArrowDown", { ctrl: true, alt: true }),
    "browse.toggleLeftPanel": chord("C", { ctrl: true, alt: true }),
    "browse.focusLeftPanel": chord("L", { ctrl: true, alt: true }),
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

// v0.17.0: review mode (docs/design/review-mode.md §3).

const REVIEW_CHORDS: Record<ReviewCommandId, Chord> = {
  "review.cycle": chord("Space"),
  "review.reject": chord("X"),
  "review.down": chord("J"),
  "review.downArrow": chord("ArrowDown"),
  "review.up": chord("K"),
  "review.upArrow": chord("ArrowUp"),
  "review.bottom": chord("G", { shift: true }),
  "review.end": chord("End"),
  "review.home": chord("Home"),
  "review.top": chord("G"),
  "review.nextUnreviewed": chord("N"),
  "review.nextFile": chord("Enter"),
  "review.prevFile": chord("Enter", { shift: true }),
  "review.command": chord("/"),
}

test("review chords we claim, all PowerGit's own", () => {
  const bound = commandsInScope("review")
  expect(bound.map((c) => c.id).sort()).toEqual(Object.keys(REVIEW_CHORDS).sort())
  for (const [id, c] of Object.entries(REVIEW_CHORDS)) {
    const def = bound.find((x) => x.id === id)
    expect(def, id).toBeTruthy()
    expect(def!.available, id).toBe(true)
    expect(def!.ge, id).toBeNull()
    expect(chordsEqual(def!.chord!, c), id).toBe(true)
  }
  // The keys the owner will press arrive as these chords.
  expect(fromEvent(fakeEvent(" "))).toEqual(REVIEW_CHORDS["review.cycle"])
  expect(fromEvent(fakeEvent("x"))).toEqual(REVIEW_CHORDS["review.reject"])
  expect(fromEvent(fakeEvent("G", { shift: true }))).toEqual(REVIEW_CHORDS["review.bottom"])
  expect(fromEvent(fakeEvent("g"))).toEqual(REVIEW_CHORDS["review.top"])
  expect(fromEvent(fakeEvent("Enter", { shift: true }))).toEqual(REVIEW_CHORDS["review.prevFile"])
  expect(fromEvent(fakeEvent("/"))).toEqual(REVIEW_CHORDS["review.command"])
  expect(formatChord(REVIEW_CHORDS["review.bottom"])).toBe("Shift+G")
  expect(formatChord(REVIEW_CHORDS["review.prevFile"])).toBe("Shift+Enter")
})

test("review keys resolve only with the review surface focused and not while editing", () => {
  for (const [id, c] of Object.entries(REVIEW_CHORDS)) {
    expect(
      resolveHotkey("review", c, { editing: false, multiLine: false, fileListFocused: false, reviewFocused: true }),
      id,
    ).toBe(id)
    // The diff is not focused: the file list, the grid, a message box.
    expect(
      resolveHotkey("review", c, { editing: false, multiLine: false, fileListFocused: false, reviewFocused: false }),
      id,
    ).toBeNull()
    expect(
      resolveHotkey("review", c, { editing: false, multiLine: false, fileListFocused: true, reviewFocused: false }),
      id,
    ).toBeNull()
    // Typing in the command line or a comment box inside the surface.
    expect(
      resolveHotkey("review", c, { editing: true, multiLine: false, fileListFocused: false, reviewFocused: true }),
      id,
    ).toBeNull()
    expect(
      resolveHotkey("review", c, { editing: true, multiLine: true, fileListFocused: false, reviewFocused: true }),
      id,
    ).toBeNull()
  }
  // The review surface does not make browse's bare letters resolve.
  expect(
    resolveHotkey("browse", chord("J"), {
      editing: false,
      multiLine: false,
      fileListFocused: false,
      reviewFocused: true,
    }),
  ).toBeNull()
})

test("bare Space and Enter are bound in no other scope, so the review layer can pass them down safely", () => {
  for (const scope of ["browse", "commit", "global"] as const) {
    for (const c of [chord("Space"), chord("Enter"), chord("J"), chord("K"), chord("N"), chord("X"), chord("/")]) {
      expect(
        commandsInScope(scope).some((d) => d.chord && chordsEqual(d.chord, c)),
        `${scope} ${formatChord(c)}`,
      ).toBe(false)
    }
  }
})

// The layer walk (Host.tsx → dispatchLayers) needs a target the DOM
// predicates can classify; node has no DOM classes, so stub the two.
afterEach(() => vi.unstubAllGlobals())

class FakeElement {
  constructor(private surface: string | null) {}
  closest(selector: string) {
    return this.surface && selector.includes(`'${this.surface}'`) ? this : null
  }
}
class FakeHTMLElement extends FakeElement {
  isContentEditable = false
  constructor(
    surface: string | null,
    public tagName = "DIV",
  ) {
    super(surface)
  }
  getAttribute() {
    return null
  }
}
function stubDom() {
  vi.stubGlobal("Element", FakeElement)
  vi.stubGlobal("HTMLElement", FakeHTMLElement)
}
const reviewSurface = () => new FakeHTMLElement("review")
const commentBox = () => new FakeHTMLElement("review", "TEXTAREA")
const grid = () => new FakeHTMLElement(null)

function layers(browse: HandlerMap, review: HandlerMap): DispatchLayer[] {
  return [
    { scope: "browse", handlers: { current: browse } },
    { scope: "review", handlers: { current: review } },
  ]
}

test("the review layer over browse takes its keys and passes the rest down", () => {
  stubDom()
  const calls: string[] = []
  const stack = layers(
    {
      "browse.commit": () => void calls.push("browse.commit"),
      "browse.refresh": () => void calls.push("browse.refresh"),
    },
    { "review.cycle": () => void calls.push("review.cycle"), "review.down": () => void calls.push("review.down") },
  )
  expect(dispatchLayers(fakeEvent(" ", {}, reviewSurface()), stack)).toBe(true)
  expect(dispatchLayers(fakeEvent("j", {}, reviewSurface()), stack)).toBe(true)
  // A browse chord pressed on the review surface reaches browse.
  expect(dispatchLayers(fakeEvent(" ", { ctrl: true }, reviewSurface()), stack)).toBe(true)
  expect(dispatchLayers(fakeEvent("F5", {}, reviewSurface()), stack)).toBe(true)
  // Nothing claims it: nobody handled it.
  expect(dispatchLayers(fakeEvent("q", {}, reviewSurface()), stack)).toBe(false)
  expect(calls).toEqual(["review.cycle", "review.down", "browse.commit", "browse.refresh"])
})

test("review keys off the surface, or while typing, fall through untouched", () => {
  stubDom()
  const calls: string[] = []
  const stack = layers(
    { "browse.commit": () => void calls.push("browse.commit") },
    {
      "review.cycle": () => void calls.push("review.cycle"),
      "review.nextFile": () => void calls.push("review.nextFile"),
    },
  )
  expect(dispatchLayers(fakeEvent(" ", {}, grid()), stack)).toBe(false)
  expect(dispatchLayers(fakeEvent("Enter", {}, grid()), stack)).toBe(false)
  expect(dispatchLayers(fakeEvent(" ", {}, commentBox()), stack)).toBe(false)
  expect(dispatchLayers(fakeEvent("Enter", {}, commentBox()), stack)).toBe(false)
  // Ctrl+Space from the comment box still opens the commit dialog: not a text key.
  expect(dispatchLayers(fakeEvent(" ", { ctrl: true }, commentBox()), stack)).toBe(true)
  expect(calls).toEqual(["browse.commit"])
})

test("a handler returning false passes the key to the layer below; a missing handler too", () => {
  stubDom()
  const calls: string[] = []
  const stack: DispatchLayer[] = [
    { scope: "browse", handlers: { current: { "browse.refresh": () => void calls.push("browse.refresh") } } },
    { scope: "commit", handlers: { current: { "commit.refresh": () => void calls.push("commit.refresh") } } },
    {
      scope: "review",
      handlers: {
        current: {
          "review.top": () => {
            calls.push("review.top")
            return false // a single g: the gg timer is armed, the key is not taken
          },
        },
      },
    },
  ]
  expect(dispatchLayers(fakeEvent("g", {}, reviewSurface()), stack)).toBe(false)
  // F5: review has no F5, commit handles it first, browse never sees it.
  expect(dispatchLayers(fakeEvent("F5", {}, reviewSurface()), stack)).toBe(true)
  // Drop the commit handler: the key falls through to browse.
  stack[1].handlers.current = {}
  expect(dispatchLayers(fakeEvent("F5", {}, reviewSurface()), stack)).toBe(true)
  expect(calls).toEqual(["review.top", "commit.refresh", "browse.refresh"])
})
