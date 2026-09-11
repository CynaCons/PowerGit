import { useCallback, useState } from "react"
import type { FileHistoryMenuTarget } from "../components/dialogs/FileHistoryContextMenu"
import type { GridMenus } from "./useGridMenus"
import { useStable } from "./useStable"

// The file history grid's menus (v0.16.0 review, finding 2). The row menu is
// the view's own FileHistoryContextMenu, held here as local state rather
// than in App's dialogs: its actions (difftool at the row's path, the
// follow options) belong to the view. The ref chips keep the shared ref
// menu: a branch or tag is the same object whichever grid draws it.

export function useFileHistoryMenus(refContextMenu: GridMenus["refContextMenu"]): {
  menus: GridMenus
  target: FileHistoryMenuTarget | null
  close: () => void
} {
  const [target, setTarget] = useState<FileHistoryMenuTarget | null>(null)
  const menus = useStable<GridMenus>({
    rowContextMenu: (e, row) => {
      e.preventDefault()
      setTarget({ x: e.clientX, y: e.clientY, row })
    },
    refContextMenu,
  })
  const close = useCallback(() => setTarget(null), [])
  return { menus, target, close }
}
