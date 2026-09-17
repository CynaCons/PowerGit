import { createLayouter } from "./layout"
import { LAYOUT_REPLY_CHUNK, withoutRevision, type LayoutRequest } from "./layoutProtocol"
import type { GraphRow } from "./types"

// Runs lane layout off the main thread so a fresh commit batch never blocks
// interaction. History arrives in pages: `reset` starts a new layout, an
// append continues the previous one so the prefix is never re-laid-out.
// Requests carry a sequence number; replies older than the last reset are
// dropped by the main thread.
let layouter = createLayouter()
let previousRows: GraphRow[] = []

function sameGraph(a: GraphRow, b: GraphRow): boolean {
  if (a.lane !== b.lane || a.color !== b.color || a.hasRefs !== b.hasRefs || a.isHead !== b.isHead) return false
  if (a.segments.length !== b.segments.length) return false
  return a.segments.every((segment, index) => {
    const other = b.segments[index]
    return segment.id === other.id && segment.childId === other.childId && segment.parentId === other.parentId &&
      segment.lane === other.lane && segment.color === other.color && segment.sharing === other.sharing
  })
}

self.onmessage = (e: MessageEvent<LayoutRequest>) => {
  const { seq, reset, revisions } = e.data
  if (reset) layouter = createLayouter()
  const from = layouter.rowCount()
  const rows = layouter.append(revisions)
  if (!reset) {
    previousRows = [...previousRows, ...rows]
    // Keep each structured-clone reply below one frame's work, but let the
    // main thread publish the append only after its last chunk (v0.18.18).
    for (let offset = 0; offset < rows.length; offset += LAYOUT_REPLY_CHUNK) {
      const chunk = rows.slice(offset, offset + LAYOUT_REPLY_CHUNK).map(withoutRevision)
      ;(self as unknown as Worker).postMessage({
        seq, reset: false, from, offset, last: offset + chunk.length === rows.length, rows: chunk,
      })
    }
    return
  }
  // v0.18.18: a top commit shifts every index, but nearly every existing
  // commit retains its lanes. Match by SHA and clone only changed geometry.
  const previousById = new Map(previousRows.map((row) => [row.rev.id, row]))
  const patches = rows.flatMap((row, index) => {
    const previous = previousById.get(row.rev.id)
    return previous && sameGraph(row, previous) ? [] : [{ index, row: withoutRevision(row) }]
  })
  previousRows = rows
  ;(self as unknown as Worker).postMessage({ seq, reset: true, length: rows.length, patches })
}
