import { CATALOG, type CommandId, type Scope } from "./catalog"
import { chordsEqual, fromEvent, isBareLetter, isModifierOnly, isTextEditKey, type Chord } from "./parse"

export type HandlerMap = Partial<Record<CommandId, () => void | boolean>>

export type ResolveCtx = {
  editing: boolean
  multiLine: boolean
  fileListFocused: boolean
  /** v0.17.0: the active element is inside `[data-hotkey-surface="review"]`. */
  reviewFocused: boolean
}

export function resolveHotkey(scope: Scope, c: Chord, ctx: ResolveCtx): CommandId | null {
  if (isModifierOnly(c)) return null
  const hit = CATALOG.find((d) => d.available && d.scope === scope && d.chord && chordsEqual(d.chord, c))
  if (!hit) return null

  // Review keys are bare letters, Space, Enter and arrows — text keys
  // anywhere else — so the whole scope resolves only on the review surface
  // and never while typing (the command line, a comment box).
  if (hit.scope === "review") return ctx.reviewFocused && !ctx.editing ? hit.id : null

  if (ctx.fileListFocused && (hit.id === "diff.stageSelected" || hit.id === "diff.unstageSelected")) {
    return hit.id
  }
  if (ctx.editing && isTextEditKey(c, ctx.multiLine)) return null
  if (isBareLetter(c) && !ctx.fileListFocused) return null
  return hit.id
}

export function isEditableElement(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false
  if (el.isContentEditable) return true
  const tag = el.tagName
  if (tag === "TEXTAREA" || tag === "SELECT") return true
  if (tag === "INPUT") {
    const type = (el as HTMLInputElement).type
    return !["button", "checkbox", "radio", "file", "submit", "reset", "range", "color", "hidden"].includes(type)
  }
  return false
}

export function isMultiLineElement(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false
  return el.tagName === "TEXTAREA" || el.getAttribute("aria-multiline") === "true"
}

export function isFileListSurface(el: EventTarget | null): boolean {
  if (!(el instanceof Element)) return false
  return Boolean(el.closest("[data-hotkey-surface='file-list']"))
}

export function isReviewSurface(el: EventTarget | null): boolean {
  if (!(el instanceof Element)) return false
  return Boolean(el.closest("[data-hotkey-surface='review']"))
}

export function handleHotkey(e: KeyboardEvent, scope: Scope, handlers: HandlerMap): boolean {
  const c = fromEvent(e)
  const id = resolveHotkey(scope, c, {
    editing: isEditableElement(e.target),
    multiLine: isMultiLineElement(e.target),
    fileListFocused: isFileListSurface(e.target),
    reviewFocused: isReviewSurface(e.target),
  })
  if (!id) return false
  const fn = handlers[id]
  if (!fn) return false
  const result = fn()
  return result !== false
}

export type DispatchLayer = { scope: Scope; handlers: { current: HandlerMap } }

/**
 * Walks the layer stack top to bottom (v0.17.0) and stops at the first
 * layer whose handler handles the key; a layer with no hit in its scope, no
 * handler for the hit, or a handler that returned false passes the key to
 * the one below. That is how the review layer sits over `browse` in the
 * main window and over `commit` in the dialog without eating their chords.
 * A disabled layer is not on the stack at all (useHotkeyLayer), which is how
 * a modal dialog keeps `browse` silent — not by covering it.
 */
export function dispatchLayers(e: KeyboardEvent, layers: readonly DispatchLayer[]): boolean {
  for (let i = layers.length - 1; i >= 0; i--) {
    const layer = layers[i]
    if (handleHotkey(e, layer.scope, layer.handlers.current)) return true
  }
  return false
}
