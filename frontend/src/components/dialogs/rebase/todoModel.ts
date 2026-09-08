import type { RebaseTodo, RebaseTodoEntry, RebaseTodoLine } from "../../../engine"

// The interactive-rebase todo as the dialog edits it (v0.15.0). git wrote the
// list (autosquash order, label/reset/merge lines for --rebase-merges); this
// model only lets the user change what Git Extensions' FormRebase todo editor
// lets them change: the action of a commit line, its message for reword and
// squash, and the order of commit lines. Every other line stays exactly as git
// wrote it and cannot move, so a --rebase-merges plan is never corrupted.

export type TodoAction = "pick" | "reword" | "edit" | "squash" | "fixup" | "drop"

export const TODO_ACTIONS: readonly TodoAction[] = ["pick", "reword", "edit", "squash", "fixup", "drop"] as const

export const ACTION_LABELS: Record<TodoAction, string> = {
  pick: "Pick — keep the commit",
  reword: "Reword — keep, edit the message",
  edit: "Edit — stop to amend",
  squash: "Squash — fold into the previous, edit the message",
  fixup: "Fixup — fold into the previous, keep its message",
  drop: "Drop — discard the commit",
}

export type TodoRow = {
  /** Stable key for React; the raw line's original index. */
  id: number
  /** Commit lines are editable and movable; anything else is verbatim. */
  commit: boolean
  action: TodoAction
  /** git's own verb for a non-commit line (label, reset, merge, exec, break). */
  rawAction: string
  sha: string | null
  subject: string | null
  /** New message for reword / squash; null keeps git's own. */
  message: string | null
  raw: string
}

const isAction = (a: string): a is TodoAction => (TODO_ACTIONS as readonly string[]).includes(a)

/** git's short forms, as `git rebase -i` writes them with `rebase.abbreviateCommands`. */
const SHORT: Record<string, TodoAction> = { p: "pick", r: "reword", e: "edit", s: "squash", f: "fixup", d: "drop" }

export function toRows(todo: Pick<RebaseTodo, "lines">): TodoRow[] {
  return todo.lines.map((line, id) => fromLine(line, id))
}

function fromLine(line: RebaseTodoLine, id: number): TodoRow {
  const action = line.action.toLowerCase()
  const resolved = isAction(action) ? action : SHORT[action]
  const commit = Boolean(line.sha) && resolved !== undefined
  return {
    id,
    commit,
    action: commit ? resolved : "pick",
    rawAction: line.action,
    sha: line.sha,
    subject: line.subject,
    message: null,
    raw: line.raw,
  }
}

export function setAction(rows: TodoRow[], id: number, action: TodoAction): TodoRow[] {
  return rows.map((r) =>
    r.id === id && r.commit
      ? // Leaving reword/squash drops a message the user can no longer see.
        { ...r, action, message: action === "reword" || action === "squash" ? r.message : null }
      : r,
  )
}

export function setMessage(rows: TodoRow[], id: number, message: string): TodoRow[] {
  return rows.map((r) => (r.id === id && r.commit ? { ...r, message: message.length > 0 ? message : null } : r))
}

/** True when the row can move that way: only commit lines move, and only
 *  past another commit line, so `label`/`reset`/`merge` keep their places. */
export function canMove(rows: TodoRow[], id: number, delta: -1 | 1): boolean {
  const from = rows.findIndex((r) => r.id === id)
  if (from < 0 || !rows[from].commit) return false
  const to = from + delta
  return to >= 0 && to < rows.length && rows[to].commit
}

export function move(rows: TodoRow[], id: number, delta: -1 | 1): TodoRow[] {
  if (!canMove(rows, id, delta)) return rows
  const from = rows.findIndex((r) => r.id === id)
  const next = rows.slice()
  const [row] = next.splice(from, 1)
  next.splice(from + delta, 0, row)
  return next
}

/** Why the plan cannot run, or null. GE refuses the same two cases. */
export function validate(rows: TodoRow[]): string | null {
  const commits = rows.filter((r) => r.commit && r.action !== "drop")
  if (commits.length === 0) return "Every commit is dropped — there would be nothing to rebase."
  const first = commits[0]
  if (first.action === "squash" || first.action === "fixup") {
    return "The first commit cannot be squashed or fixed up: there is nothing before it."
  }
  return null
}

/** What the engine runs: commit lines as {action, sha, message}, everything
 *  else as its raw line so git sees exactly what it wrote. */
export function toEntries(rows: TodoRow[]): RebaseTodoEntry[] {
  return rows.map((r) =>
    r.commit
      ? {
          action: r.action,
          sha: r.sha,
          message: r.action === "reword" || r.action === "squash" ? r.message : null,
          raw: null,
        }
      : { action: r.rawAction, sha: null, message: null, raw: r.raw },
  )
}

/** "3 commits · 1 squashed · 1 dropped" under the table. */
export function summarize(rows: TodoRow[]): string {
  const commits = rows.filter((r) => r.commit)
  const kept = commits.filter((r) => r.action !== "drop" && r.action !== "squash" && r.action !== "fixup").length
  const folded = commits.filter((r) => r.action === "squash" || r.action === "fixup").length
  const dropped = commits.filter((r) => r.action === "drop").length
  const parts = [`${kept} commit${kept === 1 ? "" : "s"}`]
  if (folded > 0) parts.push(`${folded} folded`)
  if (dropped > 0) parts.push(`${dropped} dropped`)
  return parts.join(" · ")
}
