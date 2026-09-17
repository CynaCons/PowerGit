import Box from "@mui/material/Box"
import { useRef, useState } from "react"
import { getZoom } from "../theme/zoom"

type Props = {
  testid: string
  value: number
  defaultValue: number
  min: number
  maxRatio: number
  getContainerWidth: () => number
  onChange: (width: number) => void
  onCommit: (width: number) => void
}

// Thin vertical drag handle for resizing a file-list/tree column next to its
// detail pane. Width state and persistence stay with the caller so multiple
// call sites (e.g. the Files and File Tree tabs) can share one source of
// truth for the width.
export function SplitHandle({
  testid,
  value,
  defaultValue,
  min,
  maxRatio,
  getContainerWidth,
  onChange,
  onCommit,
}: Props) {
  const drag = useRef<{ startX: number; startWidth: number } | null>(null)
  // Mirrors `value` synchronously so release() can commit the latest width
  // even if the browser fires it before React re-renders with new props.
  const widthRef = useRef(value)
  widthRef.current = value
  const [dragging, setDragging] = useState(false)

  const clamp = (width: number) => {
    const max = Math.max(min, getContainerWidth() * maxRatio)
    return Math.min(Math.max(width, min), max)
  }

  // Left button only, default-prevented before the capture so the compat
  // mousedown never arms a text-selection drag across the diff text next
  // to the handle (v0.18.18, docs/perf/reactivity-review-2026-09-17.md
  // second pass finding 6); same shape as the grid's column handles.
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    e.preventDefault()
    drag.current = { startX: e.clientX, startWidth: widthRef.current }
    setDragging(true)
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return
    // clientX is visual px; the width is local px inside the zoomed subtree
    // (#root, or a dialog paper - theme/index.ts zooms both), so the delta
    // is divided by the zoom or the column edge outruns the pointer at
    // 150 % (v0.18.18, docs/perf/reactivity-review-2026-09-17.md second
    // pass finding 3). getZoom() rather than useZoom(): no hook for a value
    // only read mid-drag.
    const next = clamp(drag.current.startWidth + (e.clientX - drag.current.startX) / getZoom())
    widthRef.current = next
    onChange(next)
  }

  // pointerup ends a normal drag, but a GTK focus steal, touch/stylus
  // interruption, or any other capture revocation fires pointercancel /
  // lostpointercapture instead - without handling those the same way the
  // handle gets stuck mid-drag with an uncommitted width.
  const release = () => {
    if (!drag.current) return
    drag.current = null
    setDragging(false)
    onCommit(widthRef.current)
  }

  const onDoubleClick = () => {
    const next = clamp(defaultValue)
    widthRef.current = next
    onChange(next)
    onCommit(next)
  }

  return (
    <Box
      data-testid={testid}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={release}
      onPointerCancel={release}
      onLostPointerCapture={release}
      onDoubleClick={onDoubleClick}
      sx={{
        width: 8,
        flexShrink: 0,
        cursor: "col-resize",
        // Belt and braces with the preventDefault above: Chromium does not
        // start a selection from a user-select:none mousedown target.
        userSelect: "none",
        bgcolor: dragging ? "primary.dark" : "divider",
        "&:hover": { bgcolor: dragging ? "primary.dark" : "primary.main" },
      }}
    />
  )
}
