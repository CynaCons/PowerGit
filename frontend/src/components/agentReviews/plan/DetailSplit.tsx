import Box from "@mui/material/Box"
import { useRef, useState } from "react"
import { DETAIL_MIN, storeDetailHeight as store } from "./detailHeight"

// The handle between the plan's graph and the step detail (v0.22.2, owner:
// "Make the panels resizeable in the branch plan. Otherwise its not
// usable"): drag it, or use the arrow keys, to give the detail more or less
// of the pane. The height is kept per user.

const MIN = DETAIL_MIN
const STEP = 24

export function DetailSplit({
  height,
  onHeight,
  getPaneHeight,
}: {
  height: number
  onHeight: (height: number) => void
  /** The pane holding graph and detail: the detail leaves the graph at least 120 px. */
  getPaneHeight: () => number
}) {
  const drag = useRef<{ y: number; h: number } | null>(null)
  const [dragging, setDragging] = useState(false)
  const clamp = (h: number) => Math.round(Math.min(Math.max(h, MIN), Math.max(MIN, getPaneHeight() - 120)))
  return (
    <Box
      role="separator"
      aria-orientation="horizontal"
      aria-label="Resize the step detail"
      aria-valuenow={height}
      tabIndex={0}
      data-testid="plan-detail-splitter"
      onPointerDown={(e) => {
        if (e.button !== 0) return
        e.preventDefault()
        drag.current = { y: e.clientY, h: height }
        e.currentTarget.setPointerCapture(e.pointerId)
        setDragging(true)
      }}
      onPointerMove={(e) => {
        if (!drag.current) return
        onHeight(clamp(drag.current.h + (drag.current.y - e.clientY)))
      }}
      onPointerUp={(e) => {
        if (!drag.current) return
        const next = clamp(drag.current.h + (drag.current.y - e.clientY))
        drag.current = null
        setDragging(false)
        onHeight(next)
        store(next)
      }}
      onKeyDown={(e) => {
        const delta = e.key === "ArrowUp" ? STEP : e.key === "ArrowDown" ? -STEP : 0
        if (!delta) return
        e.preventDefault()
        const next = clamp(height + delta)
        onHeight(next)
        store(next)
      }}
      sx={{
        height: 7,
        flexShrink: 0,
        cursor: "row-resize",
        borderTop: 1,
        borderColor: "divider",
        bgcolor: dragging ? "primary.main" : "transparent",
        opacity: dragging ? 0.5 : 1,
        "&:hover": { bgcolor: "action.hover" },
        "&:focus-visible": { outline: "2px solid", outlineColor: "primary.main", outlineOffset: -2 },
        touchAction: "none",
      }}
    />
  )
}
