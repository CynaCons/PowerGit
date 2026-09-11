import { useVirtualizer } from "@tanstack/react-virtual"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { markAncestry } from "../graph/ancestry"
import { authorIdentity } from "../graph/authorIdentity"
import { drawRows, graphWidth } from "../graph/draw"
import { useGraphOptions } from "../graph/graphOptions"
import { useAuthorDiscs } from "../theme/authorDiscs"
import { GraphOptionsBar } from "./GraphOptionsBar"
import { RefChips } from "./RefChips"
import { ROW_HEIGHT, type GraphRow } from "../graph/types"
import { clampWidth, DEFAULT_WIDTHS, loadWidths, saveWidths, type ColumnKey, type ColumnWidths } from "./gridColumns"

type Props = {
  rows: GraphRow[]
  selected: number
  onSelect: (index: number) => void
  onRowContextMenu?: (e: React.MouseEvent, index: number) => void
  /** Right-click on a ref chip (v0.15.0): its own menu, not the row's. */
  onRefContextMenu?: (e: React.MouseEvent, ref: string, kind: "local" | "remote" | "tag", index: number) => void
  loadingTail?: boolean
  onNearEnd?: () => void
  /** Remote names from the ref tree; a ref whose first segment is one of
   *  them is a remote-tracking branch. Without it, any slash counts. */
  remoteNames?: string[]
  /** Tag names from the ref tree; matching chips get the tag glyph. */
  tagNames?: string[]
}

