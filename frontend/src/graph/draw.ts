import {
  LANE_COLORS,
  LANE_LINE_WIDTH,
  LANE_WIDTH,
  MAX_LANES,
  NODE_DIMENSION,
  NO_LANE,
  type GraphRow,
  type RowSegment,
} from "./types"

type Point = { x: number; y: number }

type LanesInfo = {
  startLane: number
  centerLane: number
  endLane: number
  primaryEndLane: number
  isTheRevisionLane: boolean
  drawFromStart: boolean
  drawToEnd: boolean
}

type DiagonalInfo = {
  drawFromStart: boolean
  drawToEnd: boolean
  drawCenterToStartPerpendicularly: boolean
  drawCenter: boolean
  drawCenterPerpendicularly: boolean
  drawCenterToEndPerpendicularly: boolean
  isTheRevisionLane: boolean
  horizontalOffset: number
}

export function graphWidth(rows: GraphRow[]): number {
  let maxLane = 1
  for (const row of rows) {
    maxLane = Math.max(maxLane, row.lane)
    for (const s of row.segments) maxLane = Math.max(maxLane, s.lane)
  }
  return Math.min(maxLane + 1, MAX_LANES) * LANE_WIDTH + 8
}

export function drawRows(
  ctx: CanvasRenderingContext2D,
  rows: GraphRow[],
  start: number,
  end: number,
  rowHeight: number,
  width: number,
  selected: number,
  hovered = -1,
): void {
  ctx.clearRect(0, 0, width, Math.max(1, end - start) * rowHeight)
  ctx.lineCap = "butt"
  ctx.lineJoin = "round"

  for (let i = start; i < end; i++) {
    const row = rows[i]
    if (!row) continue
    const y = (i - start) * rowHeight
    const centerY = y + rowHeight / 2

    if (i === selected) {
      ctx.fillStyle = getComputedStyle(ctx.canvas).getPropertyValue("--pg-grid-sel") || "#eff6ff"
      ctx.fillRect(0, y, width, rowHeight)
    } else if (i === hovered) {
      ctx.fillStyle = "rgba(37, 99, 235, 0.08)"
      ctx.fillRect(0, y, width, rowHeight)
    }

    ctx.save()
    ctx.beginPath()
    ctx.rect(0, y, width, rowHeight)
    ctx.clip()

    const prev = rows[i - 1]
    const next = rows[i + 1]
    const ordered = [...row.segments].reverse()

    for (const segment of ordered) {
      if (segment.sharing === "entire") continue
      const lanes = lanesFor(segment, row, prev, next)
      if (!lanes.drawFromStart && !lanes.drawToEnd) continue

      const startX = xFor(lanes.startLane)
      const centerX = xFor(lanes.centerLane)
      const endX = xFor(lanes.endLane)
      const color = LANE_COLORS[segment.color % LANE_COLORS.length]
      const diag = diagonalInfo(lanes)

      const drawer = new SegmentDrawer(ctx, color, LANE_WIDTH, rowHeight)
      drawDiagonals(
        drawer,
        { x: startX, y: centerY - rowHeight },
        { x: centerX, y: centerY },
        { x: endX, y: centerY + rowHeight },
        diag,
        previousDiag(segment, rows, i),
        nextDiag(segment, rows, i),
        rowHeight,
      )
    }

    if (row.lane < MAX_LANES) {
      drawNode(ctx, xFor(row.lane), centerY, row)
    }

    ctx.restore()
  }
}

function xFor(lane: number): number {
  if (lane < 0) return 0
  return (lane + 0.5) * LANE_WIDTH
}

function laneOn(row: GraphRow | undefined, segmentId: string): number {
  if (!row) return NO_LANE
  const hit = row.segments.find((s) => s.id === segmentId)
  return hit && hit.lane >= 0 ? hit.lane : NO_LANE
}

function lanesFor(segment: RowSegment, current: GraphRow, prev: GraphRow | undefined, next: GraphRow | undefined): LanesInfo {
  const centerLane = segment.lane
  let startLane = NO_LANE
  let endLane = NO_LANE
  let isTheRevisionLane = true

  if (segment.parentId === current.rev.id) {
    startLane = laneOn(prev, segment.id)
  } else if (segment.childId === current.rev.id) {
    endLane = laneOn(next, segment.id)
  } else {
    startLane = laneOn(prev, segment.id)
    endLane = laneOn(next, segment.id)
    isTheRevisionLane = false
  }

  const primaryEndLane = endLane
  if (segment.sharing === "differentStart") {
    endLane = NO_LANE
  }

  return {
    startLane,
    centerLane,
    endLane,
    primaryEndLane,
    isTheRevisionLane,
    drawFromStart: startLane >= 0 && centerLane >= 0,
    drawToEnd: endLane >= 0 && centerLane >= 0,
  }
}

