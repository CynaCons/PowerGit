import CallSplitIcon from "@mui/icons-material/CallSplit"
import CloudOutlinedIcon from "@mui/icons-material/CloudOutlined"
import SellOutlinedIcon from "@mui/icons-material/SellOutlined"
import { useMemo } from "react"
import { chipWidth, foldRefs, kindOf, orderRefs, type RefKind } from "./refChipsModel"

export type { RefKind } from "./refChipsModel"
export type RefMenuKind = "local" | "remote" | "tag"

type Props = {
  refs: string[]
  /** Tag names from the ref tree; matching chips get the tag glyph. */
  tagSet: Set<string>
  /** Remote names from the ref tree; a ref whose first segment is one of
   *  them is a remote-tracking branch. Without it, any slash counts. */
  remoteNames?: string[]
  /** The checked-out branch: first after HEAD, its remotes right behind. */
  current?: string | null
  /** Pixels the chips may take before folding into "+n" (v0.18.3); omitted
   *  or Infinity, every chip shows (the Commit tab). */
  budget?: number
  /** The row grew (variant B): every chip, wrapping, then a "−" chip. */
  expanded?: boolean
  /** "+n" clicked. */
  onExpand?: () => void
  /** "−" clicked. */
  onFold?: () => void
  /** One size up (the Commit tab): 20 px tall, 11 px font. */
  big?: boolean
  onRefClick?: (ref: string, kind: RefMenuKind) => void
  onRefContextMenu?: (e: React.MouseEvent, ref: string, kind: RefMenuKind) => void
}

// The ref chips at the head of a row's message cell and in the Commit tab.
// v0.18.3, owner: "All branches should be displayed. If there are too many,
// we need a way to either show a popup to view them all, or expand
// vertically the column." Order and folding live in refChipsModel.ts: HEAD ·
// the checked-out branch · its remotes · other locals with their remotes ·
// orphan remotes · tags, folded by width (not count) into a "+n" chip that
// expands the row. Every kind carries its glyph: a fork for a local branch,
// a cloud for a remote one (v0.13.19), a tag (v0.14.0).
export function RefChips({
  refs,
  tagSet,
  remoteNames,
  current,
  budget,
  expanded,
  onExpand,
  onFold,
  big,
  onRefClick,
  onRefContextMenu,
}: Props) {
  const ctx = useMemo(() => ({ current, tagSet, remoteNames }), [current, tagSet, remoteNames])
  const ordered = useMemo(() => orderRefs(refs, ctx), [refs, ctx])
  const fold = useMemo(() => {
    if (expanded || budget === undefined) return { shown: ordered, hidden: [] as string[] }
    return foldRefs(ordered, budget, (ref) => chipWidth(ref, kindOf(ref, ctx)))
  }, [ordered, ctx, budget, expanded])
  // The group stays in the DOM when there are no refs: the message cell's
  // gap after it is what aligns the text of every row.
  return (
    <span className="msg-refs" title={ordered.length > 0 ? ordered.join(", ") : undefined}>
      {fold.shown.map((ref) => {
        const kind = kindOf(ref, ctx)
        const menuKind = kind === "local" || kind === "remote" || kind === "tag" ? kind : null
        return (
          <span
            key={ref}
            className={`ref${kind === "local" ? "" : ` ${kind}`}${big ? " big" : ""}${onRefClick && menuKind ? " clickable" : ""}`}
            data-ref-kind={kind}
            data-ref={ref}
            title={ref}
            onClick={
              onRefClick && menuKind
                ? (e) => {
                    e.stopPropagation()
                    onRefClick(ref, menuKind)
                  }
                : undefined
            }
            onContextMenu={
              onRefContextMenu && menuKind
                ? (e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    onRefContextMenu(e, ref, menuKind)
                  }
                : undefined
            }
          >
            <Glyph kind={kind} />
            {ref}
          </span>
        )
      })}
      {fold.hidden.length > 0 ? (
        <span
          className={`ref extra${big ? " big" : ""}`}
          data-testid="ref-more"
          title={fold.hidden.join(", ")}
          onClick={onExpand}
        >
          +{fold.hidden.length}
        </span>
      ) : null}
      {expanded ? (
        <span className="ref extra" data-testid="ref-fold" title="Fold" onClick={onFold}>
          −
        </span>
      ) : null}
    </span>
  )
}

/** The kind's glyph, also on a single chip drawn outside a row (dialogs, v0.18.11). */
export function Glyph({ kind }: { kind: RefKind }) {
  // v0.13.19, owner: "a little cloud icon on the left of the remote branches";
  // v0.14.0: "tags should be having a different little icon"; v0.18.3: "with
  // the icon to differentiate the local and remote" — the fork on locals.
  if (kind === "local") return <CallSplitIcon className="ref-cloud" />
  if (kind === "remote") return <CloudOutlinedIcon className="ref-cloud" />
  if (kind === "tag") return <SellOutlinedIcon className="ref-cloud" />
  return null
}
