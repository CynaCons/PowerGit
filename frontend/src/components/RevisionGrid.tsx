import { useVirtualizer } from "@tanstack/react-virtual"
import { useEffect, useRef, useState } from "react"
import { drawRows, graphWidth } from "../graph/draw"
import { ROW_HEIGHT, type GraphRow } from "../graph/types"

type Props = {
  rows: GraphRow[]
  selected: number
  onSelect: (index: number) => void
  onRowContextMenu?: (e: React.MouseEvent, index: number) => void
  loadingTail?: boolean
  onNearEnd?: () => void
}

export function RevisionGrid({ rows, selected, onSelect, onRowContextMenu, loadingTail, onNearEnd }: Props) {
  const parentRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [hovered, setHovered] = useState(-1)
  // Last SHA the auto-scroll effect actually settled on. A --date-order
  // refresh can reorder rows so the same commit lands at a different index
  // with no user action; comparing SHAs (not the index) keeps that from
  // yanking the viewport.
  const lastScrolledSha = useRef<string | null>(null)
  // The graph column is sized by the deepest lane in view and can reach
  // ~660px on a wide history, which pushed Date and SHA off the right edge
  // at ordinary window sizes as more history paged in. Cap it at a share of
  // the grid so the metadata columns always survive; deep lanes past the cap
  // are clipped rather than allowed to eat the row.
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
  const width = bodyWidth > 0 ? Math.min(naturalWidth, Math.max(96, Math.round(bodyWidth * 0.35))) : naturalWidth
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
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    drawRows(ctx, rows, start, end, ROW_HEIGHT, width, selected, hovered)
  }, [rows, start, end, selected, hovered, width])

  return (
    <div className="main" data-testid="revision-grid">
      <div className="grid-header" style={{ ["--graph-width" as string]: `${width}px` }}>
        <div>Graph</div>
        <div>Message</div>
        <div>Author</div>
        <div>Date</div>
        <div>SHA</div>
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
          let next = cur
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
            ["--graph-width" as string]: `${width}px`,
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
            const refs = visibleRefs(row.rev.refs)
            return (
              <div
                key={row.rev.id}
                className={`grid-row${item.index === selected ? " selected" : ""}`}
                data-testid="grid-row"
                data-index={item.index}
                onClick={() => {
                  onSelect(item.index)
                  parentRef.current?.focus()
                }}
                onContextMenu={onRowContextMenu ? (e) => { onSelect(item.index); onRowContextMenu(e, item.index) } : undefined}
                onMouseEnter={() => setHovered(item.index)}
                style={{ position: "absolute", top: 0, left: 0, width: "100%", transform: `translateY(${item.start}px)` }}
              >
                <div className="graph-cell" />
                <div className="msg">
                  <span className="msg-refs">
                    {refs.shown.map((ref) => (
                      <span
                        key={ref}
                        className={`ref${ref === "HEAD" ? " head" : ref.includes("stash") ? " stash" : ref.includes("/") ? " remote" : ""}`}
                      >
                        {ref}
                      </span>
                    ))}
                    {refs.extra > 0 ? <span className="ref extra">+{refs.extra}</span> : null}
                  </span>
                  <span className="msg-text">{row.rev.message}</span>
                </div>
                <div className="author">{row.rev.author}</div>
                <div className="date">{row.rev.date}</div>
                <div className="sha" data-testid="sha-cell" title={row.rev.id}>
                  {row.rev.id.slice(0, 7)}
                </div>
              </div>
            )
          })}
        </div>
      </div>
      {loadingTail && (
        <div className="grid-tail" data-testid="history-tail-loading">
          Loading more history…
        </div>
      )}
    </div>
  )
}

function visibleRefs(refs: string[]) {
  const head = refs.filter((r) => r === "HEAD")
  const local = refs.filter((r) => r !== "HEAD" && !r.includes("/"))
  const remote = refs.filter((r) => r.includes("/"))
  const ordered = [...head, ...local, ...remote]
  const max = 3
  if (ordered.length <= max) return { shown: ordered, extra: 0 }
  return { shown: ordered.slice(0, max), extra: ordered.length - max }
}
