import { CATALOG, type CommandId, type Scope } from "./catalog"
import {
  chordsEqual,
  fromEvent,
  isBareLetter,
  isModifierOnly,
  isTextEditKey,
  type Chord,
} from "./parse"

export type HandlerMap = Partial<Record<CommandId, () => void | boolean>>

export type ResolveCtx = {
  editing: boolean
  multiLine: boolean
  fileListFocused: boolean
}

export function resolveHotkey(scope: Scope, c: Chord, ctx: ResolveCtx): CommandId | null {
  if (isModifierOnly(c)) return null
  const hit = CATALOG.find((d) => d.available && d.scope === scope && d.chord && chordsEqual(d.chord, c))
  if (!hit) return null

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

export function handleHotkey(e: KeyboardEvent, scope: Scope, handlers: HandlerMap): boolean {
  const c = fromEvent(e)
  const id = resolveHotkey(scope, c, {
    editing: isEditableElement(e.target),
    multiLine: isMultiLineElement(e.target),
    fileListFocused: isFileListSurface(e.target),
  })
  if (!id) return false
  const fn = handlers[id]
  if (!fn) return false
  const result = fn()
  return result !== false
}
