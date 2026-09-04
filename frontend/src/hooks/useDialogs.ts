import { useCallback, useState } from "react"
import type { GraphRow } from "../graph/types"

export type ContextTarget = { x: number; y: number; row: GraphRow }

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
  | { kind: "checkout"; branch: string }
  | { kind: "reset"; row: GraphRow }
  | { kind: "rebase"; row: GraphRow }
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

  // The context menu is not modal for hotkeys; every other surface is.
  const blocking = dialog.kind !== "none" && dialog.kind !== "context" && dialog.kind !== "commit"
  const hotkeysEnabled = dialog.kind !== "commit" && !blocking

  return { dialog, open: setDialog, close, hotkeysEnabled }
}
