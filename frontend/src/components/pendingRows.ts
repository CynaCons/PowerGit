import { useEffect, useState } from "react"
import {
  describeThrown,
  isAbort,
  useEngine,
  type DiffDto,
  type DiffOptions,
  type FileChange,
  type RepoStatus,
} from "../engine"
import { INDEX_ID, WORKTREE_ID } from "../graph/artificial"
import type { GraphRow } from "../graph/types"
import type { Loadable } from "./loadable"

// The bottom panel's data for the pending-change rows (v0.14.1): files come
// from the status the app already holds, diffs from the worktree diff the
// commit dialog uses. Review only; staging lives in the commit dialog.

export type Pending = { kind: "worktree" | "index"; staged: boolean; files: FileChange[]; count: number } | null

export function pendingOf(current: GraphRow | undefined, status: RepoStatus | null): Pending {
  if (!current?.artificial || !status) return null
  const staged = current.rev.id === INDEX_ID
  const list = staged ? status.staged : status.unstaged
  if (current.rev.id !== WORKTREE_ID && !staged) return null
  return {
    kind: staged ? "index" : "worktree",
    staged,
    files: list.map((f) => ({ path: f.path, status: f.status, binary: false })),
    count: list.length,
  }
}

/** Loads one pending file's worktree diff; latest selection wins. */
export function usePendingDiff(pending: Pending, file: string | null, options: DiffOptions): Loadable<DiffDto> {
  const engine = useEngine()
  const [diff, setDiff] = useState<Loadable<DiffDto>>({ kind: "idle" })
  useEffect(() => {
    if (!pending || !file) {
      setDiff({ kind: "idle" })
      return
    }
    const ctrl = new AbortController()
    setDiff((d) => (d.kind === "ready" ? { ...d, stale: true } : { kind: "loading" }))
    engine
      .workTreeDiff(file, pending.staged, options, ctrl.signal)
      .then((d) => {
        if (!ctrl.signal.aborted) setDiff({ kind: "ready", value: d })
      })
      .catch((e: unknown) => {
        if (!ctrl.signal.aborted && !isAbort(e)) setDiff({ kind: "error", message: describeThrown(e) })
      })
    return () => ctrl.abort()
  }, [engine, pending, file, options])
  return diff
}