export function RevisionGrid({
  rows,
  selected,
  onSelect,
  onRowContextMenu,
  onRefContextMenu,
  loadingTail,
  onNearEnd,
  remoteNames,
  tagNames,
}: Props) {
  const tagSet = useMemo(() => new Set(tagNames ?? []), [tagNames])
  const parentRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const scrollbarRef = useRef<HTMLDivElement>(null)
  const [hovered, setHovered] = useState(-1)
  // Branch history highlight (v0.14.0): recomputed only when the rows
  // change (a refresh that changes nothing keeps the array, see
  // historyMerge.ts), never per click.
  const ancestry = useMemo(() => markAncestry(rows), [rows])
  const graphOptions = useGraphOptions()
  // Author identity (v0.18.1, prototype A): a disc per row, and the selected
  // row's author marked on every loaded row by that author (class
  // author-same, set here in the render, never by a DOM pass). A pending row
  // has no author, so it never selects one and never carries the class.
  const discs = useAuthorDiscs()
  const selectedAuthor = rows[selected]?.rev.author || null
  const markedAuthor = graphOptions.authorMark ? selectedAuthor : null
  // Last SHA the auto-scroll effect actually settled on. A --date-order
  // refresh can reorder rows so the same commit lands at a different index
  // with no user action; comparing SHAs (not the index) keeps that from
  // yanking the viewport.
  const lastScrolledSha = useRef<string | null>(null)
  // Column widths (v0.14.3, owner: "the columns ... should be resizeable"):
  // user-set pixels kept in localStorage; graph falls back to the automatic
  // width below until the user drags it.
  const [widths, setWidths] = useState<ColumnWidths>(loadWidths)
  useEffect(() => saveWidths(widths), [widths])
  // The graph column is sized by the deepest lane in view and can reach
  // ~660px on a wide history, which pushed Date and SHA off the right edge
  // at ordinary window sizes as more history paged in. Cap it at a share of
  // the grid so the metadata columns always survive; deep lanes past the
  // cap scroll (v0.14.3) instead of being clipped.
  const [bodyWidth, setBodyWidth] = useState(0)
  useEffect(() => {
    const el = parentRef.current
    if (!el || typeof ResizeObserver === "undefined") return
    setBodyWidth(el.getBoundingClientRect().width)
    const ro = new ResizeObserver((entries) => setBodyWidth(entries[0].contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const naturalWidth = graphWidth(rows)
  const autoWidth = bodyWidth > 0 ? Math.min(naturalWidth, Math.max(96, Math.round(bodyWidth * 0.35))) : naturalWidth
  const width = widths.graph ?? autoWidth
  // Horizontal scroll of the graph column when the lanes do not fit
  // (owner: "a discreet scroll bar at the bottom of that column ... shift
  // scroll to scroll left or right"). The canvas is translated by it.
  const overflow = Math.max(0, naturalWidth - width)
  const [graphScroll, setGraphScroll] = useState(0)
  useEffect(() => {
    if (graphScroll > overflow) setGraphScroll(overflow)
  }, [overflow, graphScroll])
  useEffect(() => {
    const el = parentRef.current
    if (!el) return
    // Native listener: React registers wheel as passive, and the body must
    // not also scroll on Shift+wheel.
    const onWheel = (e: WheelEvent) => {
      if (!e.shiftKey) return
      const bar = scrollbarRef.current
      if (!bar || bar.scrollWidth <= bar.clientWidth) return
      e.preventDefault()
      bar.scrollLeft += e.deltaX || e.deltaY
    }
    el.addEventListener("wheel", onWheel, { passive: false })
    return () => el.removeEventListener("wheel", onWheel)
  }, [])

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
  })

  const virtualItems = virtualizer.getVirtualItems()
  const start = virtualItems[0]?.index ?? 0
  const end = (virtualItems[virtualItems.length - 1]?.index ?? 0) + 1

  // Jumping to a ref can select a row far outside the viewport; keep the
  // selection visible. Only do this when the *commit* changed - not merely
  // its index - and only when it truly isn't visible; align:auto alone is
  // not enough since a same-SHA index shuffle would still re-run this
  // effect on every render that changes `selected`.
  useEffect(() => {
    if (selected < 0) return
    const sha = rows[selected]?.rev.id
    if (!sha || sha === lastScrolledSha.current) return
    lastScrolledSha.current = sha
    const parent = parentRef.current
    if (parent) {
      const top = selected * ROW_HEIGHT
      const bottom = top + ROW_HEIGHT
      if (top >= parent.scrollTop && bottom <= parent.scrollTop + parent.clientHeight) return
    }
    virtualizer.scrollToIndex(selected, { align: "auto" })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, rows])

  // History pages in lazily: ask for more when the viewport approaches the
  // loaded tail. The parent guards re-entrancy and the ceiling.
  useEffect(() => {
    if (onNearEnd && rows.length > 0 && end >= rows.length - 60) onNearEnd()
  }, [end, rows.length, onNearEnd])

  useEffect(() => {
    const canvas = canvasRef.current
    const parent = parentRef.current
    if (!canvas || !parent) return
    const visible = Math.max(end - start, 1)
    const dpr = window.devicePixelRatio || 1
    canvas.width = Math.ceil(width * dpr)
    canvas.height = Math.ceil(visible * ROW_HEIGHT * dpr)
    canvas.style.width = `${width}px`
    canvas.style.height = `${visible * ROW_HEIGHT}px`
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    // Shifted left by the graph scroll; the drawn width grows by the same
    // amount so the selection band still spans the visible column.
    ctx.setTransform(dpr, 0, 0, dpr, -graphScroll * dpr, 0)
    drawRows(ctx, rows, start, end, ROW_HEIGHT, width + graphScroll, selected, hovered, ancestry, graphOptions)
  }, [rows, start, end, selected, hovered, width, graphScroll, ancestry, graphOptions])

  // Header drag handles: pointer capture on the handle, width follows the
  // pointer; double-click restores the default.
  const dragStart = useCallback(
    (key: ColumnKey) => (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return
      e.preventDefault()
      const handle = e.currentTarget
      const startX = e.clientX
      const startWidth = key === "graph" ? width : widths[key]
      handle.setPointerCapture(e.pointerId)
      handle.dataset.active = "true"
      const move = (ev: PointerEvent) => {
        setWidths((w) => ({ ...w, [key]: clampWidth(key, startWidth + ev.clientX - startX) }))
      }
      const up = () => {
        delete handle.dataset.active
        handle.removeEventListener("pointermove", move)
        handle.removeEventListener("pointerup", up)
        handle.removeEventListener("pointercancel", up)
      }
      handle.addEventListener("pointermove", move)
      handle.addEventListener("pointerup", up)
      handle.addEventListener("pointercancel", up)
    },
    [width, widths],
  )
  const resetColumn = (key: ColumnKey) => () => setWidths((w) => ({ ...w, [key]: DEFAULT_WIDTHS[key] }))
  const handle = (key: ColumnKey) => (
    <div
      className="col-resize"
      data-testid={`col-resize-${key}`}
      role="separator"
      aria-orientation="vertical"
      aria-label={`Resize ${key} column`}
      onPointerDown={dragStart(key)}
      onDoubleClick={resetColumn(key)}
    />
  )
  const columnVars = {
    ["--graph-width" as string]: `${width}px`,
    ["--col-author" as string]: `${widths.author}px`,
    ["--col-date" as string]: `${widths.date}px`,
    ["--col-sha" as string]: `${widths.sha}px`,
  }

  return (
    <div className="main" data-testid="revision-grid">
      <div className="grid-header" style={columnVars}>
        <div>
          Graph
          {handle("graph")}
        </div>
        <div>Message</div>
        <div>
          Author
          {handle("author")}
        </div>
        <div>
          Date
          {handle("date")}
        </div>
        <div>
          SHA
          {handle("sha")}
        </div>
      </div>
      <div
        ref={parentRef}
        className="grid-body"
        data-testid="grid-body"
        tabIndex={0}
        onMouseLeave={() => setHovered(-1)}
        onKeyDown={(e) => {
          if (e.altKey || e.ctrlKey || e.metaKey) return
          if (rows.length === 0) return
          const last = rows.length - 1
          const cur = selected < 0 ? 0 : selected
          const page = Math.max(1, Math.floor((parentRef.current?.clientHeight ?? ROW_HEIGHT) / ROW_HEIGHT) - 1)
          let next: number
          switch (e.key) {
            case "ArrowDown":
              next = Math.min(cur + 1, last)
              break
            case "ArrowUp":
              next = Math.max(cur - 1, 0)
              break
            case "PageDown":
              next = Math.min(cur + page, last)
              break
            case "PageUp":
              next = Math.max(cur - page, 0)
              break
            case "Home":
              next = 0
              break
            case "End":
              next = last
              break
            default:
              return
          }
          e.preventDefault()
          onSelect(next)
        }}
      >
        <div
          style={{
            height: virtualizer.getTotalSize(),
            position: "relative",
            ...columnVars,
          }}
        >
          <canvas
            ref={canvasRef}
            className="graph-canvas"
            style={{ top: virtualItems[0]?.start ?? 0, height: (end - start) * ROW_HEIGHT, width }}
            data-testid="graph-canvas"
          />
          {virtualItems.map((item) => {
            const row = rows[item.index]
            const identity = discs && row.rev.author ? authorIdentity(row.rev.author) : null
            const same = markedAuthor !== null && row.rev.author === markedAuthor
            return (
              <div
                key={row.rev.id}
                className={`grid-row${item.index === selected ? " selected" : ""}${same ? " author-same" : ""}`}
                data-testid="grid-row"
                data-index={item.index}
                data-artificial={row.artificial}
                onClick={() => {
                  onSelect(item.index)
                  parentRef.current?.focus()
                }}
                onContextMenu={
                  onRowContextMenu
                    ? (e) => {
                        onSelect(item.index)
                        onRowContextMenu(e, item.index)
                      }
                    : undefined
                }
                onMouseEnter={() => setHovered(item.index)}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  transform: `translateY(${item.start}px)`,
                }}
              >
                <div className="graph-cell" />
                <div className="msg">
                  <RefChips
                    refs={row.rev.refs}
                    tagSet={tagSet}
                    remoteNames={remoteNames}
                    onRefContextMenu={
                      onRefContextMenu ? (e, ref, kind) => onRefContextMenu(e, ref, kind, item.index) : undefined
                    }
                  />
                  <span className="msg-text">{row.rev.message}</span>
                </div>
                <div className="author">
                  {identity && (
                    <span className="author-disc" data-palette={identity.palette}>
                      {identity.initials}
                    </span>
                  )}
                  {row.rev.author}
                </div>
                <div className="date">{row.rev.date}</div>
                <div className="sha" data-testid="sha-cell" title={row.artificial ? undefined : row.rev.id}>
                  {row.artificial ? "" : row.rev.id.slice(0, 7)}
                </div>
              </div>
            )
          })}
        </div>
      </div>
      {overflow > 0 && (
        <div
          ref={scrollbarRef}
          className="graph-scrollbar"
          data-testid="graph-scrollbar"
          style={{ width }}
          onScroll={(e) => setGraphScroll(e.currentTarget.scrollLeft)}
        >
          <div style={{ width: naturalWidth }} />
        </div>
      )}
      <GraphOptionsBar rows={rows} selectedAuthor={selectedAuthor} />
      {loadingTail && (
        <div className="grid-tail" data-testid="history-tail-loading">
          Loading more history…
        </div>
      )}
    </div>
  )
}
