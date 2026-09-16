import Button from "@mui/material/Button"
import Dialog from "@mui/material/Dialog"
import type { PaperProps } from "@mui/material/Paper"
import type { KeyboardEvent, ReactNode } from "react"
import { Kbd } from "../Kbd"

/** The dialog's one action: the label says what it does, `danger` says it discards something. */
export type OpPrimary = {
  label: string
  onClick: () => void
  /** Red text and border on the pale head-ref fill; the label carries the consequence. */
  danger?: boolean
  disabled?: boolean
  testid?: string
}

/** The footer's note: plain meta text, or amber for a warning, red for an error. */
export type OpNote = ReactNode | { text: ReactNode; tone: "amber" | "error" }

function isToned(note: OpNote): note is { text: ReactNode; tone: "amber" | "error" } {
  return note !== null && typeof note === "object" && !Array.isArray(note) && "tone" in note
}

/** 520 unless the dialog's longest line needs more (Merge and Checkout: 600). */
export const OP_DIALOG_WIDTH = 520

// The A shell of every small git-operation dialog (v0.18.11, owner: "The
// overlay popup for 'Create branch' on the main graph is rather bad
// visually"; docs/prototypes/op-dialogs.html): a 15/600 title with the
// Enter / Esc hints at its right, a sunken band that quotes the row or ref
// the operation acts on (`subject`: a QuotedRow / QuotedRef), the body
// with labels above fields and nothing clipped (`overflow: visible`), and
// a footer with the note at the left and Cancel + the primary at the right.
// Enter anywhere but a multi-line field runs the primary. `actions` is the
// pre-shell escape hatch for the dialogs that keep their own buttons
// (PullPushPreview, InteractiveRebase).
export function OpDialog({
  open,
  title,
  onClose,
  children,
  subject,
  width = OP_DIALOG_WIDTH,
  note,
  primary,
  actions,
  busy = false,
  cancelLabel = "Cancel",
  testid,
}: {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
  /** The quoted band under the title. */
  subject?: ReactNode
  /** Paper width in px; the window minus 32 px when narrower. */
  width?: number
  note?: OpNote
  primary?: OpPrimary
  /** Custom action row (the dialogs not on the primary contract). */
  actions?: ReactNode
  /** Disables Cancel and the primary while the engine answers. */
  busy?: boolean
  cancelLabel?: string
  /** Marks the dialog surface, so a spec can assert what it says (v0.15.0). */
  testid?: string
}) {
  const toned = isToned(note) ? note : null
  const noteText: ReactNode = toned ? toned.text : (note as ReactNode)
  const noteTone = toned ? toned.tone : ""

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key !== "Enter" || !primary || primary.disabled || busy || e.defaultPrevented) return
    const el = e.target as HTMLElement
    // A textarea takes its newline; a button takes its own click.
    if (el.tagName === "TEXTAREA" || el.tagName === "BUTTON") return
    if (el.closest("[data-op-menu]")) return
    e.preventDefault()
    primary.onClick()
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth={false}
      slotProps={{
        // MUI's paper slot props are typed to PaperProps, which has no index
        // signature for data-* attributes; the DOM takes them all the same.
        paper: {
          "data-testid": testid,
          className: "op-dialog",
          onKeyDown,
          sx: { width, maxWidth: "calc(100vw - 32px)", overflow: "visible" },
        } as PaperProps,
      }}
    >
      <div className="op-head">
        <h2 className="op-title" title={title}>
          {title}
        </h2>
        {primary && (
          <span className="op-keys" aria-hidden="true">
            <Kbd>Enter</Kbd>
            <Kbd>Esc</Kbd>
          </span>
        )}
      </div>
      {subject && <div className="op-quote">{subject}</div>}
      <div className="op-body">{children}</div>
      <div className="op-foot">
        <span className={`op-note${noteTone ? ` ${noteTone}` : ""}`} data-testid="op-note">
          {noteText}
        </span>
        {actions ?? (
          <>
            <Button size="small" onClick={onClose} disabled={busy} sx={{ height: 30, px: 1.75, fontWeight: 500 }}>
              {cancelLabel}
            </Button>
            {primary && (
              <Button
                size="small"
                variant={primary.danger ? "outlined" : "contained"}
                className={primary.danger ? "op-btn-danger" : undefined}
                onClick={primary.onClick}
                disabled={busy || primary.disabled}
                data-testid={primary.testid}
                sx={{ height: 30, px: 1.75, fontWeight: 600 }}
              >
                {primary.label}
              </Button>
            )}
          </>
        )}
      </div>
    </Dialog>
  )
}

/** The inline failure of the last attempt ("merge failed: …"), under the fields. */
export function OpError({ error }: { error: string | null }) {
  if (!error) return null
  return (
    <div className="op-meta error" data-testid="op-error">
      {error}
    </div>
  )
}