function diagonalInfo(lanes: LanesInfo): DiagonalInfo {
  const startShift = lanes.centerLane - lanes.startLane
  const endShift = lanes.endLane - lanes.centerLane
  const startIsDiagonal = Math.abs(startShift) === 1
  const endIsDiagonal = Math.abs(endShift) === 1
  const isBow = startIsDiagonal && endIsDiagonal && -Math.sign(startShift) === Math.sign(endShift)
  const bowOffset = LANE_WIDTH / 6
  const horizontalOffset = isBow ? -Math.sign(startShift) * bowOffset : 0

  const drawCenterToStartPerpendicularly =
    lanes.drawFromStart && (startShift === 0 || (!startIsDiagonal && !lanes.isTheRevisionLane))
  const drawCenterToEndPerpendicularly =
    lanes.drawToEnd && (endShift === 0 || (!endIsDiagonal && !lanes.isTheRevisionLane))
  const drawCenterPerpendicularly = isBow
  const drawCenter =
    drawCenterPerpendicularly ||
    !lanes.drawFromStart ||
    !lanes.drawToEnd ||
    (!drawCenterToStartPerpendicularly && !drawCenterToEndPerpendicularly)

  return {
    drawFromStart: lanes.drawFromStart,
    drawToEnd: lanes.drawToEnd,
    drawCenterToStartPerpendicularly,
    drawCenter,
    drawCenterPerpendicularly,
    drawCenterToEndPerpendicularly,
    isTheRevisionLane: lanes.isTheRevisionLane,
    horizontalOffset,
  }
}

function previousDiag(segment: RowSegment, rows: GraphRow[], index: number): DiagonalInfo | null {
  if (index <= 0) return null
  const prev = rows[index - 1]
  const match = prev?.segments.find((s) => s.id === segment.id)
  if (!match) return null
  return diagonalInfo(lanesFor(match, prev, rows[index - 2], rows[index]))
}

function nextDiag(segment: RowSegment, rows: GraphRow[], index: number): DiagonalInfo | null {
  const next = rows[index + 1]
  if (!next) return null
  const match = next.segments.find((s) => s.id === segment.id)
  if (!match) return null
  return diagonalInfo(lanesFor(match, next, rows[index], rows[index + 2]))
}

function drawDiagonals(
  drawer: SegmentDrawer,
  start: Point,
  center: Point,
  end: Point,
  current: DiagonalInfo,
  previous: DiagonalInfo | null,
  next: DiagonalInfo | null,
  rowHeight: number,
): void {
  const half = rowHeight / 6

  if (current.drawFromStart && previous) {
    const startX = start.x + previous.horizontalOffset
    if (previous.drawCenterToEndPerpendicularly) drawer.drawTo(startX, start.y + half)
    else if (previous.drawCenter) drawer.drawTo(startX, start.y, previous.drawCenterPerpendicularly)
    else drawer.drawTo(startX, start.y - half)
  }

  const centerX = center.x + current.horizontalOffset
  if (current.drawCenterToStartPerpendicularly) drawer.drawTo(centerX, center.y - half)
  if (current.drawCenter) drawer.drawTo(centerX, center.y, current.drawCenterPerpendicularly)
  if (current.drawCenterToEndPerpendicularly) drawer.drawTo(centerX, center.y + half)

  if (current.drawToEnd && next) {
    const endX = end.x + next.horizontalOffset
    if (next.drawCenterToStartPerpendicularly) drawer.drawTo(endX, end.y - half)
    else if (next.drawCenter) drawer.drawTo(endX, end.y, next.drawCenterPerpendicularly)
    else drawer.drawTo(endX, end.y + half)
  }
}

class SegmentDrawer {
  private from: Point | null = null
  private fromPerp = true

  constructor(
    private readonly ctx: CanvasRenderingContext2D,
    color: string,
    private readonly laneWidth: number,
    private readonly rowHeight: number,
  ) {
    ctx.strokeStyle = color
    ctx.lineWidth = LANE_LINE_WIDTH
  }

  drawTo(x: number, y: number, toPerp = true): void {
    const to = { x, y }
    if (this.from) {
      this.stroke(this.from, to, this.fromPerp, toPerp)
    }
    this.from = to
    this.fromPerp = toPerp
  }

