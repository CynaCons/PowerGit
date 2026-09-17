import { memo } from "react"
import type { AuthorIdentity } from "../graph/authorIdentity"
import type { GraphRow } from "../graph/types"
import { RefChips, type RefMenuKind } from "./RefChips"

type Props = {
  row: GraphRow
  index: number
  /** The row's top in list pixels (the virtualizer's `start`). */
  start: number
  selected: boolean
  /** Kept as a boolean so moving the pointer only updates the two rows. */
  hovered: boolean
  /** By the selected row's author (v0.18.1): the disc's ring and the bold name. */
  sameAuthor: boolean
  identity: AuthorIdentity | null
  /** The row grew to show every ref (v0.18.3, variant B). */
  expanded: boolean
  /** Pixels the ref chips may take before folding; undefined folds nothing. */
  budget: number | undefined
  tagSet: Set<string>
  remoteNames?: string[]
  currentBranch?: string | null
  /** The virtualizer's `measureElement`, so an expanded row's height is real. */
  measureRef: (el: HTMLDivElement | null) => void
  /** The event too: Alt+click makes the row the ancestry root (v0.18.4). */
  onClick: (index: number, e: React.MouseEvent) => void
  onContextMenu?: (e: React.MouseEvent, index: number) => void
  onMouseEnter: (index: number) => void
  onRefContextMenu?: (e: React.MouseEvent, ref: string, kind: RefMenuKind, index: number) => void
  /** "+n" clicked: grow this row (the click also selects it, it bubbles). */
  onExpand: (sha: string) => void
  /** "-" clicked: back to one line. */
  onFold: () => void
}

// One row of the revision grid (split out of RevisionGrid.tsx in v0.18.3 to
// keep that file under the lint cap). Absolute and
// translated by the virtualizer; the row element stays transparent so the
// canvas underneath keeps its node (selected-row-graph.spec.ts), the text
// cells carry the selection tint.
export const RevisionRow = memo(function RevisionRow({
  row,
  index,
  start,
  selected,
  hovered,
  sameAuthor,
  identity,
  expanded,
  budget,
  tagSet,
  remoteNames,
  currentBranch,
  measureRef,
  onClick,
  onContextMenu,
  onMouseEnter,
  onRefContextMenu,
  onExpand,
  onFold,
}: Props) {
  return (
    <div
      ref={measureRef}
      className={`grid-row${selected ? " selected" : ""}${hovered ? " hovered" : ""}${sameAuthor ? " author-same" : ""}${expanded ? " expanded" : ""}`}
      data-testid="grid-row"
      data-index={index}
      data-artificial={row.artificial}
      onClick={(e) => onClick(index, e)}
      onContextMenu={onContextMenu ? (e) => onContextMenu(e, index) : undefined}
      onMouseEnter={() => onMouseEnter(index)}
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        transform: `translateY(${start}px)`,
      }}
    >
      <div className="graph-cell" />
      <div className="msg">
        <RefChips
          refs={row.rev.refs}
          tagSet={tagSet}
          remoteNames={remoteNames}
          current={currentBranch}
          budget={budget}
          expanded={expanded}
          onExpand={() => onExpand(row.rev.id)}
          onFold={onFold}
          onRefContextMenu={onRefContextMenu ? (e, ref, kind) => onRefContextMenu(e, ref, kind, index) : undefined}
        />
        <span className="msg-text">{row.rev.message}</span>
      </div>
      <div className="author">
        {identity && (
          <span className="author-disc" data-palette={identity.palette}>
            {identity.initials}
          </span>
        )}
        {row.rev.author}
      </div>
      <div className="date">{row.rev.date}</div>
      <div className="sha" data-testid="sha-cell" title={row.artificial ? undefined : row.rev.id}>
        {row.artificial ? "" : row.rev.id.slice(0, 7)}
      </div>
    </div>
  )
})
