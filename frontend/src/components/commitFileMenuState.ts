import { useEffect, useState, useSyncExternalStore } from "react"
import type { EngineClient, StatusFile } from "../engine"
import { hiddenFiles } from "../engine/files"
import type { HiddenView } from "./commitFileMenuModel"

// What the commit dialog's file menu needs beyond its target row (v0.16.0),
// kept between the two lists (CommitFileLists.tsx) and the menu
// (CommitFileContextMenu.tsx) without going through CommitDialog.tsx:
//
// - each list's rows and selection, so a multi-select action knows its
//   files and a check item knows its flags — the dialog only hands the menu
//   the row under the pointer and a count;
// - the "Show skip-worktree files" / "Show assumed-unchanged files" view
//   (Git Extensions keeps them in the list's Settings drop-down), persisted
//   like GE's AppSettings;
// - the program last typed into "Open with…".
//
// One commit dialog per window, so a module store is the whole state.

export type ListSnapshot = { files: StatusFile[]; selected: Set<string> }

const VIEW_KEY = "powergit.commit.showHidden"
const OPEN_WITH_KEY = "powergit.commit.openWith"

function readView(): HiddenView {
  try {
    const raw = localStorage.getItem(VIEW_KEY)
    if (raw) {
      const v = JSON.parse(raw) as Partial<HiddenView>
      return { skipWorktree: Boolean(v.skipWorktree), assumeUnchanged: Boolean(v.assumeUnchanged) }
    }
  } catch {
    // storage blocked or garbage: the GE default is both off
  }
  return { skipWorktree: false, assumeUnchanged: false }
}

let lists: { unstaged: ListSnapshot | null; staged: ListSnapshot | null } = { unstaged: null, staged: null }
let view: HiddenView = readView()
const listeners = new Set<() => void>()

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function emit() {
  for (const listener of listeners) listener()
}

/** A list publishes its rows and selection whenever they change (null on unmount). */
export function publishFileList(staged: boolean, snapshot: ListSnapshot | null) {
  const key = staged ? "staged" : "unstaged"
  if (lists[key] === snapshot) return
  lists = { ...lists, [key]: snapshot }
  emit()
}

export function useFileList(staged: boolean): ListSnapshot | null {
  return useSyncExternalStore(subscribe, () => (staged ? lists.staged : lists.unstaged))
}

export function useHiddenView(): HiddenView {
  return useSyncExternalStore(subscribe, () => view)
}

export function setHiddenView(patch: Partial<HiddenView>) {
  view = { ...view, ...patch }
  try {
    localStorage.setItem(VIEW_KEY, JSON.stringify(view))
  } catch {
    // per-window then
  }
  emit()
}

export function rememberedOpenWith(): string {
  try {
    return localStorage.getItem(OPEN_WITH_KEY) ?? ""
  } catch {
    return ""
  }
}

export function rememberOpenWith(program: string) {
  try {
    localStorage.setItem(OPEN_WITH_KEY, program)
  } catch {
    // not remembered, still opened
  }
}

/**
 * The skip-worktree / assume-unchanged files git leaves out of status, for
 * the Unstaged list to show when a view toggle is on. Re-read on every new
 * `files` array — that is the dialog handing the list a fresh status — so a
 * flag toggled from the menu shows up with the same refresh that dropped
 * (or restored) the ordinary row. Nothing is fetched while both toggles are
 * off, which is the Git Extensions default.
 */
export function useHiddenFiles(engine: EngineClient, enabled: boolean, files: StatusFile[]): StatusFile[] {
  const [hidden, setHidden] = useState<StatusFile[]>([])
  useEffect(() => {
    if (!enabled || !engine.hasRepo) {
      setHidden([])
      return
    }
    const ctrl = new AbortController()
    hiddenFiles(engine, ctrl.signal)
      .then((list) => {
        if (!ctrl.signal.aborted) setHidden(list)
      })
      .catch(() => {
        if (!ctrl.signal.aborted) setHidden([])
      })
    return () => ctrl.abort()
    // `files` is the refresh trigger, not an input: see above.
  }, [engine, enabled, files])
  return hidden
}
