import type { ReactNode } from "react"
import { Glyph } from "../RefChips"
import { kindOf, type RefKind } from "../refChipsModel"
import { QuotedRow } from "./QuotedRow"
import { refTarget, useQuote } from "./quoteContext"

/** One ref chip as the grid draws it, outside a row: `ref` + kind class + glyph. */
export function RefChip({
  name,
  kind,
  big = false,
  invalid = false,
  ghost = false,
  title,
  testid,
}: {
  name: string
  /** Resolved against the ref tree when omitted. */
  kind?: RefKind
  big?: boolean
  /** The "appears as" chip when git would refuse the name (red, the reason as title). */
  invalid?: boolean
  /** Dashed, before a name is typed. */
  ghost?: boolean
  title?: string
  testid?: string
}) {
  const { tagSet, remoteNames, currentBranch } = useQuote()
  const k = kind ?? kindOf(name, { current: currentBranch, tagSet, remoteNames })
  const cls = ["ref", k === "local" ? "" : k, big ? "big" : "", invalid ? "invalid" : "", ghost ? "ghost" : ""]
    .filter(Boolean)
    .join(" ")
  return (
    <span className={cls} data-ref-kind={k} data-ref={name} title={title ?? name} data-testid={testid}>
      <Glyph kind={k} />
      {name}
    </span>
  )
}

// A ref quoted on the band (v0.18.11): the chip and a caption on a 26 px
// line ("moves from 3363352 to", "at"), then the tip's row under it, so
// Reset and Delete say where the branch is and where it goes.
export function QuotedRef({
  name,
  kind,
  caption,
  tip,
  refs,
}: {
  name: string
  kind?: RefKind
  /** After the chip, 12 px meta. */
  caption?: ReactNode
  /** The commit under the chip; the ref tree's target when omitted. */
  tip?: string | null
  /** Chips on the tip row instead of the row's own. */
  refs?: string[]
}) {
  const { refs: tree } = useQuote()
  const sha = tip === undefined ? refTarget(tree, name) : tip
  return (
    <>
      <div className="op-qrow short" data-testid="quoted-ref">
        <RefChip name={name} kind={kind} big />
        {caption && <span className="op-caption">{caption}</span>}
      </div>
      {sha && <QuotedRow sha={sha} refs={refs} />}
    </>
  )
}
