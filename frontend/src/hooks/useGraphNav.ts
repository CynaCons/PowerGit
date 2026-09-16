import { useCallback, useEffect, useMemo, useRef } from "react"
import { findRefTarget } from "../components/refChipsModel"
import type { EngineClient, RefTree, RepoInfo } from "../engine"
import { NavHistory, navTargets, ParentChildMemory, rowOf, type NavTargets } from "../graph/graphNav"
import type { GraphRow } from "../graph/types"
import { useHotkeyLayer } from "../hotkeys"
import type { Dialogs } from "./useDialogs"
import type { FileHistory } from "./useFileHistory"
import type { GraphRefFilter } from "./useGraphRefFilter"
import type { History } from "./useHistory"
import type { StatusNotes } from "./useStatusNote"

// Graph navigation (v0.18.12): the compass's and the chords' actions over
// the loaded rows. The model is graph/graphNav.ts; this hook owns the two
// memories (the selection history for Alt+←/→, the parent↔child way back),
// registers the five chords on a browse layer of its own, and the "not
// loaded yet" path: a target below the loaded window pages through
// useHistory.jumpToCommit, a target the history cannot reach gets a status
// note instead of an error banner.

export type GraphNavDeps = {
  /** The grid's rows, pending rows included (App's `rows`). */
  rows: GraphRow[]
  /** The selected row (App's `current`). */
  current: GraphRow | undefined
  history: Pick<History, "setSelectedSha" | "jumpToCommit" | "loadingTarget">
  notes: Pick<StatusNotes, "setNote">
  /** HEAD's SHA from the ref tree, for when its row is not loaded (an old
   *  checkout far below newer branches). */
  refs: RefTree | null
  repo: Pick<RepoInfo, "branch"> | null
  /** The ref filter (v0.18.5) on: a miss is "Not in the filtered graph". */
  graphFilter: Pick<GraphRefFilter, "filter">
  /** A repository switch (a new repoId) forgets both memories. */
  client: Pick<EngineClient, "repoId">
  /** The chords are gated like any browse layer: off under a modal dialog
   *  (dialogs.hotkeysEnabled) and while the file history covers the grid. */
  fileHistory: Pick<FileHistory, "target">
  dialogs: Pick<Dialogs, "hotkeysEnabled">
}

export type GraphNav = ReturnType<typeof useGraphNav>

export function useGraphNav({
  rows,
  current,
  history,
  notes,
  refs,
  repo,
  graphFilter,
  client,
  fileHistory,
  dialogs,
}: GraphNavDeps) {
  const { setSelectedSha, jumpToCommit, loadingTarget } = history
  const enabled = dialogs.hotkeysEnabled && !fileHistory.target
  const filtered = graphFilter.filter !== undefined
  const branch = repo?.branch ?? null
  const selection = useRef(new NavHistory())
  const memory = useRef(new ParentChildMemory())
  const currentSha = current?.rev.id ?? null

  useEffect(() => {
    selection.current.clear()
    memory.current.clear()
  }, [client.repoId])

  // Every selection change, however it happened, reaches both memories:
  // the history records it, the way back keeps only its own move.
  useEffect(() => {
    memory.current.settle(currentSha)
    if (currentSha) selection.current.push(currentSha)
  }, [currentSha])

  // Recomputed with the rows or the selection. The memory answers for the
  // selected row only when it moved there itself or settled on it, so the
  // render before the effect above cannot show a stale way back.
  const targets = useMemo<NavTargets>(() => navTargets(rows, current, memory.current), [rows, current])

  /** Selects a loaded row directly; pages to one below the window. */
  const select = useCallback(
    (sha: string) => {
      if (rowOf(rows, sha)) {
        setSelectedSha(sha)
        return
      }
      void jumpToCommit(sha).then((found) => {
        if (found) return
        memory.current.clear()
        notes.setNote({ text: filtered ? "Not in the filtered graph" : "Not in the loaded history" })
      })
    },
    [rows, setSelectedSha, jumpToCommit, notes, filtered],
  )

  /** Ctrl+P / the ↓ button: the remembered way back, else the first parent;
   *  `index` picks another parent of a merge from the list. */
  const goToParent = useCallback(
    (index?: number) => {
      if (!targets.sha) return
      const target = index === undefined ? targets.parent : (targets.parents[index] ?? null)
      if (!target) return
      memory.current.toParent(targets.sha, target)
      select(target)
    },
    [targets, select],
  )

  /** Ctrl+N / the ↑ button: the remembered way back, else the first loaded child. */
  const goToChild = useCallback(() => {
    if (!targets.sha || !targets.child) return
    memory.current.toChild(targets.sha, targets.child)
    select(targets.child)
  }, [targets, select])

  /** Ctrl+Shift+C / ⌂: the checked-out commit (GE SelectCurrentRevision).
   *  HEAD's row not loaded: its SHA comes from the ref tree and pages in. */
  const goToHead = useCallback(() => {
    const head = targets.head ?? (branch ? findRefTarget(refs, branch) : null)
    if (!head || targets.atHead) return
    select(head)
  }, [targets, refs, branch, select])

  /** Alt+← / Alt+→ over the selection history (GE NavigateBackward/Forward). */
  const back = useCallback(() => {
    const sha = selection.current.back()
    if (sha) select(sha)
  }, [select])
  const forward = useCallback(() => {
    const sha = selection.current.forward()
    if (sha) select(sha)
  }, [select])

  // Swallowed even with nowhere to go: Ctrl+P must never print, Ctrl+N
  // never open a window, Alt+← never leave the page.
  useHotkeyLayer(
    "browse",
    {
      "browse.goToParent": () => goToParent(),
      "browse.goToChild": goToChild,
      "browse.goToHead": goToHead,
      "browse.navigateBack": back,
      "browse.navigateForward": forward,
    },
    enabled,
  )

  return { targets, loadingTarget, goToParent, goToChild, goToHead, back, forward }
}
