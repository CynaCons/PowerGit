import { useState } from "react"

// Left column of the commit dialog (v0.14.0, owner: "we can't resize the
// panels on the left" and "toggle between file-by-file full path or
// hierarchical display, like we did in the diff view"): its width and its
// list mode, both persisted per user.
export const COMMIT_FILES_WIDTH_KEY = "pg.commitFilesWidth"
export const COMMIT_TREE_KEY = "pg.commitTree"
export const DEFAULT_COMMIT_FILES_WIDTH = 380
export const MIN_COMMIT_FILES_WIDTH = 220
export const MAX_COMMIT_FILES_WIDTH_RATIO = 0.6

function readStored(key: string): string | null {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

export function storeCommitLayout(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value)
  } catch {
    // Storage refused: the choice still applies for this window.
  }
}

export function useCommitFilesLayout() {
  const [filesWidth, setFilesWidth] = useState<number>(() => {
    const n = Number(readStored(COMMIT_FILES_WIDTH_KEY))
    return Number.isFinite(n) && n > 0 ? n : DEFAULT_COMMIT_FILES_WIDTH
  })
  const [treeMode, setTreeMode] = useState<boolean>(() => readStored(COMMIT_TREE_KEY) === "1")
  const toggleTree = () =>
    setTreeMode((t) => {
      storeCommitLayout(COMMIT_TREE_KEY, t ? "0" : "1")
      return !t
    })
  const commitWidth = (w: number) => storeCommitLayout(COMMIT_FILES_WIDTH_KEY, String(Math.round(w)))
  return { filesWidth, setFilesWidth, commitWidth, treeMode, toggleTree }
}
