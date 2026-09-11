import { useState } from "react"
import type { GraphRow } from "../../graph/types"
import { copyToClipboard } from "../clipboard"
import type { FileHistoryOptions } from "../fileHistoryModel"
import { CherryPickDialog } from "./CherryPickDialog"
import { buildFileHistoryMenu } from "./fileHistoryMenuModel"
import { NodeMenu } from "./NodeMenu"
import { revisionCopyText, type MenuNode } from "./revisionMenuModel"
import { RevertDialog } from "./RevertDialog"

// Git Extensions' FormFileHistory menu on the file history's grid (v0.16.0
// review, finding 2). The item set is fileHistoryMenuModel.ts; NodeMenu
// draws it like the Browse menu; this file dispatches the clicks: the copy
// fields and the cherry-pick / revert dialogs are the Browse menu's own,
// the difftool goes through the view (which knows the path at the row and
// the pending rows' staged side), the follow items toggle the view's
// options.

export type FileHistoryMenuTarget = { x: number; y: number; row: GraphRow }

export function FileHistoryContextMenu({
  target,
  options,
  onOptions,
  onDifftool,
  onClose,
}: {
  target: FileHistoryMenuTarget | null
  options: Pick<FileHistoryOptions, "follow" | "exact">
  onOptions: (patch: Partial<FileHistoryOptions>) => void
  /** "Open with difftool" (the row against its parent) or, with `local`, the row against the working tree. */
  onDifftool: (row: GraphRow, local: boolean) => void
  onClose: () => void
}) {
  const [cherryPickTarget, setCherryPickTarget] = useState<GraphRow | null>(null)
  const [revertTarget, setRevertTarget] = useState<GraphRow | null>(null)
  const row = target?.row
  const nodes = row
    ? buildFileHistoryMenu({
        sha: row.rev.id,
        artificial: Boolean(row.artificial),
        follow: options.follow,
        exact: options.exact,
      })
    : []

  function run(node: MenuNode) {
    if (!row) return
    onClose()
    if (node.id.startsWith("ctx-copy-")) return void copyToClipboard(revisionCopyText(row.rev, node.value))
    switch (node.id) {
      case "fh-difftool":
        return onDifftool(row, false)
      case "fh-difftool-local":
        return onDifftool(row, true)
      case "fh-revert":
        return setRevertTarget(row)
      case "fh-cherry-pick":
        return setCherryPickTarget(row)
      case "fh-follow":
        return onOptions({ follow: !options.follow })
      case "fh-follow-exact":
        return onOptions({ exact: !options.exact })
    }
  }

  return (
    <>
      <NodeMenu id="file-history-context-menu" position={target} nodes={nodes} onRun={run} onClose={onClose} />
      {cherryPickTarget && (
        <CherryPickDialog
          open
          commit={cherryPickTarget.rev.id}
          subject={cherryPickTarget.rev.message}
          onClose={() => setCherryPickTarget(null)}
        />
      )}
      {revertTarget && (
        <RevertDialog
          open
          commit={revertTarget.rev.id}
          subject={revertTarget.rev.message}
          onClose={() => setRevertTarget(null)}
        />
      )}
    </>
  )
}
