import { useEffect, useMemo, useState } from "react"
import { useEngine, type CheckoutAs, type CheckoutOptions, type Divergence, type LocalChanges } from "../../engine"
import { useActionDialog } from "../../hooks/useActionDialog"
import { kindOf } from "../refChipsModel"
import { BranchPicker } from "./BranchPicker"
import { AppearsAs } from "./CreateRefDialog"
import { Field } from "./Field"
import { OpDialog, OpError } from "./OpDialog"
import { OptionGroup, OptionRow } from "./OptionRow"
import { QuotedRow } from "./QuotedRow"
import { localNameFor, refNameError, suggestLocalName } from "./refName"
import { refTarget, useQuote } from "./quoteContext"

// Git Extensions FormCheckoutBranch on the A shell (v0.18.11, owner: "when
// I hit 'checkout branch' on a remote branch, it should offer me the
// possibility to create a new local branch for that remote branch or to
// reset the current local existing branch and move it to remote ref"). The
// branch is a picker whose value is the chip; the band quotes its tip; for
// a remote branch "Check it out as" offers GE's three ways — create a
// tracking local branch (the default, the name suggested from the remote's
// and validated like Create branch), reset the existing local branch to the
// remote (only when it exists; the engine's divergence says what that
// loses: amber note and a red primary when commits become unreachable, a
// plain fast-forward stays blue), or the commit detached — and "Local
// changes" replaces the old Force box: keep, stash, discard (red).
export function CheckoutBranchDialog({
  open,
  branch,
  dirtyCount,
  onClose,
  onConfirm,
}: {
  open: boolean
  /** The ref to start on: a local branch, a remote-tracking one or a tag. */
  branch: string
  dirtyCount: number
  onClose: () => void
  onConfirm: (ref: string, options: CheckoutOptions) => Promise<void>
}) {
  const engine = useEngine()
  const { refs, currentBranch, tagSet, remoteNames } = useQuote()
  const locals = useMemo(() => (refs?.branches ?? []).map((b) => b.name), [refs])
  const exclude = useMemo(() => [currentBranch], [currentBranch])
  const [selected, setSelected] = useState(branch)
  const [mode, setMode] = useState<CheckoutAs>("track")
  const [name, setName] = useState("")
  const [local, setLocal] = useState<LocalChanges>("keep")
  const [divergence, setDivergence] = useState<{ pair: string; d: Divergence | null } | null>(null)

  const kind = kindOf(selected, { current: currentBranch, tagSet, remoteNames })
  const remote = kind === "remote"
  const tag = kind === "tag"
  const localName = remote ? localNameFor(selected, remoteNames) : ""
  const localExists = remote && locals.includes(localName)
  const tip = refTarget(refs, selected)

  // The picked ref sets the defaults: Create with a free name, Keep.
  useEffect(() => {
    if (!open) return
    const first = branch === currentBranch ? (locals.find((b) => b !== currentBranch) ?? branch) : branch
    setSelected(first)
    setLocal("keep")
  }, [open, branch, currentBranch, locals])
  useEffect(() => {
    setMode(tag ? "detached" : "track")
    setName(remote ? suggestLocalName(selected, remoteNames, locals) : "")
  }, [selected, remote, tag, remoteNames, locals])

  // What resetting the local branch would do, asked once per pair.
  useEffect(() => {
    if (!open || !localExists) return
    const pair = `${localName}...${selected}`
    let cancelled = false
    engine
      .divergence(localName, selected)
      .then((d) => !cancelled && setDivergence({ pair, d }))
      .catch(() => !cancelled && setDivergence({ pair, d: null }))
    return () => {
      cancelled = true
    }
  }, [engine, open, localExists, localName, selected])
  const div = divergence && divergence.pair === `${localName}...${selected}` ? divergence.d : null

  const nameReason = remote && mode === "track" ? refNameError(name.trim(), locals) : null
  const loses = mode === "reset" && (div?.ahead ?? 0) > 0
  const discard = dirtyCount > 0 && local === "discard"
  const danger = loses || discard
  const verbs = [
    mode === "reset" && remote ? "reset" : "",
    discard ? `discard ${dirtyCount} change${dirtyCount === 1 ? "" : "s"}` : "",
  ].filter(Boolean)
  const primaryLabel = verbs.length
    ? `${verbs.join(", ").replace(/^./, (m) => m.toUpperCase())} and check out`
    : "Check out"

  const { busy, error, submit, dirty, retryWithStash } = useActionDialog({
    open,
    label: "checkout",
    action: (retryAutostash) =>
      onConfirm(selected, {
        as: remote ? mode : tag ? "detached" : undefined,
        name: remote && mode !== "detached" ? (mode === "reset" ? localName : name.trim()) : undefined,
        localChanges: dirtyCount > 0 ? (retryAutostash ? "stash" : local) : "keep",
      }),
    onClose,
  })

  const resetNote = !localExists
    ? null
    : div === null
      ? "…"
      : div.ahead > 0
        ? `${localName} has ${div.ahead} commit${div.ahead === 1 ? "" : "s"} that ${selected} does not; resetting makes ${div.ahead === 1 ? "it" : "them"} unreachable.`
        : div.behind > 0
          ? `${localName} is ${div.behind} commit${div.behind === 1 ? "" : "s"} behind ${selected} — a fast-forward.`
          : `${localName} already points at ${selected}.`

  return (
    <OpDialog
      open={open}
      title="Check out branch"
      onClose={onClose}
      width={600}
      testid="checkout-dialog"
      subject={tip ? <QuotedRow sha={tip} /> : undefined}
      note={local === "stash" && dirtyCount > 0 ? "Stashed before, popped after the checkout." : undefined}
      busy={busy}
      secondary={
        dirty
          ? { label: "Stash and retry", onClick: () => void retryWithStash(), testid: "checkout-stash-retry" }
          : undefined
      }
      primary={{
        label: primaryLabel,
        onClick: () => void submit(),
        danger,
        disabled: !selected || nameReason !== null,
        testid: "checkout-confirm",
      }}
    >
      <Field label="Branch">
        <BranchPicker
          value={selected}
          onChange={setSelected}
          exclude={exclude}
          testid="checkout-branch"
          ariaLabel="Branch"
        />
      </Field>
      {remote && (
        <OptionGroup label="Check it out as" testid="checkout-as">
          <OptionRow
            kind="radio"
            name="checkout-as"
            value="track"
            checked={mode === "track"}
            onChange={() => setMode("track")}
            label="Create local branch"
            testid="checkout-as-track"
            note={
              mode === "track" && name.trim() && nameReason ? (
                <AppearsAs name={name.trim()} kind="branch" reason={nameReason} />
              ) : undefined
            }
            noteTone="error"
          >
            <input
              className="op-inline"
              value={name}
              onChange={(e) => {
                setMode("track")
                setName(e.target.value)
              }}
              aria-label="Local branch name"
              aria-invalid={nameReason !== null}
              data-testid="checkout-local-name"
              autoComplete="off"
              spellCheck={false}
            />
            <span>tracking {selected}</span>
          </OptionRow>
          <OptionRow
            kind="radio"
            name="checkout-as"
            value="reset"
            checked={mode === "reset"}
            disabled={!localExists}
            onChange={() => setMode("reset")}
            label={`Reset ${localName} to ${selected}`}
            explain={localExists ? undefined : "no local branch yet"}
            testid="checkout-as-reset"
            note={resetNote}
            noteTone={div && div.ahead > 0 ? "amber" : undefined}
          />
          <OptionRow
            kind="radio"
            name="checkout-as"
            value="detached"
            checked={mode === "detached"}
            onChange={() => setMode("detached")}
            label="Check out the commit"
            explain="detached HEAD"
            testid="checkout-as-detached"
          />
        </OptionGroup>
      )}
      {tag && <div className="op-meta">A tag is checked out as its commit — detached HEAD.</div>}
      {dirtyCount > 0 && (
        <OptionGroup label={`Local changes (${dirtyCount} file${dirtyCount === 1 ? "" : "s"})`} testid="checkout-local">
          <OptionRow
            kind="radio"
            name="checkout-local"
            value="keep"
            checked={local === "keep"}
            onChange={() => setLocal("keep")}
            label="Keep"
            explain="carried over if it does not conflict"
            testid="checkout-keep"
          />
          <OptionRow
            kind="radio"
            name="checkout-local"
            value="stash"
            checked={local === "stash"}
            onChange={() => setLocal("stash")}
            label="Stash"
            explain="set aside, restored after the checkout"
            testid="checkout-stash"
          />
          <OptionRow
            kind="radio"
            name="checkout-local"
            value="discard"
            checked={local === "discard"}
            onChange={() => setLocal("discard")}
            label="Discard"
            explain="reset to HEAD before the checkout"
            testid="checkout-discard"
          />
        </OptionGroup>
      )}
      <OpError error={error} />
    </OpDialog>
  )
}
