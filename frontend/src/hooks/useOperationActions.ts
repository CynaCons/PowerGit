import {
  describeThrown,
  type ArchiveFormat,
  type ConflictTake,
  type MergeOptions,
  type PatchScope,
  type RebaseOptions,
} from "../engine"
import type { RebaseTodoEntry } from "../engine"
import { sequencerOpOf } from "../components/operationText"
import { getBehaviour, type Behaviour } from "../theme/behaviour"
import { commitWebUrl } from "../components/dialogs/gitUrls"
import { revealInFolder } from "../diagnostics/snapshot"
import type { GraphRow } from "../graph/types"
import { isTauriShell } from "../shell"
import type { ConfirmRequest, Dialogs } from "./useDialogs"
import type { EngineSession } from "./useEngineSession"
import type { Jobs } from "./useJobs"
import type { RepoState } from "./useRepoState"
import type { StatusNotes } from "./useStatusNote"

// v0.15.0 operations: merge, rebase (including interactive), the sequencer
// exits every stopped operation offers, conflict resolution, compare,
// archive and "open in browser". Split out of useGitActions so both files
// stay readable; useGitActions spreads these into the one actions object
// every entry point (menu, banner, rail, hotkeys) already uses.

export type OperationDeps = {
  session: Pick<EngineSession, "client" | "setEngineError">
  repoState: Pick<RepoState, "status" | "setStatus">
  jobs: Pick<Jobs, "withBusy">
  dialogs: Dialogs
  /** The status bar's transient line ("Saved 0001-….patch", v0.18.6). */
  notes: Pick<StatusNotes, "setNote">
}

/** After anything that can move HEAD or the refs. */
const FULL = { revisions: true, refs: true, status: true } as const

async function openExternal(url: string): Promise<void> {
  if (isTauriShell()) {
    const { openUrl } = await import("@tauri-apps/plugin-opener")
    await openUrl(url)
    return
  }
  window.open(url, "_blank", "noopener")
}

/**
 * The shell's half of "Save as patch…" (v0.18.6): the platform's Save
 * dialog with git's own file name, then the small `write_text_file`
 * command — no fs plugin, no engine write. Null when the user cancelled.
 */
async function saveTextFile(name: string, text: string): Promise<string | null> {
  const { save } = await import("@tauri-apps/plugin-dialog")
  const path = await save({ defaultPath: name, filters: [{ name: "Patch", extensions: ["patch"] }] })
  if (!path) return null
  const { invoke } = await import("@tauri-apps/api/core")
  await invoke("write_text_file", { path, contents: text })
  return path
}

/** The pending row's patch scope, or null for a commit row. */
function patchScopeOf(row: GraphRow): PatchScope | null {
  return row.artificial === "worktree" || row.artificial === "index" ? row.artificial : null
}

