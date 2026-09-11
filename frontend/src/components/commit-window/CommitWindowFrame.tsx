import CloseIcon from "@mui/icons-material/Close"
import Box from "@mui/material/Box"
import IconButton from "@mui/material/IconButton"
import Typography from "@mui/material/Typography"
import { useLayoutEffect, useRef, type ReactNode } from "react"
import { useZoom } from "../../theme/zoom"
import { HANDLES, resizeRect, type Handle, type Rect } from "./dialogSize"
import type { Geometry } from "./useCommitDialogSize"

type Props = {
  title: string
  /** The remembered geometry; null leaves the near-full default from commitPaperSx. */
  geometry: Geometry | null
  /** While a commit is submitting the X is out, like Cancel. */
  disabled: boolean
  onClose: () => void
  /** The rect the pointer released at; the owner stores it and re-renders. */
  onResize: (rect: Rect) => void
  /** Extra controls left of the X (the stretch "Open in window" icon). */
  children?: ReactNode
}

const EDGE = 6
const CORNER = 12
const GEOMETRY_PROPS = ["width", "height", "max-width", "max-height", "position", "left", "top", "margin"] as const

/** Where each grip sits on the paper and which cursor it shows. */
const GRIPS: Record<Handle, { cursor: string; sx: Record<string, number> }> = {
  n: { cursor: "ns-resize", sx: { top: 0, left: CORNER, right: CORNER, height: EDGE } },
  s: { cursor: "ns-resize", sx: { bottom: 0, left: CORNER, right: CORNER, height: EDGE } },
  e: { cursor: "ew-resize", sx: { right: 0, top: CORNER, bottom: CORNER, width: EDGE } },
  w: { cursor: "ew-resize", sx: { left: 0, top: CORNER, bottom: CORNER, width: EDGE } },
  ne: { cursor: "nesw-resize", sx: { top: 0, right: 0, width: CORNER, height: CORNER } },
  nw: { cursor: "nwse-resize", sx: { top: 0, left: 0, width: CORNER, height: CORNER } },
  se: { cursor: "nwse-resize", sx: { bottom: 0, right: 0, width: CORNER, height: CORNER } },
  sw: { cursor: "nesw-resize", sx: { bottom: 0, left: 0, width: CORNER, height: CORNER } },
}

/**
 * Writes a visual-px geometry onto the zoomed paper as inline style (the
 * paper's own lengths are multiplied by its CSS zoom, so divide first). A
 * null geometry hands the paper back to the stylesheet default.
 */
function paintGeometry(paper: HTMLElement, geometry: Geometry | null, zoom: number) {
  if (!geometry) {
    for (const prop of GEOMETRY_PROPS) paper.style.removeProperty(prop)
    return
  }
  const px = (v: number) => `${v / zoom}px`
  paper.style.width = px(geometry.width)
  paper.style.maxWidth = px(geometry.width)
  paper.style.height = px(geometry.height)
  paper.style.maxHeight = px(geometry.height)
  if (geometry.left !== undefined && geometry.top !== undefined) {
    // Out of the container's flex centring: the window stays where the drag left it.
    paper.style.position = "absolute"
    paper.style.left = px(geometry.left)
    paper.style.top = px(geometry.top)
    paper.style.margin = "0"
  } else {
    for (const prop of ["position", "left", "top", "margin"]) paper.style.removeProperty(prop)
  }
}

type Drag = { handle: Handle; x: number; y: number; start: Rect; latest: Rect; paper: HTMLElement }

// The commit dialog's window chrome (v0.16.0): a title strip with the close
// X in its top-right corner and eight invisible grips on the paper's edges
// and corners. Dragging a grip resizes the paper directly (no React render
// per pointer move; the diff underneath can be thousands of rows) and hands
// the final rect to the owner on release, which then owns the geometry via
// the layout effect below.
export function CommitWindowFrame({ title, geometry, disabled, onClose, onResize, children }: Props) {
  const zoom = useZoom()
  const headerRef = useRef<HTMLDivElement | null>(null)
  const drag = useRef<Drag | null>(null)
  const paperOf = (el: Element | null) => el?.closest<HTMLElement>(".MuiDialog-paper") ?? null

  useLayoutEffect(() => {
    const paper = paperOf(headerRef.current)
    if (paper) paintGeometry(paper, geometry, zoom)
  }, [geometry, zoom])

  const onPointerDown = (handle: Handle) => (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    const paper = paperOf(e.currentTarget)
    if (!paper) return
    const r = paper.getBoundingClientRect()
    const start = { left: r.left, top: r.top, width: r.width, height: r.height }
    drag.current = { handle, x: e.clientX, y: e.clientY, start, latest: start, paper }
    e.currentTarget.setPointerCapture(e.pointerId)
    e.preventDefault()
  }

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current
    if (!d) return
    const viewport = { width: window.innerWidth, height: window.innerHeight }
    d.latest = resizeRect(d.start, d.handle, e.clientX - d.x, e.clientY - d.y, viewport)
    paintGeometry(d.paper, d.latest, zoom)
  }

  // pointerup ends a normal drag; a GTK focus steal or a touch interruption
  // fires pointercancel / lostpointercapture instead, and must commit too.
  const release = () => {
    const d = drag.current
    if (!d) return
    drag.current = null
    onResize(d.latest)
  }

  return (
    <>
      <Box
        ref={headerRef}
        data-testid="commit-window-header"
        sx={{
          display: "flex",
          alignItems: "center",
          height: 32,
          flexShrink: 0,
          pl: 2,
          pr: 1,
          gap: 0.5,
          borderBottom: 1,
          borderColor: "divider",
          userSelect: "none",
        }}
      >
        <Typography variant="subtitle2" noWrap>
          {title}
        </Typography>
        <Box sx={{ flex: 1 }} />
        {children}
        <IconButton size="small" aria-label="Close" data-testid="commit-close" disabled={disabled} onClick={onClose}>
          <CloseIcon fontSize="small" />
        </IconButton>
      </Box>
      {HANDLES.map((handle) => (
        <Box
          key={handle}
          data-testid={`commit-resize-${handle}`}
          aria-hidden
          onPointerDown={onPointerDown(handle)}
          onPointerMove={onPointerMove}
          onPointerUp={release}
          onPointerCancel={release}
          onLostPointerCapture={release}
          sx={{
            position: "absolute",
            zIndex: 2,
            touchAction: "none",
            cursor: GRIPS[handle].cursor,
            ...GRIPS[handle].sx,
          }}
        />
      ))}
    </>
  )
}
