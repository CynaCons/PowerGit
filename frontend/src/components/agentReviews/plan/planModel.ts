import type { BranchPlan, BranchPlanNode, BranchPlanRef, BranchPlanStep } from "../../../engine"

// The branch plan on the graph (v0.22.0, docs/prototypes/branch-plan-v1.html):
// which nodes show at a scrubber position, in what state, where each ref is,
// and the lines between them. Pure; PlanGraph draws it.

export type NodeState = "exists" | "planned" | "merge" | "ghost"
export type PlanRow = { node: BranchPlanNode; state: NodeState; index: number }
export type PlacedRef = { name: string; kind: BranchPlanRef["kind"]; planned: boolean }
export type Edge = { d: string; lane: number; dashed: boolean; ghost: boolean }

export const ROW_H = 28
export const LANE_X0 = 14
export const LANE_DX = 16

export const laneX = (lane: number) => LANE_X0 + lane * LANE_DX
export const laneColor = (lane: number) => `var(--pg-lane-${(lane % 7) + 1})`

/** A node's state at a scrubber position (0 = now, n = after step n); null while it does not exist yet. */
export function stateAt(node: BranchPlanNode, at: number): NodeState | null {
  if (node.from > at) return null
  if (node.ghostAt !== null && node.ghostAt <= at) return "ghost"
  return node.kind
}

/** The rows shown at a position, in the plan's order (newest first). */
export function rowsAt(plan: BranchPlan, at: number): PlanRow[] {
  const out: PlanRow[] = []
  for (const node of plan.nodes) {
    const state = stateAt(node, at)
    if (state) out.push({ node, state, index: out.length })
  }
  return out
}

/** Where every ref is at a position: node id → the refs on it (planned: moved by a step). */
export function refsAt(plan: BranchPlan, at: number): Map<string, PlacedRef[]> {
  const out = new Map<string, PlacedRef[]>()
  for (const ref of plan.refs) {
    const pos = [...ref.at].filter((p) => p.step <= at).pop()
    if (!pos?.node) continue
    out.set(pos.node, [...(out.get(pos.node) ?? []), { name: ref.name, kind: ref.kind, planned: pos.step > 0 }])
  }
  return out
}

/** The lines from each row to its parents among the rows shown. */
export function edgesAt(rows: PlanRow[]): Edge[] {
  const byId = new Map(rows.map((r) => [r.node.id, r]))
  const edges: Edge[] = []
  for (const row of rows) {
    for (const parentId of row.node.parents) {
      const parent = byId.get(parentId)
      if (!parent) continue
      const x1 = laneX(row.node.lane)
      const y1 = row.index * ROW_H + ROW_H / 2
      const x2 = laneX(parent.node.lane)
      const y2 = parent.index * ROW_H + ROW_H / 2
      // A branch leaving its parent bends at the parent's row; a merge bends at its own.
      const d =
        x1 === x2
          ? `M${x1} ${y1} L${x2} ${y2}`
          : x1 > x2
            ? `M${x1} ${y1} L${x1} ${y2 - 12} Q${x1} ${y2} ${x2 + 5} ${y2}`
            : `M${x1} ${y1} Q${x2} ${y1} ${x2} ${y1 + 12} L${x2} ${y2}`
      edges.push({
        d,
        lane: Math.max(row.node.lane, parent.node.lane),
        dashed: row.state !== "exists",
        ghost: row.state === "ghost",
      })
    }
  }
  return edges
}

/** The width of the graph column: every lane the plan uses, plus room for the step number. */
export const graphWidth = (plan: BranchPlan) => laneX(Math.max(plan.lanes.length, 1)) + 14

/** Counts for the plan's box: what git or the refs settled, what conflicts, what waits. */
export function planCounts(steps: BranchPlanStep[]) {
  return {
    ok: steps.filter((s) => s.result === "ok").length,
    conflict: steps.filter((s) => s.result === "conflict" || s.result === "risk").length,
    unknown: steps.filter((s) => s.result === "unknown").length,
    invalid: steps.filter((s) => s.result === "invalid").length,
    done: steps.filter((s) => s.done).length,
    total: steps.length,
  }
}

/** The step the screen opens on: the first one with a conflict or risk, else the first. */
export const firstStepToRead = (steps: BranchPlanStep[]) =>
  steps.find((s) => s.result === "conflict" || s.result === "risk")?.n ?? steps[0]?.n ?? 1

/** Short form of a node's commit: the SHA for an existing one, its original's with a prime for a rebased copy. */
export function shaLabel(node: BranchPlanNode): string {
  if (node.sha) return node.sha.slice(0, 7)
  if (node.copy) return `${node.copy.slice(0, 7)}′`
  return "planned"
}
