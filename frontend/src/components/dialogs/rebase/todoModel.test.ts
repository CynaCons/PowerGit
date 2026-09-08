import { describe, expect, it } from "vitest"
import type { RebaseTodo } from "../../../engine"
import { canMove, move, setAction, setMessage, summarize, toEntries, toRows, validate } from "./todoModel"

const todo: RebaseTodo = {
  onto: "0000000",
  headName: "feature",
  lines: [
    { action: "pick", sha: "aaa1111", subject: "first", raw: "pick aaa1111 first" },
    { action: "pick", sha: "bbb2222", subject: "second", raw: "pick bbb2222 second" },
    { action: "pick", sha: "ccc3333", subject: "third", raw: "pick ccc3333 third" },
  ],
}

const withLabel: RebaseTodo = {
  onto: "0000000",
  headName: "feature",
  lines: [
    { action: "label", sha: null, subject: null, raw: "label onto" },
    { action: "pick", sha: "aaa1111", subject: "first", raw: "pick aaa1111 first" },
    { action: "reset", sha: null, subject: null, raw: "reset onto" },
    { action: "pick", sha: "bbb2222", subject: "second", raw: "pick bbb2222 second" },
  ],
}

describe("todoModel", () => {
  it("turns git's lines into rows, marking non-commit lines read-only", () => {
    const rows = toRows(withLabel)
    expect(rows.map((r) => r.commit)).toEqual([false, true, false, true])
    expect(rows[1]).toMatchObject({ action: "pick", sha: "aaa1111", subject: "first" })
    // Abbreviated commands (rebase.abbreviateCommands) are commit lines too.
    expect(toRows({ lines: [{ action: "f", sha: "aaa1111", subject: "x", raw: "f aaa1111 x" }] })[0]).toMatchObject({
      commit: true,
      action: "fixup",
    })
  })

  it("changes an action and keeps a message only where it is used", () => {
    let rows = toRows(todo)
    rows = setAction(rows, 1, "reword")
    rows = setMessage(rows, 1, "a better subject")
    expect(rows[1]).toMatchObject({ action: "reword", message: "a better subject" })
    rows = setAction(rows, 1, "fixup")
    expect(rows[1].message).toBeNull()
  })

  it("moves commit lines only, and never past a label/reset line", () => {
    const rows = toRows(todo)
    expect(canMove(rows, 0, -1)).toBe(false)
    expect(canMove(rows, 2, 1)).toBe(false)
    const moved = move(rows, 2, -1)
    expect(moved.map((r) => r.sha)).toEqual(["aaa1111", "ccc3333", "bbb2222"])
    // Order is what changes, not identity: the row keeps its action and id.
    expect(moved[1]).toMatchObject({ id: 2, action: "pick" })

    const structured = toRows(withLabel)
    expect(canMove(structured, 0, 1)).toBe(false) // the label itself never moves
    expect(canMove(structured, 1, 1)).toBe(false) // and a commit cannot cross it
    expect(move(structured, 1, 1)).toBe(structured)
  })

  it("refuses a plan that starts with squash or drops everything", () => {
    expect(validate(toRows(todo))).toBeNull()
    expect(validate(setAction(toRows(todo), 0, "squash"))).toMatch(/first commit cannot be squashed/i)
    // Dropping the first makes the second the first: still a valid squash target check.
    const droppedFirst = setAction(setAction(toRows(todo), 0, "drop"), 1, "fixup")
    expect(validate(droppedFirst)).toMatch(/first commit cannot be squashed/i)
    let all = toRows(todo)
    for (const r of all) all = setAction(all, r.id, "drop")
    expect(validate(all)).toMatch(/nothing to rebase/i)
  })

  it("serialises commit lines as actions and everything else verbatim", () => {
    let rows = toRows(withLabel)
    rows = setMessage(setAction(rows, 3, "squash"), 3, "folded message")
    expect(toEntries(rows)).toEqual([
      { action: "label", sha: null, message: null, raw: "label onto" },
      { action: "pick", sha: "aaa1111", message: null, raw: null },
      { action: "reset", sha: null, message: null, raw: "reset onto" },
      { action: "squash", sha: "bbb2222", message: "folded message", raw: null },
    ])
  })

  it("summarises what the plan will do", () => {
    expect(summarize(toRows(todo))).toBe("3 commits")
    const mixed = setAction(setAction(toRows(todo), 1, "fixup"), 2, "drop")
    expect(summarize(mixed)).toBe("1 commit · 1 folded · 1 dropped")
  })
})
