import type { AuthorIdentity } from "../graph/authorIdentity"
import type { GraphRow } from "../graph/types"
import { RefChips, type RefMenuKind } from "./RefChips"

type Props = {
  row: GraphRow
  index: number
  /** The row's top in list pixels (the virtualizer's `start`). */
  start: number
  selected: boolean
  /** By the selected row's author (v0.18.1): the disc's ring and the bold name. */
  sameAuthor: boolean
  identity: AuthorIdentity | null
  /** Pixels the ref chips may take before folding; undefined folds nothing. */
  budget: number | undefined
  tagSet: Set<string>
  remoteNames?: string[]
  currentBranch?: string | null
  /** The virtualizer's `measureElement`, so an expanded row's height is real. */
  measureRef: (el: HTMLDivElement | null) => void
  onClick: (index: number) => void
  onContextMenu?: (e: React.MouseEvent, index: number) => void
  onMouseEnter: (index: number) => void
  onRefContextMenu?: (e: React.MouseEvent, ref: string, kind: RefMenuKind, index: number) => void
}

// One row of the revision grid (split out of RevisionGrid.tsx in v0.18.3 to
// keep that file under the lint cap; no behaviour change). Absolute and
// translated by the virtualizer; the row element stays transparent so the
// canvas underneath keeps its node (selected-row-graph.spec.ts), the text
// cells carry the selection tint.
export function RevisionRow({
  row,
  index,
  start,
  selected,
  sameAuthor,
  identity,
  budget,
  tagSet,
  remoteNames,
  currentBranch,
  measureRef,
  onClick,
  onContextMenu,
  onMouseEnter,
  onRefContextMenu,
}: Props) {
  return (
    <div
      ref={measureRef}
      className={`grid-row${selected ? " selected" : ""}${sameAuthor ? " author-same" : ""}`}
      data-testid="grid-row"
      data-index={index}
      data-artificial={row.artificial}
      onClick={() => onClick(index)}
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
}
