import { useEffect, useState } from "react"
import {
  describeThrown,
  type DiffDto,
  type DiffOptions,
  type EngineClient,
  type FileChange,
  type RepoStatus,
} from "../engine"
import { DEFAULT_DIFF_OPTIONS } from "../engine/commitCache"
import { fileResetPlan, isUntracked, lineResetPlan, type BrowseRow } from "../components/browseReset"
import type { DiffFileMenuTarget } from "../components/DiffContextMenus"
import { useDiffLineSelection } from "./useDiffLineSelection"

// Reset from the Browse panel's Diff tab (v0.15.5). Owner: "right click on a
// file and hit reset. Same for the diff in the diff view. Should be able to
// select some line, and hit reset."
//
// The line machinery is the commit dialog's, unchanged — useDiffLineSelection
// was already generic. What is new is that the same gesture means a different
// git operation per row (browseReset.ts), and that a whole-file undo on a
// commit needs that file's patch, which the panel does not hold for anything
// but the selected file.

/** What a confirmation, once accepted, will do. */
type Pending = { kind: "file"; path: string; untracked: boolean } | { kind: "lines" }

export type BrowseResetNote = { level: "info" | "error"; text: string }

export function useBrowseReset({
  engine,
  row,
  diff,
  diffOptions,
  files,
  commitId,
  onStatus,
  onNote,
}: {
  engine: EngineClient
  /** null while nothing is selected, or in demo mode. */
  row: BrowseRow | null
  diff: DiffDto | null
  diffOptions: DiffOptions
  files: FileChange[]
  commitId: string | null
  onStatus: (status: RepoStatus) => void
  onNote: (note: BrowseResetNote | null) => void
}) {
  const [fileMenu, setFileMenu] = useState<DiffFileMenuTarget | null>(null)
  const [pending, setPending] = useState<Pending | null>(null)

  const lines = useDiffLineSelection({
    engine,
    diff,
    // A -w diff's context does not match the file, and a truncated one ends
    // mid-hunk: neither can build a patch git will accept (v0.15.5).
    context: { ignoreWhitespace: diffOptions.ws },
    onStatus,
    onError: (text) => onNote({ level: "error", text }),
    // Nothing to do: every mutation here answers with a fresh RepoStatus,
    // and the panel's pending diff reloads off that. A commit's own diff is
    // unchanged by undoing it into the working tree.
    onApplied: () => undefined,
  })

  // Selecting another row or file clears a half-open interaction.
  useEffect(() => {
    setFileMenu(null)
    setPending(null)
  }, [row?.kind, commitId, diff?.path])

  // The note outlives a file change on purpose — a reset that empties a file
  // out of the list would otherwise erase its own confirmation. Moving to
  // another row does clear it: by then it describes somewhere else.
  useEffect(() => {
    onNote(null)
  }, [row?.kind, commitId, onNote])

  const menuPath = fileMenu?.path ?? null
  const menuFile = menuPath ? files.find((f) => f.path === menuPath) : undefined
  const untracked = isUntracked(menuFile?.status)
  const safeRow: BrowseRow = row ?? { kind: "worktree" }
  const filePlan = fileResetPlan(safeRow, menuPath ?? "this file", untracked)
  const linePlan = lineResetPlan(safeRow, diff?.path ?? "this file", lines.selectedChanges)

  // A commit's whole-file undo is a reverse apply of that file's patch, so a
  // binary file has nothing to reverse. Worktree and index resets are a
  // checkout, which handles binaries fine.
  const fileBlocked =
    row?.kind === "commit" && menuFile?.binary === true ? "binary file: nothing to reverse-apply" : null

  function openFileMenu(path: string, x: number, y: number) {
    onNote(null)
    setFileMenu({ x, y, path })
  }

  function askFileReset() {
    if (!menuPath) return
    setPending({ kind: "file", path: menuPath, untracked })
  }

  function askLineReset() {
    if (lines.selectedChanges === 0 || lines.blocked !== null) return
    setPending({ kind: "lines" })
  }

  /** Reverse-applies one file's whole patch from a commit into worktree + index. */
  async function undoFile(path: string) {
    if (!commitId) throw new Error("no commit selected")
    // Always the default options: a patch built from a -w or truncated diff
    // is not something git can apply, whatever the user is currently viewing.
    const patch = await engine.diff(commitId, path, DEFAULT_DIFF_OPTIONS)
    if (patch.truncated) throw new Error("this file's diff is too large to undo")
    if (patch.binary) throw new Error("binary file: nothing to reverse-apply")
    onStatus(await engine.applyPatch(patch.text, { reverse: true, index: true, threeWay: true }))
  }

  async function runConfirmed() {
    const job = pending
    setPending(null)
    if (!job || !row) return
    try {
      if (job.kind === "lines") {
        // apply() reports its own failure through onError; only announce a
        // success, or the note would contradict the banner beside it.
        const count = lines.selectedChanges
        if (await lines.apply(linePlan.action)) {
          onNote({ level: "info", text: doneNote(linePlan.confirm.title, count) })
        }
        return
      }
      const plan = fileResetPlan(row, job.path, job.untracked)
      if (plan.scope === null) await undoFile(job.path)
      else onStatus(await engine.resetFiles([job.path], plan.scope))
      onNote({ level: "info", text: `${plan.confirm.title}: ${job.path}` })
    } catch (e) {
      onNote({ level: "error", text: `${job.kind === "lines" ? "reset lines" : "reset"} failed: ${describeThrown(e)}` })
    }
  }

  return {
    lines,
    fileMenu,
    openFileMenu,
    closeFileMenu: () => setFileMenu(null),
    filePlan,
    linePlan,
    fileBlocked,
    askFileReset,
    askLineReset,
    /** The confirmation to show, or null. */
    confirm: pending === null ? null : pending.kind === "lines" ? linePlan.confirm : filePlanFor(row, pending).confirm,
    cancelConfirm: () => setPending(null),
    runConfirmed,
  }
}

function filePlanFor(row: BrowseRow | null, pending: Extract<Pending, { kind: "file" }>) {
  return fileResetPlan(row ?? { kind: "worktree" }, pending.path, pending.untracked)
}

function doneNote(title: string, count: number): string {
  return `${title}: ${count === 1 ? "1 line" : `${count} lines`}`
}
