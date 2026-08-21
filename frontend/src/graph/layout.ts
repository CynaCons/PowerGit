import {
  LANE_COLORS,
  MAX_LANES,
  type GraphRow,
  type LaneSharing,
  type Revision,
  type RowSegment,
} from "./types"

type Segment = {
  id: string
  childId: string
  parentId: string
  color: number
  secondarySince: number
}

const MERGE_COMMON_PARENT = true

export function layoutGraph(revisions: Revision[]): GraphRow[] {
  const byId = new Map<string, Revision>()
  for (const rev of revisions) byId.set(rev.id, rev)

  const startByChild = new Map<string, Segment[]>()
  for (const rev of revisions) {
    const segs: Segment[] = []
    for (const parentId of rev.parents) {
      if (!parentId) continue
      segs.push({
        id: `${rev.id}:${parentId}`,
        childId: rev.id,
        parentId,
        color: 0,
        secondarySince: Number.MAX_SAFE_INTEGER,
      })
    }
    startByChild.set(rev.id, segs)
  }

  const rows: GraphRow[] = []

  for (let i = 0; i < revisions.length; i++) {
    const rev = revisions[i]
    const startSegments = startByChild.get(rev.id) ?? []
    let segments: Segment[] = []

    if (i === 0) {
      segments = [...startSegments]
      let prev: Segment | undefined
      for (const seg of segments) {
        seg.color = pickColor(seg, prev)
        prev = seg
      }
    } else {
      const prevRow = rows[i - 1]
      const continuing: Segment[] = []
      const prevSegs = prevRow.segments.map((s) => findSegment(startByChild, s.id)).filter(Boolean) as Segment[]

      let startAdded = false
      for (let p = 0; p < prevSegs.length; p++) {
        const segment = prevSegs[p]
        if (segment.parentId === prevRow.rev.id) continue
        continuing.push(segment)

        if (rev.id === segment.parentId) {
          if (!startAdded) {
            startAdded = true
            continuing.push(...startSegments)
          }
          let prevSeg = segment
          for (let s = 0; s < startSegments.length; s++) {
            const start = startSegments[s]
            if (s === 0) {
              start.color = segment.color
            } else {
              start.color = pickColor(start, prevSeg, startSegments[s + 1], segment.color)
            }
            prevSeg = start
          }
        }
      }

      if (!startAdded) {
        let prevSeg = continuing.at(-1)
        continuing.push(...startSegments)
        for (const start of startSegments) {
          start.color = pickColor(start, prevSeg)
          prevSeg = start
        }
      }

      segments = continuing
    }

    const assigned = assignLanes(rev.id, segments, i)
    rows.push({
      rev,
      lane: assigned.revisionLane,
      color: colorForLane(assigned.revisionLane, segments, rev.id),
      hasRefs: rev.refs.length > 0,
      isHead: rev.refs.includes("HEAD"),
      segments: assigned.rowSegments,
    })
  }

  return rows
}

function findSegment(startByChild: Map<string, Segment[]>, id: string): Segment | undefined {
  const [childId] = id.split(":")
  return startByChild.get(childId)?.find((s) => s.id === id)
}

function assignLanes(revisionId: string, segments: Segment[], score: number) {
  const laneOf = new Map<string, { lane: number; sharing: LaneSharing }>()
  let laneCount = 0
  let revisionLane = -1
  let hasStart = false
  let hasEnd = false

  const createLane = () => {
    const lane = laneCount
    if (laneCount < MAX_LANES) laneCount += 1
    return lane
  }

  for (const segment of segments) {
    if (segment.childId === revisionId) {
      if (revisionLane < 0) revisionLane = createLane()
      segment.secondarySince = Number.MAX_SAFE_INTEGER
      const sharing: LaneSharing = !hasStart ? ((hasStart = true), "exclusive") : "differentEnd"
      laneOf.set(segment.id, { lane: revisionLane, sharing })
      continue
    }

    if (segment.parentId === revisionId) {
      if (revisionLane < 0) revisionLane = createLane()
      let sharing: LaneSharing
      if (!hasEnd) {
        hasEnd = true
        segment.secondarySince = Number.MAX_SAFE_INTEGER
        sharing = "exclusive"
      } else {
        sharing = secondarySharing(segment, score)
      }
      laneOf.set(segment.id, { lane: revisionLane, sharing })
      continue
    }

    if (MERGE_COMMON_PARENT) {
      let merged: { lane: number } | undefined
      for (const other of segments) {
        const placed = laneOf.get(other.id)
        if (!placed) continue
        if (placed.lane !== revisionLane && other.parentId === segment.parentId) {
          merged = placed
          break
        }
      }
      if (merged) {
        laneOf.set(segment.id, { lane: merged.lane, sharing: secondarySharing(segment, score) })
        continue
      }
    }

    segment.secondarySince = Number.MAX_SAFE_INTEGER
    laneOf.set(segment.id, { lane: createLane(), sharing: "exclusive" })
  }

  if (revisionLane < 0) revisionLane = createLane()

  const rowSegments: RowSegment[] = segments.map((segment) => {
    const placed = laneOf.get(segment.id)!
    return {
      id: segment.id,
      childId: segment.childId,
      parentId: segment.parentId,
      lane: placed.lane,
      color: segment.color,
      sharing: placed.sharing,
    }
  })

  return { revisionLane, rowSegments }
}

function secondarySharing(segment: Segment, score: number): LaneSharing {
  if (score > segment.secondarySince) return "entire"
  segment.secondarySince = Math.min(segment.secondarySince, score)
  return "differentStart"
}

function pickColor(segment: Segment, left?: Segment, right?: Segment, derived?: number): number {
  const seed = hash(`${segment.childId}:${segment.parentId}`)
  for (let i = 0; i < LANE_COLORS.length * 3; i++) {
    const color = Math.abs(seed + i) % LANE_COLORS.length
    if (color !== left?.color && color !== right?.color && color !== derived) return color
  }
  return Math.abs(seed) % LANE_COLORS.length
}

function hash(value: string): number {
  let h = 0
  for (let i = 0; i < value.length; i++) h = (Math.imul(31, h) + value.charCodeAt(i)) | 0
  return h
}

function colorForLane(lane: number, segments: Segment[], revisionId: string): number {
  const hit = segments.find((s) => s.childId === revisionId || s.parentId === revisionId)
  return hit?.color ?? lane % LANE_COLORS.length
}
