import Box from "@mui/material/Box"
import { useRef } from "react"

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
export function SplitHandle({ testid, value, defaultValue, min, maxRatio, getContainerWidth, onChange, onCommit }: Props) {
  const drag = useRef<{ startX: number; startWidth: number } | null>(null)
  // Mirrors `value` synchronously so pointerup can commit the latest width
  // even if the browser fires it before React re-renders with new props.
  const widthRef = useRef(value)
  widthRef.current = value

  const clamp = (width: number) => {
    const max = Math.max(min, getContainerWidth() * maxRatio)
    return Math.min(Math.max(width, min), max)
  }

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    drag.current = { startX: e.clientX, startWidth: widthRef.current }
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return
    const next = clamp(drag.current.startWidth + (e.clientX - drag.current.startX))
    widthRef.current = next
    onChange(next)
  }

  const onPointerUp = () => {
    if (!drag.current) return
    drag.current = null
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
      onPointerUp={onPointerUp}
      onDoubleClick={onDoubleClick}
      sx={{
        width: 6,
        flexShrink: 0,
        cursor: "col-resize",
        bgcolor: "divider",
        "&:hover": { bgcolor: "primary.main" },
      }}
    />
  )
}
