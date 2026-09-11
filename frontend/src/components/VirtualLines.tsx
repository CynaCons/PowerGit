import Box from "@mui/material/Box"
import { useVirtualizer } from "@tanstack/react-virtual"
import { forwardRef, useImperativeHandle, useRef, type CSSProperties, type ReactNode } from "react"

export const CODE_LINE_HEIGHT = 18

/** Imperative surface (v0.17.0, review mode): scroll a row into view, focus the list. */
export type VirtualLinesHandle = {
  scrollToIndex: (index: number, options?: { align?: "auto" | "start" | "center" | "end" }) => void
  focus: () => void
}

/**
 * v0.13.11: a line-oriented virtual list for code (diffs, blobs). Only the
 * visible rows exist in the DOM, so a 50k-line file is a few hundred
 * elements instead of a million — WebKitGTK never gets the full tree. The
 * container is focusable and scrolls with the keyboard (arrows, PageUp/
 * PageDown, Home/End); text selection works across the rendered window.
 */
export const VirtualLines = forwardRef<
  VirtualLinesHandle,
  {
    count: number
    renderLine: (index: number) => ReactNode
    testid?: string
    sx?: CSSProperties
    ariaLabel?: string
    /** Rendered above the lines inside the scroll container (notices). */
    header?: ReactNode
    /** `data-hotkey-surface` on the scroll container (v0.17.0: "review" while review mode is on). */
    hotkeySurface?: string
    /** Leave every key to the host (v0.17.0): the review layer owns
     *  Arrow/Home/End while it is on, and this list must not scroll a
     *  second time underneath it. Unhandled keys fall to the browser. */
    passKeys?: boolean
  }
>(function VirtualLines({ count, renderLine, testid, sx, ariaLabel, header, hotkeySurface, passKeys }, ref) {
  const parentRef = useRef<HTMLDivElement>(null)
  const virtualizer = useVirtualizer({
    count,
    getScrollElement: () => parentRef.current,
    estimateSize: () => CODE_LINE_HEIGHT,
    overscan: 20,
  })

  useImperativeHandle(
    ref,
    () => ({
      scrollToIndex: (index, options) => virtualizer.scrollToIndex(index, { align: options?.align ?? "auto" }),
      focus: () => parentRef.current?.focus(),
    }),
    [virtualizer],
  )

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const el = parentRef.current
    if (!el || passKeys) return
    const page = Math.max(CODE_LINE_HEIGHT, el.clientHeight - CODE_LINE_HEIGHT)
    const map: Record<string, number | "home" | "end"> = {
      ArrowDown: CODE_LINE_HEIGHT,
      ArrowUp: -CODE_LINE_HEIGHT,
      PageDown: page,
      PageUp: -page,
      Home: "home",
      End: "end",
    }
    const delta = map[e.key]
    if (delta === undefined) return
    e.preventDefault()
    if (delta === "home") el.scrollTop = 0
    else if (delta === "end") el.scrollTop = el.scrollHeight
    else el.scrollTop += delta
  }

  return (
    <Box
      ref={parentRef}
      data-testid={testid}
      data-hotkey-surface={hotkeySurface}
      tabIndex={0}
      role="region"
      aria-label={ariaLabel}
      onKeyDown={onKeyDown}
      sx={{
        flex: 1,
        minHeight: 0,
        minWidth: 0,
        overflow: "auto",
        outline: "none",
        "&:focus-visible": { boxShadow: "inset 0 0 0 1px var(--pg-focus-ring, #2563eb)" },
      }}
      style={sx}
    >
      {header}
      <div style={{ height: virtualizer.getTotalSize(), position: "relative", width: "max-content", minWidth: "100%" }}>
        {virtualizer.getVirtualItems().map((item) => (
          <div
            key={item.key}
            data-index={item.index}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              minWidth: "100%",
              height: CODE_LINE_HEIGHT,
              transform: `translateY(${item.start}px)`,
              whiteSpace: "pre",
            }}
          >
            {renderLine(item.index)}
          </div>
        ))}
      </div>
    </Box>
  )
})
