import Box from "@mui/material/Box"
import Typography from "@mui/material/Typography"
import { Fragment, useLayoutEffect, useMemo, useRef } from "react"
import type { BranchPlan } from "../../../engine"
import { openExternal } from "../../../hooks/useOperationActions"
import {
  edgesAt,
  graphWidth,
  laneColor,
  laneX,
  prForRef,
  prsAt,
  refsAt,
  ROW_H,
  rowsAt,
  shaLabel,
  type PlacedPr,
  type PlacedRef,
  type PlanRow,
} from "./planModel"

// The plan on PowerGit's graph (v0.22.0; docs/prototypes/branch-plan-v1.html,
// owner: "This is awesome. Let's bake it in"). Above it a scrubber from now to
// after the last step; below, the history the plan touches with what each
// step brings: planned commits hollow, merges as diamonds, commits a rebase
// replaces dashed and struck through, a red ring where git predicts a
// conflict, the number of the step that brings a node beside it. Rows the
// selected step does not touch fade. A rebased copy slides from its
// original's row onto its new base when the scrubber passes its step.

const NOW = "now"

function Scrubber({ plan, at, onAt }: { plan: BranchPlan; at: number; onAt: (at: number) => void }) {
  const steps = plan.steps
  const pct = (i: number) => (steps.length === 0 ? 0 : (i / steps.length) * 100)
  return (
    <Box sx={{ px: 3, pt: 1.25, pb: 2.75, borderBottom: 1, borderColor: "divider" }}>
      <Box sx={{ position: "relative", height: 22 }}>
        <Box sx={{ position: "absolute", left: 0, right: 0, top: 10, height: 2, bgcolor: "divider" }} />
        <Box
          sx={{
            position: "absolute",
            left: 0,
            top: 10,
            height: 2,
            width: `${pct(at)}%`,
            bgcolor: "var(--pg-agent)",
            transition: "width .3s ease",
            "@media (prefers-reduced-motion: reduce)": { transition: "none" },
          }}
        />
        {[0, ...steps.map((s) => s.n)].map((i) => {
          const step = steps.find((s) => s.n === i)
          const risky = step?.result === "conflict" || step?.result === "risk" || step?.result === "invalid"
          const here = i === at
          return (
            <Box key={i} sx={{ position: "absolute", left: `${pct(i)}%`, top: 0, transform: "translateX(-50%)" }}>
              <Box
                component="button"
                data-testid="plan-scrub"
                data-at={i}
                aria-label={i === 0 ? "The repository now" : `After step ${i}: ${step?.text ?? ""}`}
                aria-pressed={here}
                onClick={() => onAt(i)}
                sx={{
                  position: "relative",
                  width: 22,
                  height: 22,
                  p: 0,
                  borderRadius: "50%",
                  border: "1.5px solid",
                  borderColor: i <= at ? "var(--pg-agent)" : "divider",
                  bgcolor: here ? "var(--pg-agent)" : "background.paper",
                  color: here ? "#fff" : i < at ? "var(--pg-agent)" : "text.secondary",
                  fontSize: 11,
                  fontWeight: 600,
                  fontFamily: "inherit",
                  cursor: "pointer",
                  "&:focus-visible": { outline: "2px solid", outlineColor: "primary.main", outlineOffset: 2 },
                  "&::after": risky
                    ? {
                        content: '""',
                        position: "absolute",
                        top: -3,
                        right: -3,
                        width: 8,
                        height: 8,
                        borderRadius: "50%",
                        bgcolor: "error.main",
                        border: "1.5px solid",
                        borderColor: "background.paper",
                      }
                    : undefined,
                }}
              >
                {i === 0 ? "·" : i}
              </Box>
              <Typography
                sx={{
                  position: "absolute",
                  top: 25,
                  left: "50%",
                  transform: "translateX(-50%)",
                  fontSize: 10.5,
                  color: "text.secondary",
                  whiteSpace: "nowrap",
                }}
              >
                {i === 0 ? NOW : (step?.op ?? "")}
              </Typography>
            </Box>
          )
        })}
      </Box>
    </Box>
  )
}

function RefChip({ placed }: { placed: PlacedRef }) {
  const cls = placed.kind === "tag" ? "ref tag" : placed.kind === "remote" ? "ref remote" : "ref"
  return (
    <span
      className={cls}
      data-ref={placed.name}
      data-planned={placed.planned ? "true" : undefined}
      style={
        placed.planned
          ? { background: "transparent", border: "1px dashed var(--pg-agent)", color: "var(--pg-agent)" }
          : undefined
      }
    >
      {placed.name}
    </span>
  )
}

