import Box from "@mui/material/Box"
import { type CSSProperties, createElement, useEffect, useRef, useState, useSyncExternalStore } from "react"
import { deskGap } from "../../theme/panels"
import { SplitHandle } from "../SplitHandle"

export const REVIEW_PANES = {
  files: { key: "pg.reviewFilesWidth", defaultValue: 220, min: 140, maxRatio: 0.35 },
  board: { key: "pg.reviewBoardWidth", defaultValue: 340, min: 260, maxRatio: 0.45 },
} as const
export type ReviewPane = keyof typeof REVIEW_PANES
export type ReviewLayout = Record<ReviewPane, number>
const DEFAULT_LAYOUT: ReviewLayout = { files: 220, board: 340 }

export function parseReviewWidth(raw: string | null, pane: ReviewPane): number {
  const width = raw?.trim() ? Number(raw) : NaN
  return Number.isFinite(width) && width > 0 ? width : REVIEW_PANES[pane].defaultValue
}
export function clampReviewWidth(width: number, pane: ReviewPane, gridWidth: number): number {
  const { min, maxRatio, defaultValue } = REVIEW_PANES[pane]
  return Math.min(Math.max(Number.isFinite(width) ? width : defaultValue, min), Math.max(min, gridWidth * maxRatio))
}
function readStored(pane: ReviewPane): number {
  try {
    return parseReviewWidth(window.localStorage.getItem(REVIEW_PANES[pane].key), pane)
  } catch {
    return REVIEW_PANES[pane].defaultValue
  }
}
let layout: ReviewLayout = { files: readStored("files"), board: readStored("board") }
const listeners = new Set<() => void>()
export function getReviewLayout(): ReviewLayout {
  return layout
}
export function setReviewLayout(pane: ReviewPane, width: number): void {
  const next = parseReviewWidth(String(width), pane)
  layout = { ...layout, [pane]: next }
  try {
    window.localStorage.setItem(REVIEW_PANES[pane].key, String(next))
  } catch {
    // Storage refused: keep the choice for this window.
  }
  for (const listener of listeners) listener()
}
function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
export function useReviewLayout(): ReviewLayout {
  return useSyncExternalStore(subscribe, getReviewLayout, () => DEFAULT_LAYOUT)
}

// Isolate grid wiring to keep ReviewScreen within the file-size limit.
export function useReviewGrid() {
  const widths = useReviewLayout()
  const ref = useRef<HTMLDivElement>(null)
  const [gridWidth, setGridWidth] = useState(0)
  useEffect(() => {
    const grid = ref.current
    if (!grid) return
    const observer = new ResizeObserver(() => setGridWidth(grid.clientWidth))
    setGridWidth(grid.clientWidth)
    observer.observe(grid)
    return () => observer.disconnect()
  }, [])
  const effective = (pane: ReviewPane) => clampReviewWidth(widths[pane], pane, gridWidth || Infinity)
  const style = { "--rv-files": `${effective("files")}px`, "--rv-board": `${effective("board")}px` } as CSSProperties
  const handles = (["files", "board"] as const).map((pane) =>
    createElement(
      Box,
      {
        key: pane,
        sx: {
          position: "absolute",
          top: 0,
          bottom: 0,
          zIndex: 1,
          display: "flex",
          width: deskGap,
          ...(pane === "files" ? { left: "var(--rv-files, 220px)" } : { right: "var(--rv-board, 340px)" }),
          "@container (max-width: 900px)": { display: "none" },
        },
      },
      createElement(SplitHandle, {
        ...REVIEW_PANES[pane],
        testid: `review-${pane}-splitter`,
        edge: pane === "files" ? "left" : "right",
        value: effective(pane),
        getContainerWidth: () => ref.current?.clientWidth ?? gridWidth,
        onChange: (width) => ref.current?.style.setProperty(`--rv-${pane}`, `${width}px`),
        onCommit: (width) => setReviewLayout(pane, width),
      }),
    ),
  )
  return { ref, style, handles }
}
