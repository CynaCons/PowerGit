import { describe, expect, it } from "vitest"
import type { BranchPlan, BranchPlanNode } from "../../../engine"
import { edgesAt, firstStepToRead, planCounts, refsAt, rowsAt, shaLabel, stateAt } from "./planModel"

const node = (
  id: string,
  lane: number,
  parents: string[],
  kind: BranchPlanNode["kind"],
  from = 0,
  ghostAt: number | null = null,
): BranchPlanNode => ({
  id,
  sha: kind === "exists" ? `${id}0000000` : null,
  parents,
  lane,
  kind,
  from,
  ghostAt,
  subject: id,
  author: null,
  copy: id.endsWith("'") ? `${id.slice(0, -1)}0000000` : null,
})

// main: base ← fix; auth: base ← a (rebased at step 1 onto fix as a'); step 2 merges a' into main.
const plan: BranchPlan = {
  steps: [
    {
      n: 1,
      op: "rebase",
      text: "Rebase auth onto main",
      spec: { op: "rebase" },
      result: "conflict",
      because: "",
      commands: [],
      done: false,
    },
    {
      n: 2,
      op: "merge",
      text: "Merge auth into main",
      spec: { op: "merge" },
      result: "ok",
      because: "",
      commands: [],
      done: true,
    },
  ],
  nodes: [
    node("m2", 0, ["fix", "a'"], "merge", 2),
    node("a'", 1, ["fix"], "planned", 1),
    node("fix", 0, ["base"], "exists"),
    node("a", 1, ["base"], "exists", 0, 1),
    node("base", 0, [], "exists"),
  ],
  lanes: ["main", "auth"],
  refs: [
    {
      name: "main",
      kind: "local",
      at: [
        { step: 0, node: "fix" },
        { step: 2, node: "m2" },
      ],
    },
    {
      name: "auth",
      kind: "local",
      at: [
        { step: 0, node: "a" },
        { step: 1, node: "a'" },
      ],
    },
    { name: "v1", kind: "tag", at: [{ step: 0, node: "base" }] },
  ],
  inputs: {},
  checkedAt: "",
  truncated: false,
}

describe("planModel", () => {
  it("shows what exists now, then what each step brings and replaces", () => {
    expect(rowsAt(plan, 0).map((r) => `${r.node.id}:${r.state}`)).toEqual(["fix:exists", "a:exists", "base:exists"])
    expect(rowsAt(plan, 1).map((r) => `${r.node.id}:${r.state}`)).toEqual([
      "a':planned",
      "fix:exists",
      "a:ghost",
      "base:exists",
    ])
    expect(rowsAt(plan, 2)[0]).toMatchObject({ state: "merge", index: 0 })
    expect(stateAt(plan.nodes[0], 1)).toBeNull()
  })

  it("places each ref where it is at that position", () => {
    expect(refsAt(plan, 0).get("a")).toEqual([{ name: "auth", kind: "local", planned: false }])
    expect(refsAt(plan, 1).get("a'")).toEqual([{ name: "auth", kind: "local", planned: true }])
    expect(refsAt(plan, 2).get("m2")).toEqual([{ name: "main", kind: "local", planned: true }])
    expect(refsAt(plan, 2).get("base")).toEqual([{ name: "v1", kind: "tag", planned: false }])
  })

  it("draws a line to every parent shown, dashed for the plan's nodes", () => {
    const edges = edgesAt(rowsAt(plan, 2))
    expect(edges).toHaveLength(5)
    expect(edges.filter((e) => e.dashed)).toHaveLength(4)
    expect(edges.filter((e) => e.ghost)).toHaveLength(1)
    expect(edgesAt(rowsAt(plan, 0)).every((e) => !e.dashed)).toBe(true)
  })

  it("counts the checks and picks the step to read first", () => {
    expect(planCounts(plan.steps)).toEqual({ ok: 1, conflict: 1, unknown: 0, invalid: 0, done: 1, total: 2 })
    expect(firstStepToRead(plan.steps)).toBe(1)
    expect(firstStepToRead([])).toBe(1)
  })

  it("draws a fold solid and gives it no SHA", () => {
    const fold = { ...node("f", 0, ["base"], "exists"), kind: "fold" as const, sha: null, subject: "227 commits" }
    expect(stateAt(fold, 0)).toBe("fold")
    expect(shaLabel(fold)).toBe("")
    const rows = rowsAt({ ...plan, nodes: [fold, plan.nodes[4]] }, 0)
    expect(edgesAt(rows)).toEqual([expect.objectContaining({ dashed: false })])
  })

  it("labels a rebased copy with its original and a prime", () => {
    expect(shaLabel(plan.nodes[1])).toBe("a000000′")
    expect(shaLabel(plan.nodes[2])).toBe("fix0000")
    expect(shaLabel(plan.nodes[0])).toBe("planned")
  })
})
