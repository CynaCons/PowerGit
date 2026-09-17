import type { GraphRow, Revision } from "./types"

export const LAYOUT_REPLY_CHUNK = 500

export type LayoutRow = Omit<GraphRow, "rev">
export type LayoutRequest = { seq: number; reset: boolean; revisions: Revision[] }
export type LayoutReply =
  | { seq: number; reset: false; from: number; offset: number; last: boolean; rows: LayoutRow[] }
  | { seq: number; reset: true; length: number; patches: { index: number; row: LayoutRow }[] }

export function withoutRevision(graphRow: GraphRow): LayoutRow {
  const row: LayoutRow = {
    lane: graphRow.lane,
    color: graphRow.color,
    hasRefs: graphRow.hasRefs,
    isHead: graphRow.isHead,
    segments: graphRow.segments,
  }
  if (graphRow.artificial !== undefined) row.artificial = graphRow.artificial
  return row
}

export function attachRevisions(rows: LayoutRow[], revisions: Revision[], offset = 0): GraphRow[] {
  return rows.map((row, index) => ({ ...row, rev: revisions[offset + index] }))
}
