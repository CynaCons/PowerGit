import { isArtificialId } from "../graph/artificial"
import { describeThrown } from "../engine"
import type { Dialogs } from "./useDialogs"
import type { EngineSession } from "./useEngineSession"
import type { History } from "./useHistory"
import type { Jobs } from "./useJobs"
import { useOperationActions } from "./useOperationActions"
import type { RepoState } from "./useRepoState"

export type GitActionsDeps = {
  session: Pick<EngineSession, "client" | "view" | "setEngineError">
  history: Pick<History, "current" | "selectedSha">
  repoState: Pick<RepoState, "status" | "setStatus" | "setRefs" | "refresh" | "branchNames" | "openFolder">
  jobs: Pick<Jobs, "withBusy" | "runJob">
  dialogs: Dialogs
}

export type GitActions = ReturnType<typeof useGitActions>

// Every git operation the shell can start, shared by the command bar, the
// hotkeys, the context menus, the operation banner and the ref tree so all
// entry points agree. The v0.15.0 operations (merge, rebase, sequencer,
// conflicts, compare, archive) live in useOperationActions and are spread
// into the same object.
export function useGitActions({ session, history, repoState, jobs, dialogs }: GitActionsDeps) {
  const { client: engine, view, setEngineError } = session
  const repo = view.repo
  const { current } = history
  const { status, setStatus, setRefs, refresh, branchNames, openFolder } = repoState
  const { withBusy, runJob } = jobs
  const { dialog, open, close } = dialogs
  const operations = useOperationActions({ session, repoState, jobs, dialogs })

  function openCommit() {
    open({ kind: "commit", amend: false, initialMsg: undefined })
  }

  async function openAmend() {
    let initialMsg: string | undefined
    try {
      const d = await engine.commit("HEAD")
      initialMsg = d.body ? `${d.subject}\n\n${d.body}` : d.subject
    } catch (e) {
      setEngineError(`Cannot amend the last commit: ${describeThrown(e)}`)
      return
    }
    open({ kind: "commit", amend: true, initialMsg })
  }

  async function commit(msg: string) {
    const amend = dialog.kind === "commit" && dialog.amend
    if (!msg.trim() || (!status?.stagedCount && !amend)) return
    await engine.createCommit(msg.trim(), amend)
    close("commit")
    // Submission is complete now. A slow refresh must not keep a reopened
    // dialog pending or later erase a new draft for this repository.
    void refresh({ revisions: true, refs: true, status: true }).catch((e: unknown) => {
      setEngineError(`Commit succeeded, but refreshing the repository failed: ${describeThrown(e)}`)
    })
  }

  async function createRef(name: string) {
    if (dialog.kind !== "createRef") return
    const tree =
      dialog.refKind === "branch"
        ? await engine.createBranch(name, dialog.sha)
        : await engine.createTag(name, dialog.sha)
    setRefs(tree)
    await refresh({ revisions: true })
  }

  async function checkout(branch: string, force: boolean) {
    await withBusy("Checking out", async () => {
      setStatus(await engine.checkout(branch, force))
      await refresh({ revisions: true, refs: true, status: true })
    })
  }
  async function reset(mode: "soft" | "mixed" | "hard") {
    if (dialog.kind !== "reset") return
    const sha = dialog.row.rev.id
    await withBusy("Resetting", async () => {
      setStatus(await engine.reset(sha, mode))
      await refresh({ revisions: true, refs: true, status: true })
    })
  }

  // v0.15.0: every destructive action asks through the in-app ConfirmDialog
  // (a window.confirm is an OS prompt in the WebView and blocks automation).
  function removeBranch(name: string) {
    operations.confirm(
      {
        title: `Delete branch '${name}'?`,
        body: "Commits only on this branch become unreachable.",
        confirmLabel: "Delete branch",
        danger: true,
        onConfirm: async () => {
          try {
            setRefs(await engine.deleteBranch(name))
            await refresh({ revisions: true })
          } catch (e) {
            setEngineError(`Delete branch failed: ${describeThrown(e)}`)
          }
        },
      },
      "confirmDeleteBranch",
    )
  }
  function removeTag(name: string) {
    operations.confirm(
      {
        title: `Delete tag '${name}'?`,
        body: "The tag is removed locally; a remote copy stays until it is deleted there too.",
        confirmLabel: "Delete tag",
        danger: true,
        onConfirm: async () => {
          try {
            setRefs(await engine.deleteTag(name))
            await refresh({ revisions: true })
          } catch (e) {
            setEngineError(`Delete tag failed: ${describeThrown(e)}`)
          }
        },
      },
      "confirmDeleteBranch",
    )
  }
  async function fetchRemote(name: string) {
    await runJob(`Fetching ${name}`, () => engine.startFetch(name))
  }

  // Shared by the toolbar buttons and their hotkeys so both entry points
  // always agree on behaviour.
  // Pending-change rows (v0.14.1) are not commits: no ref, no rebase.
  const onArtificial = isArtificialId(history.selectedSha ?? "")
  function openCreateBranch() {
    if (!current || onArtificial) return
    open({ kind: "createRef", refKind: "branch", sha: current.rev.id, subject: current.rev.message })
  }
  function openCreateTag() {
    if (!current || onArtificial) return
    open({ kind: "createRef", refKind: "tag", sha: current.rev.id, subject: current.rev.message })
  }
  function openCheckoutBranch() {
    const name = repo?.branch ?? branchNames[0]
    if (name) open({ kind: "checkout", branch: name })
  }
  function openRebase() {
    if (current && !onArtificial) open({ kind: "rebase", onto: current.rev.id, ontoSubject: current.rev.message })
  }
  /** Ctrl+M / rail Merge: pick the branch in the dialog. */
  function openMergeBranch() {
    operations.openMerge(branchNames.find((b) => b !== repo?.branch))
  }
  function deleteBranchPrompt() {
    open({ kind: "deleteBranch" })
  }
  function openSubmodule(path: string) {
    if (!repo) return
    const sep = repo.root.endsWith("/") || repo.root.endsWith("\\") ? "" : "/"
    void openFolder(`${repo.root}${sep}${path}`)
  }

  // Quick stash actions on stash@{0}; the full list lives in the dialog.
  function applyLatestStash(pop: boolean) {
    void withBusy(pop ? "Popping stash" : "Applying stash", async () => {
      setStatus(await engine.applyStash("stash@{0}", pop))
      await refresh({ revisions: true, status: true, stashes: true })
    })
  }
  function dropLatestStash() {
    operations.confirm({
      title: "Drop stash@{0}?",
      body: "The stashed changes are gone for good.",
      confirmLabel: "Drop stash",
      danger: true,
      onConfirm: () =>
        withBusy("Dropping stash", async () => {
          await engine.dropStash("stash@{0}")
          await refresh({ revisions: true, status: true, stashes: true })
        }),
    })
  }

  return {
    ...operations,
    openCommit,
    openAmend,
    commit,
    createRef,
    checkout,
    reset,
    removeBranch,
    removeTag,
    fetchRemote,
    openCreateBranch,
    openCreateTag,
    openCheckoutBranch,
    openRebase,
    openMergeBranch,
    deleteBranchPrompt,
    openSubmodule,
    applyLatestStash,
    dropLatestStash,
  }
}