export function useOperationActions({ session, repoState, jobs, dialogs, notes }: OperationDeps) {
  const { client: engine, setEngineError } = session
  const { status, setStatus } = repoState
  const { withBusy } = jobs
  const { dialog, open } = dialogs
  const { setNote } = notes

  /**
   * In-app confirmation; replaces window.confirm (v0.15.0). `pref` names the
   * Behaviour switch that governs it: when the user has turned that
   * confirmation off, the action simply runs (Settings, Behaviour).
   */
  function confirm(request: ConfirmRequest, pref?: keyof Behaviour) {
    if (pref && !getBehaviour()[pref]) {
      void request.onConfirm()
      return
    }
    open({ kind: "confirm", request })
  }

  function openMerge(branch?: string) {
    open({ kind: "merge", branch })
  }

  // Every operation below is two phases under withBusy (v0.18.9): the
  // engine call, whose answer resolves the promise (the dialog closes),
  // then the refresh behind the top bar.
  async function merge(options: MergeOptions) {
    await withBusy(`Merging ${options.branch}`, async () => setStatus(await engine.merge(options)), { refresh: FULL })
  }

  function openResolveConflicts() {
    open({ kind: "resolveConflicts" })
  }

  /** Commit the merge, or `--continue` the sequencer that stopped. */
  async function continueOperation(message?: string | null) {
    const op = sequencerOpOf(status)
    await withBusy(
      op ? "Continuing" : "Committing merge",
      async () =>
        setStatus(op ? await engine.sequencerAction(op, "continue") : await engine.mergeContinue(message ?? null)),
      { refresh: FULL },
    )
  }

  async function skipOperation() {
    const op = sequencerOpOf(status)
    if (!op) return
    await withBusy("Skipping", async () => setStatus(await engine.sequencerAction(op, "skip")), { refresh: FULL })
  }

  /** Confirmed unless the user turned that off: aborting throws away whatever the operation did. */
  function abortOperation() {
    const state = status?.state ?? "none"
    if (state === "none") return
    const op = sequencerOpOf(status)
    confirm(
      {
        title: `Abort the ${state.replace(/ing$/, "")}?`,
        body: `The working tree goes back to where it was before the ${state.replace(/ing$/, "")} started. Any conflict resolution done so far is lost.`,
        confirmLabel: "Abort",
        danger: true,
        onConfirm: () =>
          withBusy(
            "Aborting",
            async () => setStatus(op ? await engine.sequencerAction(op, "abort") : await engine.mergeAbort()),
            { refresh: FULL },
          ),
      },
      "confirmAbortOperation",
    )
  }

  /** Take a side (or mark resolved / delete) for the given unmerged paths.
   *  Only the status can change, so this does not reload the graph. */
  async function resolve(paths: string[], take: ConflictTake) {
    if (paths.length === 0) return
    await withBusy(
      take === "delete" ? "Deleting" : "Resolving",
      async () => setStatus(await engine.resolveConflicts(paths, take)),
      { refresh: { status: true } },
    )
  }

  async function openMergetool(path: string) {
    try {
      await engine.openMergetool(path)
    } catch (e) {
      setEngineError(`Open mergetool: ${describeThrown(e)}`)
    }
  }

  async function rebase(onto: string, options: RebaseOptions) {
    await withBusy("Rebasing", async () => setStatus(await engine.rebase(onto, options)), { refresh: FULL })
  }

  /** Captures git's own todo, then opens the editor on it. */
  async function openInteractiveRebase(onto: string, ontoSubject?: string, options?: Partial<RebaseOptions>) {
    const resolved: RebaseOptions = {
      autosquash: options?.autosquash ?? false,
      rebaseMerges: options?.rebaseMerges ?? false,
      autostash: options?.autostash ?? false,
    }
    await withBusy("Preparing interactive rebase", async () => {
      const todo = await engine.rebaseTodo(onto, resolved)
      open({ kind: "interactiveRebase", onto, ontoSubject, todo, options: resolved })
    })
  }

  async function runInteractiveRebase(entries: RebaseTodoEntry[]) {
    if (dialog.kind !== "interactiveRebase") return
    const { onto, options } = dialog
    await withBusy("Rebasing interactively", async () => setStatus(await engine.rebase(onto, options, entries)), {
      refresh: FULL,
    })
  }

  /** GE "Create fixup/squash commit": the commit dialog, pre-filled. */
  function fixupCommit(kind: "fixup" | "squash", subject: string) {
    open({ kind: "commit", amend: false, initialMsg: `${kind}! ${subject}` })
  }

  function compare(from: string, to: string | null, labels?: { fromLabel?: string; toLabel?: string }) {
    open({ kind: "compare", from, to, fromLabel: labels?.fromLabel, toLabel: labels?.toLabel })
  }

  /** Streams `git archive` through the browser's own download path. */
  async function archive(sha: string, format: ArchiveFormat = "zip") {
    try {
      await openExternal(engine.archiveUrl(sha, format))
    } catch (e) {
      setEngineError(`Create archive: ${describeThrown(e)}`)
    }
  }

  /**
   * Owner (2026-09-15): "Being able to export a patch from a commit.
   * Probably from the right click menu." One commit as `git format-patch
   * -1 --stdout` (GE's flags, binary on), or a pending row's diff. In the
   * shell the engine's text goes through the Save dialog to disk and the
   * status bar says where; in a browser the URL form is opened and the
   * browser downloads it under the same name.
   */
  async function savePatch(row: GraphRow) {
    const scope = patchScopeOf(row)
    const sha = row.rev.id
    try {
      if (!isTauriShell()) {
        await openExternal(scope ? engine.worktreePatchUrl(scope) : engine.patchUrl(sha))
        return
      }
      const { name, text } = scope ? await engine.worktreePatch(scope) : await engine.patch(sha)
      const path = await saveTextFile(name, text)
      if (path === null) return
      setNote({ text: `Saved ${name}`, action: { label: "Show in folder", run: () => void revealInFolder(path) } })
    } catch (e) {
      setEngineError(`Save as patch: ${describeThrown(e)}`)
    }
  }

  async function openInBrowser(sha: string) {
    try {
      const remotes = await engine.remotes()
      const remote = remotes.find((r) => r.name === "origin") ?? remotes[0]
      const url = remote ? commitWebUrl(remote.url, sha) : null
      if (!url) {
        setEngineError("This repository has no remote on a host PowerGit knows (GitHub, GitLab, Bitbucket, Azure).")
        return
      }
      await openExternal(url)
    } catch (e) {
      setEngineError(`Open in browser: ${describeThrown(e)}`)
    }
  }

  return {
    confirm,
    openMerge,
    merge,
    openResolveConflicts,
    continueOperation,
    skipOperation,
    abortOperation,
    resolve,
    openMergetool,
    rebase,
    openInteractiveRebase,
    runInteractiveRebase,
    fixupCommit,
    compare,
    archive,
    savePatch,
    openInBrowser,
  }
}
