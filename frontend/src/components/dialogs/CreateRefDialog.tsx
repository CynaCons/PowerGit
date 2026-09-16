import { useEffect, useState } from "react"
import { useActionDialog } from "../../hooks/useActionDialog"
import { Field, TextArea, TextInput } from "./Field"
import { OpDialog, OpError } from "./OpDialog"
import { OptionRow } from "./OptionRow"
import { RefChip } from "./QuotedRef"
import { QuotedRow } from "./QuotedRow"
import { refNameError } from "./refName"

/** What the dialog hands back (v0.18.11): Git Extensions FormCreateBranch's two boxes, FormCreateTag's message. */
export type CreateRefOptions = { checkout: boolean; orphan: boolean; message: string | null }

// Create branch / Create tag on the A shell (v0.18.11, owner: "The overlay
// popup for 'Create branch' on the main graph is rather bad visually"): the
// commit quoted as its row, the name with a live "appears as" chip — the
// chip the graph will show, dashed until something is typed, red with git's
// check-ref-format reason when it would refuse — the primary disabled until
// the name validates so Enter never sends a bad name, GE's "Check out the
// new branch" (on by default: the primary reads "Create and check out") and
// "Orphan", a tag's message (annotated when given), and the footer counting
// the uncommitted changes that stay.
export function CreateRefDialog({
  open,
  kind,
  commit,
  existingNames,
  dirtyCount = 0,
  onClose,
  onConfirm,
}: {
  open: boolean
  kind: "branch" | "tag"
  commit: string
  /** Kept for callers; the band quotes the row instead of the title carrying it. */
  subject?: string
  existingNames: string[]
  dirtyCount?: number
  onClose: () => void
  onConfirm: (name: string, options: CreateRefOptions) => Promise<void>
}) {
  const [name, setName] = useState("")
  const [checkout, setCheckout] = useState(true)
  const [orphan, setOrphan] = useState(false)
  const [message, setMessage] = useState("")
  const clean = name.trim()
  const reason = refNameError(clean, existingNames)
  const valid = reason === null
  const { busy, error, submit } = useActionDialog({
    open,
    label: `create ${kind}`,
    action: () =>
      onConfirm(clean, {
        checkout: kind === "branch" && (checkout || orphan),
        orphan: kind === "branch" && orphan,
        message: kind === "tag" && message.trim() ? message.trim() : null,
      }),
    onClose,
  })

  useEffect(() => {
    if (!open) return
    setName("")
    setCheckout(true)
    setOrphan(false)
    setMessage("")
  }, [open])

  const label =
    kind === "tag"
      ? message.trim()
        ? "Create annotated tag"
        : "Create tag"
      : checkout || orphan
        ? "Create and check out"
        : "Create branch"
  const note =
    dirtyCount > 0
      ? dirtyCount === 1
        ? "1 change stays in the working tree."
        : `${dirtyCount} changes stay in the working tree.`
      : undefined

  return (
    <OpDialog
      open={open}
      title={kind === "branch" ? "Create branch" : "Create tag"}
      onClose={onClose}
      testid="create-ref-dialog"
      subject={<QuotedRow sha={commit} />}
      note={note}
      busy={busy}
      primary={{ label, onClick: () => void submit(), disabled: !valid, testid: "create-ref-confirm" }}
    >
      <Field
        label={kind === "branch" ? "Branch name" : "Tag name"}
        right={
          <>
            appears as
            <AppearsAs name={clean} kind={kind} reason={reason} />
          </>
        }
        meta={clean && reason ? reason : undefined}
        metaTone="error"
        testid="create-ref-field"
      >
        <TextInput
          focus
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-label={kind === "branch" ? "Branch name" : "Tag name"}
          data-testid="create-ref-name"
          aria-invalid={clean.length > 0 && !valid}
        />
      </Field>
      {kind === "branch" ? (
        <>
          <OptionRow
            kind="checkbox"
            checked={checkout || orphan}
            disabled={orphan}
            onChange={setCheckout}
            label="Check out the new branch"
            testid="create-ref-checkout"
          />
          <OptionRow
            kind="checkbox"
            checked={orphan}
            onChange={setOrphan}
            label="Orphan"
            explain="start a branch with no history"
            testid="create-ref-orphan"
          />
        </>
      ) : (
        <Field label="Message" caption="a message makes an annotated tag">
          <TextArea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            aria-label="Tag message"
            data-testid="create-ref-message"
          />
        </Field>
      )}
      <OpError error={error} />
    </OpDialog>
  )
}

/** The chip the graph will show for the name: dashed before a name, red when git would refuse it. */
export function AppearsAs({ name, kind, reason }: { name: string; kind: "branch" | "tag"; reason: string | null }) {
  const k = kind === "tag" ? "tag" : "local"
  if (!name) return <RefChip name={`${kind} name`} kind={k} ghost testid="appears-as" />
  return <RefChip name={name} kind={k} invalid={reason !== null} title={reason ?? undefined} testid="appears-as" />
}