/** v0.22.5: a branch's pull request; a link when the agent gave one. */
function PrChip({ pr }: { pr: PlacedPr }) {
  const tip = [pr.title, pr.state, pr.into && `into ${pr.into}`].filter(Boolean).join(", ")
  const common = {
    "data-testid": "plan-pr",
    "data-branch": pr.branch,
    title: tip || undefined,
  }
  if (pr.planned)
    return (
      <span
        {...common}
        className="ref pr"
        data-planned="true"
        style={{ borderStyle: "dashed", borderColor: "var(--pg-agent)", color: "var(--pg-agent)" }}
      >
        PR{pr.into ? ` → ${pr.into}` : ""}
      </span>
    )
  const label = (
    <>
      {pr.id ?? "PR"}
      {pr.state && <span className="pr-state">{pr.state}</span>}
    </>
  )
  if (!pr.url)
    return (
      <span {...common} className="ref pr">
        {label}
      </span>
    )
  const url = pr.url
  return (
    <a
      {...common}
      className="ref pr"
      href={url}
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        void openExternal(url)
      }}
    >
      {label}
    </a>
  )
}

function GraphSvg({ plan, rows, at }: { plan: BranchPlan; rows: PlanRow[]; at: number }) {
  const width = graphWidth(plan)
  const height = rows.length * ROW_H
  const risky = new Set(
    plan.steps
      .filter((s) => (s.result === "conflict" || s.result === "risk") && s.n <= at)
      .flatMap((s) => (s.nodes ?? []).filter((id) => !plan.nodes.find((n) => n.id === id)?.sha)),
  )
  return (
    <svg
      width={width}
      height={height}
      aria-hidden="true"
      style={{ position: "absolute", left: 0, top: 0, overflow: "visible", pointerEvents: "none" }}
    >
      {edgesAt(rows).map((e, i) => (
        <path
          key={i}
          d={e.d}
          fill="none"
          stroke={e.ghost ? "var(--pg-graph-nonrelative, #a0a0a0)" : laneColor(e.lane)}
          strokeWidth={1.8}
          strokeDasharray={e.dashed ? "4 3" : undefined}
          opacity={e.ghost ? 0.7 : 1}
        />
      ))}
      {rows.map((r) => {
        const cx = laneX(r.node.lane)
        const cy = r.index * ROW_H + ROW_H / 2
        const color = laneColor(r.node.lane)
        return (
          <g key={r.node.id} data-node={r.node.id} className="plan-node">
            {risky.has(r.node.id) && r.state !== "ghost" && (
              <circle cx={cx} cy={cy} r={9} fill="none" stroke="var(--pg-review-rejected, #dc2626)" strokeWidth={1.4} />
            )}
            {r.state === "exists" && <circle cx={cx} cy={cy} r={5} fill={color} />}
            {r.state === "fold" && (
              // v0.22.1: a quiet run of commits, folded.
              <line
                x1={cx}
                y1={cy - 7}
                x2={cx}
                y2={cy + 7}
                stroke={color}
                strokeWidth={3}
                strokeDasharray="1.5 3"
                strokeLinecap="round"
              />
            )}
            {r.state === "ghost" && (
              <circle
                cx={cx}
                cy={cy}
                r={4.5}
                fill="var(--pg-board-bg, #fff)"
                stroke="var(--pg-graph-nonrelative, #a0a0a0)"
                strokeWidth={1.4}
                strokeDasharray="2.5 2"
              />
            )}
            {r.state === "planned" && (
              <circle cx={cx} cy={cy} r={5} fill="var(--pg-board-bg, #fff)" stroke={color} strokeWidth={2} />
            )}
            {r.state === "merge" && (
              <rect
                x={cx - 5}
                y={cy - 5}
                width={10}
                height={10}
                transform={`rotate(45 ${cx} ${cy})`}
                fill="var(--pg-board-bg, #fff)"
                stroke={color}
                strokeWidth={2}
              />
            )}
            {r.node.from > 0 && r.state !== "ghost" && (
              <text x={width - 10} y={cy + 4} fontSize={10} fontWeight={700} fill="var(--pg-agent)">
                {r.node.from}
              </text>
            )}
          </g>
        )
      })}
    </svg>
  )
}

