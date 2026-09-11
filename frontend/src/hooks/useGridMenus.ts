import type { GraphRow } from "../graph/types"
import type { Dialogs, RefKind } from "./useDialogs"
import { useStable } from "./useStable"

export type GridMenus = {
  /** Right-click on a row: the revision menu. `previousSha` is the selection
   *  before the click moved it, which is what "Compare selected commits" means. */
  rowContextMenu: (e: React.MouseEvent, row: GraphRow, previousSha: string | null) => void
  /** Right-click on a ref chip (v0.15.0): the ref's own menu. */
  refContextMenu: (e: React.MouseEvent, name: string, kind: RefKind, sha: string | null) => void
}

// The two grid menus as stable callbacks, shared by the main grid and the
// file history's (v0.16.0), so both open the same RevisionContextMenu and
// RefContextMenu from AppDialogs.
export function useGridMenus(open: Dialogs["open"], currentBranch: string | undefined): GridMenus {
  return useStable<GridMenus>({
    rowContextMenu: (e, row, previousSha) => {
      e.preventDefault()
      open({ kind: "context", target: { x: e.clientX, y: e.clientY, row, previousSha } })
    },
    refContextMenu: (e, name, kind, sha) => {
      const current = kind === "local" && name === currentBranch
      open({ kind: "refContext", target: { x: e.clientX, y: e.clientY, name, kind, current, sha } })
    },
  })
}
