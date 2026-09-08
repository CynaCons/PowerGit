import { useCallback, useState } from "react"
import type { RebaseOptions, RebaseTodo } from "../engine"
import type { GraphRow } from "../graph/types"

export type ContextTarget = {
  x: number
  y: number
  row: GraphRow
  /** The grid selection before the right-click moved it (Compare ▸ selected commits). */
  previousSha?: string | null
}

export type RefKind = "local" | "remote" | "tag"

/** A ref chip or tree row that was right-clicked (v0.15.0). */
export type RefContextTarget = {
  x: number
  y: number
  name: string
  kind: RefKind
  current: boolean
  /** The commit the ref points at, when known (chips: the row's commit). */
  sha: string | null
}

/** Payload of the generic in-app confirmation (replaces window.confirm). */
export type ConfirmRequest = {
  title: string
  body: string
  confirmLabel: string
  danger?: boolean
  onConfirm: () => void | Promise<void>
}

// Exactly one modal surface at a time. Each variant carries what its dialog
// needs to render, so there is no separate "target" state to keep in sync
// with an open flag.
export type DialogState =
  | { kind: "none" }
  | { kind: "commit"; amend: boolean; initialMsg?: string }
  | { kind: "settings" }
  | { kind: "recents" }
  | { kind: "stash" }
  | { kind: "context"; target: ContextTarget }
  | { kind: "refContext"; target: RefContextTarget }
  | { kind: "checkout"; branch: string }
  | { kind: "reset"; row: GraphRow; initialMode?: "soft" | "mixed" | "hard" }
  | { kind: "rebase"; onto: string; ontoSubject?: string; interactive?: boolean }
  | { kind: "interactiveRebase"; onto: string; ontoSubject?: string; todo: RebaseTodo; options: RebaseOptions }
  | { kind: "merge"; branch?: string }
  | { kind: "resolveConflicts" }
  | { kind: "compare"; from: string; fromLabel?: string; to: string | null; toLabel?: string }
  | { kind: "deleteBranch" }
  | { kind: "confirm"; request: ConfirmRequest }
  | { kind: "remoteConfig"; remote: string }
  | { kind: "createRef"; refKind: "branch" | "tag"; sha: string; subject?: string }

export type DialogKind = DialogState["kind"]

export type Dialogs = ReturnType<typeof useDialogs>

export function useDialogs() {
  const [dialog, setDialog] = useState<DialogState>({ kind: "none" })

  // Closing is scoped to the dialog that asked: a late onClose from a MUI
  // Menu/Dialog that is already on its way out must never dismiss whatever
  // replaced it (the context menu hands over to Create/Reset/Rebase in the
  // same click).
  const close = useCallback((kind?: DialogKind) => {
    setDialog((d) => (kind === undefined || d.kind === kind ? { kind: "none" } : d))
  }, [])

  // The context menus are not modal for hotkeys; every other surface is.
  const menu = dialog.kind === "context" || dialog.kind === "refContext"
  const blocking = dialog.kind !== "none" && !menu && dialog.kind !== "commit"
  const hotkeysEnabled = dialog.kind !== "commit" && !blocking

  return { dialog, open: setDialog, close, hotkeysEnabled }
}
