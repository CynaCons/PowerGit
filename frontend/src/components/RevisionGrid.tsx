import { useVirtualizer } from "@tanstack/react-virtual"
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { extendAncestry } from "../graph/ancestry"
import { authorIdentity } from "../graph/authorIdentity"
import { drawRows, graphWidth } from "../graph/draw"
import { useGraphOptions } from "../graph/graphOptions"
import { useAuthorDiscs } from "../theme/authorDiscs"
import { getZoom, useZoom } from "../theme/zoom"
import { GraphOptionsBar } from "./GraphOptionsBar"
import { RevisionRow } from "./RevisionRow"
import { ROW_HEIGHT, type GraphRow } from "../graph/types"
import { clampWidth, DEFAULT_WIDTHS, loadWidths, saveWidths, type ColumnKey, type ColumnWidths } from "./gridColumns"
import { chipBudget, gridGeometry, type RowBand } from "./gridGeometry"
import { useHeldKey } from "./heldKey"
import { useViewportAnchor } from "../hooks/useViewportAnchor"

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
  /** The checked-out branch: its chip comes first after HEAD (v0.18.3). */
  currentBranch?: string | null
  /** v0.18.5: rendered at the end of the Message header cell (the ref filter's chip). */
  headerExtra?: ReactNode
  /** v0.18.12: the compass, floated at the bottom-right of the body (GraphCompass). */
  compass?: ReactNode
  /** v0.18.12: the SHA the history is paging towards; the tail names it. */
  loadingTarget?: string | null
  /** Highlight ancestry (v0.18.4): the commit whose history is highlighted
   *  instead of HEAD's, or null. Owned by the history (useHistory). */
  highlightRoot?: string | null
  /** Set by Alt+click and the menu, cleared by Escape, Exit and a refresh
   *  that drops the root row. */
  onHighlightRoot?: (sha: string | null) => void
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
  currentBranch,
  headerExtra,
  compass,
  loadingTarget = null,
  highlightRoot = null,
  onHighlightRoot,
}: Props) {
  const tagSet = useMemo(() => new Set(tagNames ?? []), [tagNames])
  const parentRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const scrollbarRef = useRef<HTMLDivElement>(null)
  const [hovered, setHovered] = useState(-1)
  // Menus are supplied by panes that may recreate their handlers while the
  // graph rows themselves have not changed. Keep the row-facing callbacks
  // stable so React.memo can retain every unaffected visible row.
  const rowContextMenuRef = useRef(onRowContextMenu)
  const refContextMenuRef = useRef(onRefContextMenu)
  const onSelectRef = useRef(onSelect)
  useEffect(() => {
    rowContextMenuRef.current = onRowContextMenu
    refContextMenuRef.current = onRefContextMenu
    onSelectRef.current = onSelect
  }, [onRowContextMenu, onRefContextMenu, onSelect])
  // The one row grown to show every ref (v0.18.3, variant B), by SHA so a
  // --date-order refresh that moves it keeps it open. +n opens, − / +n on
  // another row / Escape close.
  const [expandedSha, setExpandedSha] = useState<string | null>(null)
  // Branch history highlight (v0.14.0): recomputed only when the rows or
  // the root change (a refresh that changes nothing keeps the array, see
  // historyMerge.ts), never per click. The root is HEAD unless the user
  // picked a commit (v0.18.4, "Highlight ancestry (until refresh)").
  const ancestryCache = useRef<{ rows: GraphRow[]; ancestry: ReturnType<typeof extendAncestry> } | undefined>(undefined)
  const ancestry = useMemo(() => {
    const previous = ancestryCache.current
    const next = extendAncestry(previous?.rows, previous?.ancestry, rows, highlightRoot ?? undefined)
    ancestryCache.current = { rows, ancestry: next }
    return next
  }, [rows, highlightRoot])
  const rootRow = useMemo(
    () => (highlightRoot === null ? null : (rows.find((r) => r.rev.id === highlightRoot) ?? null)),
    [rows, highlightRoot],
  )
  // A refresh that drops the root row (a rebase rewrote it, a filter that
  // no longer lists it) ends the highlight instead of dimming everything.
  // Not while the list is empty: a ref-filter reload (v0.18.5) empties the
  // rows for a moment and keeps the selection, and the root with it.
  useEffect(() => {
    if (highlightRoot !== null && rows.length > 0 && rootRow === null && onHighlightRoot) onHighlightRoot(null)
  }, [highlightRoot, rows.length, rootRow, onHighlightRoot])
  const exitHighlight = useCallback(() => onHighlightRoot?.(null), [onHighlightRoot])
  const graphOptions = useGraphOptions()
  // The canvas sits under #root { zoom } (theme/index.ts), which scales the
  // element but not window.devicePixelRatio: at 150 % a bitmap sized by the
  // dpr alone covers 1.5x its pixels and the compositor upscales it, so the
  // 2 px lanes and 10 px nodes go soft exactly when the user zoomed in to
  // see them (v0.18.18, docs/perf/reactivity-review-2026-09-17.md second
  // pass finding 8). The backing store is sized by dpr * zoom below; the
  // CSS size stays in local px, so the drawing keeps its ROW_HEIGHT units.
  const zoom = useZoom()
  // The local width/height and the device scale the canvas backing store
  // was last sized to (v0.18.18): assigning canvas.width/height resets the
  // whole bitmap even when the number does not change, so the draw effect
  // below only touches them - and the CSS width/height that must track the
  // same numbers - on an actual change instead of on every hover, selection
  // or scroll step (docs/perf/reactivity-review-2026-09-17.md finding 8).
  const lastCanvasSize = useRef({ width: -1, height: -1, scale: 0 })
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
  // Lane width only changes with the graph rows. Hover, selection, scroll
  // geometry and column drags all re-render this component without changing
  // those rows, so never make those paths rescan the complete history.
  const naturalWidth = useMemo(() => graphWidth(rows), [rows])
  const autoWidth = useMemo(
    () => (bodyWidth > 0 ? Math.min(naturalWidth, Math.max(96, Math.round(bodyWidth * 0.35))) : naturalWidth),
    [bodyWidth, naturalWidth],
  )
  const width = widths.graph ?? autoWidth
  // Horizontal scroll of the graph column when the lanes do not fit
  // (owner: "a discreet scroll bar at the bottom of that column ... shift
  // scroll to scroll left or right"). The canvas is translated by it.
  const overflow = Math.max(0, naturalWidth - width)
  // Ref chips fold by width (v0.18.3): 60 % of the message column.
  const budget = chipBudget(bodyWidth, width, widths.author, widths.date, widths.sha)
  const [graphScroll, setGraphScroll] = useState(0)
  useEffect(() => {
    if (graphScroll > overflow) setGraphScroll(overflow)
  }, [overflow, graphScroll])
  useEffect(() => {
    const el = parentRef.current
    if (!el) return
    // Native listener: React registers wheel as passive. This one used to
    // be { passive: false } + preventDefault, on the theory that el (the
    // vertical list, also the virtualizer's own scroll element) might also
    // scroll on Shift+wheel. It does not need to (v0.18.18): Chromium/
    // WebView2 and WebKitGTK both zero deltaY and move the value to
    // deltaX for a Shift+wheel event before it ever reaches this handler,
    // and el's own columns are sized to fit it (gridColumns.ts, the
    // graph's auto width and the metadata widths' floors in the
    // <=1200px rule at app.css:45-51), so it has no horizontal overflow
    // for that deltaX to act on and el does not move. (A user-dragged
    // column wide enough to force one is no different from today: a
    // plain two-finger horizontal swipe, deltaX without Shift, already
    // bypasses this handler and scrolls el natively.) Passive removes the
    // main-thread wait the compositor otherwise takes on every plain
    // vertical wheel tick this handler returns early from
    // (docs/perf/reactivity-review-2026-09-17.md finding 3).
    const onWheel = (e: WheelEvent) => {
      if (!e.shiftKey) return
      const bar = scrollbarRef.current
      if (!bar || bar.scrollWidth <= bar.clientWidth) return
      bar.scrollLeft += e.deltaX || e.deltaY
    }
    el.addEventListener("wheel", onWheel, { passive: true })
    return () => el.removeEventListener("wheel", onWheel)
  }, [])

  // Rows are ROW_HEIGHT tall except the expanded one, which measureElement
  // measures (offsetHeight and the ResizeObserver's border box, both local
  // px under the #root zoom). Sizes are cached by SHA, not index, so a
  // refresh that shifts the rows keeps the tall one tall and no other.
  const getItemKey = useCallback((index: number) => rows[index]?.rev.id ?? index, [rows])
  // react-virtual defaults useFlushSync to true: every 28 px range change
  // during a scroll wraps the rerender in ReactDOM.flushSync on the
  // SyncLane, which forces the canvas effect below to flush and repaint
  // before the frame does instead of coalescing with it (v0.18.18,
  // docs/perf/reactivity-review-2026-09-17.md finding 3). Nothing here
  // needs the range updated synchronously within the same event: the
  // jump-to-selected effect below calls scrollToIndex and returns without
  // reading getVirtualItems() again, and useGraphNav's select() /
  // useHistory's jumpToRef+jumpToCommit only ever call setSelectedSha and
  // let the next render pick up the new range. A batched render is safe
  // and lets several scroll events land in one commit per frame; overscan
  // 12 (336 px) covers the one-frame lag.
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    getItemKey,
    overscan: 12,
    useFlushSync: false,
  })
  const measureRow = useCallback((el: HTMLDivElement | null) => virtualizer.measureElement(el), [virtualizer])

  const virtualItems = virtualizer.getVirtualItems()
  const end = (virtualItems[virtualItems.length - 1]?.index ?? 0) + 1
  useViewportAnchor(rows, selected, virtualItems, virtualizer, parentRef, lastScrolledSha)

  // The canvas geometry: the visible bands plus a neighbour on each side
  // (graph/draw.ts). getVirtualItems() is memoised inside the virtualizer,
  // so this only recomputes when a row moved or changed height.
  const geometry = useMemo(() => {
    const bandOf = (index: number): RowBand | undefined => {
      const m = virtualizer.measurementsCache[index]
      return m ? { index: m.index, start: m.start, size: m.size } : undefined
    }
    return gridGeometry(virtualItems, bandOf)
  }, [virtualItems, virtualizer])

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
      const item = virtualizer.measurementsCache[selected]
      const top = item?.start ?? selected * ROW_HEIGHT
      const bottom = top + (item?.size ?? ROW_HEIGHT)
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
    // Device pixels per local px: the monitor's ratio times the application
    // zoom, since CSS zoom scales the element without touching the dpr.
    const scale = (window.devicePixelRatio || 1) * zoom
    const last = lastCanvasSize.current
    // Resize only on a real change (v0.18.18): canvas.width/height clears
    // the backing store even when reassigned the same value, so doing this
    // unconditionally reallocated and discarded a ~0.25-0.5 Mpx bitmap on
    // every hover and every 28 px scroll step for no reason. drawRows
    // clearRects its own rect first (graph/draw.ts:76), so skipping the
    // resize does not skip the clear. The scale is part of the compare so a
    // zoom step or a monitor change resizes the bitmap.
    if (last.width !== width || last.height !== geometry.height || last.scale !== scale) {
      canvas.width = Math.ceil(width * scale)
      canvas.height = Math.ceil(geometry.height * scale)
      canvas.style.width = `${width}px`
      canvas.style.height = `${geometry.height}px`
      lastCanvasSize.current = { width, height: geometry.height, scale }
    }
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    // Shifted left by the graph scroll; the drawn width grows by the same
    // amount so the selection band still spans the visible column.
    ctx.setTransform(scale, 0, 0, scale, -graphScroll * scale, 0)
    drawRows(ctx, rows, geometry, width + graphScroll, selected, hovered, ancestry, graphOptions)
  }, [rows, geometry, selected, hovered, width, graphScroll, ancestry, graphOptions, zoom])

  // Header drag handles: pointer capture on the handle, width follows the
  // pointer; double-click restores the default. clientX is visual px while
  // the widths are local px under the #root zoom (theme/zoom.ts), so the
  // delta is divided by the zoom or the edge outruns the pointer at 150 %
  // and lags it at 70 % (v0.18.18, docs/perf/reactivity-review-2026-09-17.md
  // second pass finding 3). getZoom() is read inside the closure so the
  // callback needs no new dependency; a zoom change mid-drag is not a case
  // worth handling (Ctrl+= with a button held).
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
        setWidths((w) => ({ ...w, [key]: clampWidth(key, startWidth + (ev.clientX - startX) / getZoom()) }))
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
  // Expanding or folding also resets the previously expanded row's cached
  // size: folded off-screen (Escape, +n elsewhere) it has no element for
  // the ResizeObserver to re-measure, and its stale height would leave a
  // phantom gap in the list until it scrolled back into the overscan.
  const setExpanded = useCallback(
    (next: string | null) => {
      if (expandedSha !== null && expandedSha !== next) {
        const i = rows.findIndex((r) => r.rev.id === expandedSha)
        if (i >= 0) virtualizer.resizeItem(i, ROW_HEIGHT)
      }
      setExpandedSha(next)
    },
    [expandedSha, rows, virtualizer],
  )
  const foldRow = useCallback(() => setExpanded(null), [setExpanded])
  // Alt+click (Git Extensions' gesture) makes the row the ancestry root; it
  // still selects. A pending row is not a commit and never a root.
  const clickRow = useCallback(
    (index: number, e: React.MouseEvent) => {
      onSelectRef.current(index)
      const row = rows[index]
      if (e.altKey && onHighlightRoot && row && !row.artificial) onHighlightRoot(row.rev.id)
      parentRef.current?.focus()
    },
    [rows, onHighlightRoot],
  )
  const contextRow = useCallback((e: React.MouseEvent, index: number) => {
    onSelectRef.current(index)
    rowContextMenuRef.current?.(e, index)
  }, [])
  const hoverRow = useCallback((index: number) => setHovered(index), [])
  // Held arrow / page keys select once per frame (heldKey.ts, v0.18.18).
  const heldKey = useHeldKey(onSelectRef)
  const refContextRow = useCallback(
    (e: React.MouseEvent, ref: string, kind: "local" | "remote" | "tag", index: number) => {
      refContextMenuRef.current?.(e, ref, kind, index)
    },
    [],
  )
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
        <div style={headerExtra ? { display: "flex", alignItems: "center" } : undefined}>
          Message
          {headerExtra}
        </div>
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
        onKeyUp={heldKey.release}
        onBlur={heldKey.release}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            // Folds the expanded row, else exits the ancestry highlight;
            // with neither, the key goes on (the file history closes on it).
            if (expandedSha !== null) foldRow()
            else if (highlightRoot !== null) exitHighlight()
            else return
            e.preventDefault()
            e.stopPropagation()
            return
          }
          if (e.altKey || e.ctrlKey || e.metaKey) return
          if (rows.length === 0) return
          const last = rows.length - 1
          const cur = heldKey.pending() ?? (selected < 0 ? 0 : selected)
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
          if (e.repeat && e.key !== "Home" && e.key !== "End") {
            heldKey.repeat(next)
            return
          }
          // A press (or Home/End) supersedes whatever a hold had pending.
          heldKey.release()
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
            style={{ top: geometry.top, height: geometry.height, width }}
            data-testid="graph-canvas"
          />
          {virtualItems.map((item) => {
            const row = rows[item.index]
            return (
              <RevisionRow
                key={row.rev.id}
                row={row}
                index={item.index}
                start={item.start}
                selected={item.index === selected}
                hovered={item.index === hovered}
                sameAuthor={markedAuthor !== null && row.rev.author === markedAuthor}
                identity={discs && row.rev.author ? authorIdentity(row.rev.author) : null}
                expanded={row.rev.id === expandedSha}
                budget={budget}
                tagSet={tagSet}
                remoteNames={remoteNames}
                currentBranch={currentBranch}
                measureRef={measureRow}
                onClick={clickRow}
                onContextMenu={contextRow}
                onMouseEnter={hoverRow}
                onRefContextMenu={refContextRow}
                onExpand={setExpanded}
                onFold={foldRow}
              />
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
      <GraphOptionsBar
        rows={rows}
        selectedAuthor={selectedAuthor}
        highlightRoot={rootRow}
        onExitHighlight={exitHighlight}
      />
      {compass}
      {(loadingTail || loadingTarget) && (
        <div className="grid-tail" data-testid="history-tail-loading">
          {loadingTarget ? `Loading history to ${loadingTarget.slice(0, 7)}…` : "Loading more history…"}
        </div>
      )}
    </div>
  )
}
