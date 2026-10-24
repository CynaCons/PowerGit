import Box from "@mui/material/Box"
import { useRef, useState } from "react"
import { HEIGHT_MIN, storeHeight } from "./detailHeight"

// A horizontal handle on the plan screen (v0.22.2, owner: "Make the panels
// resizeable in the branch plan. Otherwise its not usable"; v0.22.3: "you
// didnt make the top panel resizeable"): between the graph and the step
// detail (the detail grows upwards) and under the top panel (it grows
// downwards). Drag it, or focus it and use the arrow keys. The height is
// kept per user.

const STEP = 24

export function DetailSplit({
  height,
  onHeight,
  getMax,
  grow = "up",
  storageKey,
  label,
  testid,
}: {
  height: number
  onHeight: (height: number) => void
  /** The largest height the panel may take now. */
  getMax: () => number
  /** "up": the panel is below the handle; "down": above it. */
  grow?: "up" | "down"
  storageKey: string
  label: string
  testid: string
}) {
  const drag = useRef<{ y: number; h: number } | null>(null)
  const [dragging, setDragging] = useState(false)
  const sign = grow === "up" ? -1 : 1
  const clamp = (h: number) => Math.round(Math.min(Math.max(h, HEIGHT_MIN), Math.max(HEIGHT_MIN, getMax())))
  return (
    <Box
      role="separator"
      aria-orientation="horizontal"
      aria-label={label}
      aria-valuenow={height}
      tabIndex={0}
      data-testid={testid}
      onPointerDown={(e) => {
        if (e.button !== 0) return
        e.preventDefault()
        drag.current = { y: e.clientY, h: height }
        e.currentTarget.setPointerCapture(e.pointerId)
        setDragging(true)
      }}
      onPointerMove={(e) => {
        if (!drag.current) return
        onHeight(clamp(drag.current.h + sign * (e.clientY - drag.current.y)))
      }}
      onPointerUp={(e) => {
        if (!drag.current) return
        const next = clamp(drag.current.h + sign * (e.clientY - drag.current.y))
        drag.current = null
        setDragging(false)
        onHeight(next)
        storeHeight(storageKey, next)
      }}
      onKeyDown={(e) => {
        const delta = e.key === "ArrowUp" ? -STEP : e.key === "ArrowDown" ? STEP : 0
        if (!delta) return
        e.preventDefault()
        const next = clamp(height + sign * delta)
        onHeight(next)
        storeHeight(storageKey, next)
      }}
      sx={{
        height: 7,
        flexShrink: 0,
        cursor: "row-resize",
        borderRadius: 1,
        bgcolor: dragging ? "primary.main" : "transparent",
        opacity: dragging ? 0.5 : 1,
        "&:hover": { bgcolor: "action.hover" },
        "&:focus-visible": { outline: "2px solid", outlineColor: "primary.main", outlineOffset: -2 },
        touchAction: "none",
      }}
    />
  )
}
