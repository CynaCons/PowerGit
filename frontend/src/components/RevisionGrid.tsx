import { useVirtualizer } from "@tanstack/react-virtual"
import { useEffect, useRef, useState } from "react"
import { drawRows, graphWidth } from "../graph/draw"
import { ROW_HEIGHT, type GraphRow } from "../graph/types"

type Props = {
  rows: GraphRow[]
  selected: number
  onSelect: (index: number) => void
}

export function RevisionGrid({ rows, selected, onSelect }: Props) {
  const parentRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [hovered, setHovered] = useState(-1)
  const width = graphWidth(rows)
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
  })

  const virtualItems = virtualizer.getVirtualItems()
  const start = virtualItems[0]?.index ?? 0
  const end = (virtualItems[virtualItems.length - 1]?.index ?? 0) + 1

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
        onMouseLeave={() => setHovered(-1)}
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
                onClick={() => onSelect(item.index)}
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
                  <span className="msg-refs">
                    {refs.shown.map((ref) => (
                      <span
                        key={ref}
                        className={`ref${ref === "HEAD" ? " head" : ref.includes("/") ? " remote" : ""}`}
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