export function PlanGraph({
  plan,
  at,
  onAt,
  selected,
}: {
  plan: BranchPlan
  at: number
  onAt: (at: number) => void
  /** The selected step: rows it does not touch fade while the scrubber is on it. */
  selected: number | null
}) {
  const rows = useMemo(() => rowsAt(plan, at), [plan, at])
  const refs = useMemo(() => refsAt(plan, at), [plan, at])
  const prs = useMemo(() => prsAt(plan, at), [plan, at])
  const locals = useMemo(
    () =>
      new Set(
        [...refs.values()]
          .flat()
          .filter((p) => p.kind === "local")
          .map((p) => p.name),
      ),
    [refs],
  )
  const step = plan.steps.find((s) => s.n === selected)
  const touched = new Set(step?.nodes ?? [])
  const focus = step && selected === at && touched.size > 0
  const width = graphWidth(plan)

  // A rebased copy slides in from its original's row when the scrubber passes its step.
  const host = useRef<HTMLDivElement | null>(null)
  const previous = useRef(at)
  useLayoutEffect(() => {
    const before = previous.current
    previous.current = at
    if (at <= before || !host.current || matchMedia("(prefers-reduced-motion: reduce)").matches) return
    for (const r of rows) {
      if (!r.node.copy || r.node.from <= before || r.node.from > at) continue
      const original = rows.find((o) => o.node.id === r.node.copy)
      const g = host.current.querySelector<SVGGElement>(`g[data-node="${CSS.escape(r.node.id)}"]`)
      if (!original || !g) continue
      g.style.transition = "none"
      g.style.transform = `translateY(${(original.index - r.index) * ROW_H}px)`
      g.style.opacity = "0.25"
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          g.style.transition = "transform .5s cubic-bezier(.2,.8,.2,1), opacity .3s"
          g.style.transform = ""
          g.style.opacity = ""
        }),
      )
    }
  }, [at, rows])

  return (
    <Box sx={{ display: "flex", flexDirection: "column", minHeight: 0, flex: 1 }}>
      <Scrubber plan={plan} at={at} onAt={onAt} />
      <Box
        ref={host}
        data-testid="plan-graph"
        // --pg-board-bg fills the hollow nodes in the pane's colour (light and dark).
        sx={(t) => ({ "--pg-board-bg": t.palette.background.paper, flex: 1, minHeight: 0, overflow: "auto" })}
      >
        <Box sx={{ position: "relative" }}>
          <GraphSvg plan={plan} rows={rows} at={at} />
          {rows.map((r) => {
            const dim = focus && !touched.has(r.node.id)
            return (
              <Box
                key={r.node.id}
                data-testid="plan-row"
                data-node={r.node.id}
                data-kind={r.state}
                sx={{
                  display: "grid",
                  gridTemplateColumns: `${width}px minmax(0, 1fr) 120px 76px`,
                  alignItems: "center",
                  height: ROW_H,
                  borderBottom: 1,
                  borderColor: "divider",
                  fontSize: 12.5,
                  opacity: dim ? 0.38 : 1,
                  transition: "opacity .2s",
                  bgcolor: focus && touched.has(r.node.id) ? "var(--pg-agent-bg)" : "transparent",
                }}
              >
                <span />
                <Box sx={{ display: "flex", gap: 0.75, alignItems: "center", minWidth: 0, overflow: "hidden" }}>
                  {(refs.get(r.node.id) ?? []).map((p) => {
                    const pr = prForRef(prs, p, locals)
                    return (
                      <Fragment key={p.name}>
                        <RefChip placed={p} />
                        {pr && <PrChip pr={pr} />}
                      </Fragment>
                    )
                  })}
                  <Typography
                    noWrap
                    sx={{
                      fontSize: 12.5,
                      color:
                        r.state === "ghost" ? "text.disabled" : r.state === "fold" ? "text.secondary" : "text.primary",
                      fontStyle: r.state === "fold" ? "italic" : "normal",
                      textDecoration: r.state === "ghost" ? "line-through" : "none",
                    }}
                  >
                    {r.node.subject}
                  </Typography>
                  {r.state === "ghost" && r.node.ghostAt !== null && (
                    <Typography noWrap sx={{ fontSize: 11, color: "text.secondary" }}>
                      replaced by step {r.node.ghostAt}
                    </Typography>
                  )}
                </Box>
                <Typography noWrap sx={{ fontSize: 12, color: "text.secondary", pr: 1 }}>
                  {r.node.author ?? (r.state === "merge" || r.state === "fold" ? "" : "planned")}
                </Typography>
                <Typography
                  noWrap
                  sx={{
                    fontSize: 12,
                    textAlign: "right",
                    pr: 1.25,
                    color: r.node.sha ? "text.secondary" : "var(--pg-agent)",
                  }}
                >
                  {shaLabel(r.node)}
                </Typography>
              </Box>
            )
          })}
          {plan.truncated && (
            <Typography sx={{ fontSize: 12, color: "text.secondary", p: 1 }}>
              Older commits are not shown (200 at most).
            </Typography>
          )}
        </Box>
      </Box>
    </Box>
  )
}
