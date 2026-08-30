/** KeyboardEvent → Git Extensions-style chord. Ctrl is Ctrl; Meta is not remapped. */

export type Chord = {
  key: string
  ctrl: boolean
  shift: boolean
  alt: boolean
}

export function chord(key: string, mods: { ctrl?: boolean; shift?: boolean; alt?: boolean } = {}): Chord {
  return { key, ctrl: Boolean(mods.ctrl), shift: Boolean(mods.shift), alt: Boolean(mods.alt) }
}

export function chordsEqual(a: Chord, b: Chord): boolean {
  return a.key === b.key && a.ctrl === b.ctrl && a.shift === b.shift && a.alt === b.alt
}

const KEY_ALIAS: Record<string, string> = {
  " ": "Space",
  Spacebar: "Space",
  Esc: "Escape",
  Del: "Delete",
  Down: "ArrowDown",
  Up: "ArrowUp",
  Left: "ArrowLeft",
  Right: "ArrowRight",
}

export function fromEvent(e: KeyboardEvent): Chord {
  let key = KEY_ALIAS[e.key] ?? e.key
  if (key.length === 1) key = key.toUpperCase()
  return {
    key,
    ctrl: e.ctrlKey,
    shift: e.shiftKey,
    alt: e.altKey,
  }
}

export function isModifierOnly(c: Chord): boolean {
  return ["CONTROL", "SHIFT", "ALT", "META", "CONTROLLEFT", "CONTROLRIGHT", "SHIFTLEFT", "SHIFTRIGHT", "ALTLEFT", "ALTRIGHT"].includes(
    c.key.toUpperCase(),
  )
}

export function isBareLetter(c: Chord): boolean {
  return !c.ctrl && !c.alt && /^[A-Z]$/.test(c.key)
}

/** Port of GitExtensionsControl.IsTextEditKey. Shift is ignored on the first pass. */
export function isTextEditKey(c: Chord, multiLine = false): boolean {
  if (!c.ctrl && !c.alt) {
    if (/^[A-Z0-9]$/.test(c.key)) return true
    if (c.key === "Space" || c.key === "Insert") return true
    if (c.key.length === 1 && !/[A-Z0-9]/i.test(c.key)) return true
  }
  if (c.alt) return false
  if (c.ctrl && ["A", "C", "V", "X", "Y", "Z"].includes(c.key)) return true
  if (!c.ctrl && ["Backspace", "Delete", "ArrowLeft", "ArrowRight", "Home", "End"].includes(c.key)) return true
  if (c.ctrl && ["Backspace", "Delete", "ArrowLeft", "ArrowRight", "Home", "End"].includes(c.key)) return true
  if (multiLine && !c.ctrl && ["ArrowUp", "ArrowDown", "PageUp", "PageDown"].includes(c.key)) return true
  return false
}

const DISPLAY: Record<string, string> = {
  Space: "Space",
  ArrowUp: "Up",
  ArrowDown: "Down",
  ArrowLeft: "Left",
  ArrowRight: "Right",
  PageUp: "PageUp",
  PageDown: "PageDown",
  ".": ".",
  ",": ",",
  "\\": "\\",
  Tab: "Tab",
}

export function formatChord(c: Chord): string {
  const parts: string[] = []
  if (c.ctrl) parts.push("Ctrl")
  if (c.alt) parts.push("Alt")
  if (c.shift) parts.push("Shift")
  parts.push(DISPLAY[c.key] ?? c.key)
  return parts.join("+")
}