  private stroke(from: Point, to: Point, fromPerp: boolean, toPerp: boolean): void {
    const ctx = this.ctx
    if (from.x === to.x) {
      ctx.beginPath()
      ctx.moveTo(from.x, from.y)
      ctx.lineTo(to.x, to.y)
      ctx.stroke()
      return
    }

    const height = to.y - from.y
    const width = to.x - from.x
    const singleLane = Math.abs(width) <= this.laneWidth
    const cellShift = { x: Math.sign(width) * this.laneWidth, y: this.rowHeight }
    const diagFrac = 0.25
    const perpOffset = diagFrac * cellShift.y

    let e0 = { ...from }
    let e1 = { ...to }
    let c0 = { ...e0 }
    let c1 = { ...e1 }

    if (!fromPerp && !toPerp && singleLane) {
      ctx.beginPath()
      ctx.moveTo(e0.x, e0.y)
      ctx.lineTo(e1.x, e1.y)
      ctx.stroke()
      return
    }

    if (fromPerp && toPerp) {
      if (singleLane) {
        c0.y += perpOffset
        c1.y -= perpOffset
        const mid = { x: (e0.x + e1.x) / 2, y: (e0.y + e1.y) / 2 }
        const shift = { x: diagFrac * cellShift.x, y: diagFrac * cellShift.y }
        bezier(ctx, e0, c0, { x: mid.x - shift.x, y: mid.y - shift.y }, mid)
        bezier(ctx, e1, c1, { x: mid.x + shift.x, y: mid.y + shift.y }, mid)
        return
      }
      c0.y = c1.y = (from.y + to.y) / 2
    } else if (singleLane) {
      const straight = height < cellShift.y ? 0.4 : 0.5
      if (fromPerp) {
        const moved = moveDiag(e1, cellShift, -straight)
        e1 = moved.end
        ctx.beginPath()
        ctx.moveTo(to.x, to.y)
        ctx.lineTo(e1.x, e1.y)
        ctx.stroke()
        c1 = { x: e1.x - diagFrac * cellShift.x, y: e1.y - diagFrac * cellShift.y }
        c0.y += perpOffset
      } else {
        const moved = moveDiag(e0, cellShift, straight)
        ctx.beginPath()
        ctx.moveTo(e0.x, e0.y)
        ctx.lineTo(moved.end.x, moved.end.y)
        ctx.stroke()
        e0 = moved.end
        c0 = { x: e0.x + diagFrac * cellShift.x, y: e0.y + diagFrac * cellShift.y }
        c1.y -= perpOffset
      }
    } else {
      const straight = 1 / 6
      if (fromPerp) c0.y += perpOffset
      else {
        const moved = moveDiag(e0, cellShift, straight)
        ctx.beginPath()
        ctx.moveTo(e0.x, e0.y)
        ctx.lineTo(moved.end.x, moved.end.y)
        ctx.stroke()
        e0 = moved.end
        c0 = moved.control
      }
      if (toPerp) c1.y -= perpOffset
      else {
        const moved = moveDiag(e1, cellShift, -straight)
        ctx.beginPath()
        ctx.moveTo(e1.x, e1.y)
        ctx.lineTo(moved.end.x, moved.end.y)
        ctx.stroke()
        e1 = moved.end
        c1 = moved.control
      }
    }

    bezier(ctx, e0, c0, c1, e1)
  }
}

function moveDiag(start: Point, cellShift: Point, fraction: number) {
  const shift = { x: fraction * cellShift.x, y: fraction * cellShift.y }
  const end = { x: start.x + shift.x, y: start.y + shift.y }
  return { end, control: { x: end.x + shift.x, y: end.y + shift.y } }
}

function bezier(ctx: CanvasRenderingContext2D, e0: Point, c0: Point, c1: Point, e1: Point): void {
  ctx.beginPath()
  ctx.moveTo(e0.x, e0.y)
  ctx.bezierCurveTo(c0.x, c0.y, c1.x, c1.y, e1.x, e1.y)
  ctx.stroke()
}

function drawNode(ctx: CanvasRenderingContext2D, x: number, y: number, row: GraphRow): void {
  const d = NODE_DIMENSION
  const left = x - d / 2
  const top = y - d / 2
  ctx.fillStyle = LANE_COLORS[row.color % LANE_COLORS.length]

  if (row.hasRefs) {
    ctx.fillRect(Math.round(left), Math.round(top), d, d)
  } else {
    ctx.beginPath()
    ctx.arc(x, y, d / 2, 0, Math.PI * 2)
    ctx.fill()
  }

  if (row.isHead) {
    ctx.strokeStyle = "#1a1a1a"
    ctx.lineWidth = 2
    if (row.hasRefs) {
      ctx.strokeRect(Math.round(left) - 1, Math.round(top) - 1, d + 2, d + 2)
    } else {
      ctx.beginPath()
      ctx.arc(x, y, d / 2 + 1, 0, Math.PI * 2)
      ctx.stroke()
    }
  }
}
