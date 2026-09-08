import { describeThrown, type ArchiveFormat, type ConflictTake, type MergeOptions, type RebaseOptions } from "../engine"
import type { RebaseTodoEntry } from "../engine"
import { sequencerOpOf } from "../components/operationText"
import { getBehaviour, type Behaviour } from "../theme/behaviour"
import { commitWebUrl } from "../components/dialogs/gitUrls"
import type { ConfirmRequest, Dialogs } from "./useDialogs"
import type { EngineSession } from "./useEngineSession"
import type { Jobs } from "./useJobs"
import type { RepoState } from "./useRepoState"

// v0.15.0 operations: merge, rebase (including interactive), the sequencer
// exits every stopped operation offers, conflict resolution, compare,
// archive and "open in browser". Split out of useGitActions so both files
// stay readable; useGitActions spreads these into the one actions object
// every entry point (menu, banner, rail, hotkeys) already uses.

export type OperationDeps = {
  session: Pick<EngineSession, "client" | "setEngineError">
  repoState: Pick<RepoState, "status" | "setStatus" | "refresh">
  jobs: Pick<Jobs, "withBusy">
  dialogs: Dialogs
}

/** After anything that can move HEAD or the refs. */
const FULL = { revisions: true, refs: true, status: true } as const

async function openExternal(url: string): Promise<void> {
  if ("__TAURI_INTERNALS__" in window) {
    const { openUrl } = await import("@tauri-apps/plugin-opener")
    await openUrl(url)
    return
  }
  window.open(url, "_blank", "noopener")
}

export function useOperationActions({ session, repoState, jobs, dialogs }: OperationDeps) {
  const { client: engine, setEngineError } = session
  const { status, setStatus, refresh } = repoState
  const { withBusy } = jobs
  const { dialog, open } = dialogs

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

  async function merge(options: MergeOptions) {
    await withBusy(`Merging ${options.branch}`, async () => {
      setStatus(await engine.merge(options))
      await refresh(FULL)
    })
  }

  function openResolveConflicts() {
    open({ kind: "resolveConflicts" })
  }

  /** Commit the merge, or `--continue` the sequencer that stopped. */
  async function continueOperation(message?: string | null) {
    const op = sequencerOpOf(status)
    await withBusy(op ? "Continuing" : "Committing merge", async () => {
      setStatus(op ? await engine.sequencerAction(op, "continue") : await engine.mergeContinue(message ?? null))
      await refresh(FULL)
    })
  }

  async function skipOperation() {
    const op = sequencerOpOf(status)
    if (!op) return
    await withBusy("Skipping", async () => {
      setStatus(await engine.sequencerAction(op, "skip"))
      await refresh(FULL)
    })
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
          withBusy("Aborting", async () => {
            setStatus(op ? await engine.sequencerAction(op, "abort") : await engine.mergeAbort())
            await refresh(FULL)
          }),
      },
      "confirmAbortOperation",
    )
  }

  /** Take a side (or mark resolved / delete) for the given unmerged paths.
   *  Only the status can change, so this does not reload the graph. */
  async function resolve(paths: string[], take: ConflictTake) {
    if (paths.length === 0) return
    await withBusy(take === "delete" ? "Deleting" : "Resolving", async () => {
      setStatus(await engine.resolveConflicts(paths, take))
      await refresh({ status: true })
    })
  }

  async function openMergetool(path: string) {
    try {
      await engine.openMergetool(path)
    } catch (e) {
      setEngineError(`Open mergetool: ${describeThrown(e)}`)
    }
  }

  async function rebase(onto: string, options: RebaseOptions) {
    await withBusy("Rebasing", async () => {
      setStatus(await engine.rebase(onto, options))
      await refresh(FULL)
    })
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
    await withBusy("Rebasing interactively", async () => {
      setStatus(await engine.rebase(onto, options, entries))
      await refresh(FULL)
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
    openInBrowser,
  }
}
