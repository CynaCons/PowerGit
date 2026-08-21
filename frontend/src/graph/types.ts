export type Revision = {
  id: string
  parents: string[]
  message: string
  author: string
  date: string
  refs: string[]
}

export type LaneSharing = "exclusive" | "differentStart" | "differentEnd" | "entire"

export type RowSegment = {
  id: string
  childId: string
  parentId: string
  lane: number
  color: number
  sharing: LaneSharing
}

export type GraphRow = {
  rev: Revision
  lane: number
  color: number
  hasRefs: boolean
  isHead: boolean
  segments: RowSegment[]
}

export const LANE_WIDTH = 16
export const LANE_LINE_WIDTH = 2
export const NODE_DIMENSION = 10
export const MAX_LANES = 40
export const ROW_HEIGHT = 28
export const NO_LANE = -10

/** Git Extensions AppColor.GraphBranch1–7 */
export const LANE_COLORS = [
  "#f064a0",
  "#78b4e6",
  "#24c221",
  "#a078f0",
  "#dd3228",
  "#1ac6a6",
  "#e7b00f",
]

export const NON_RELATIVE_COLOR = "#a0a0a0"
