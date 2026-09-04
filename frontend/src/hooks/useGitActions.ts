import {
  applyStash,
  checkoutRef,
  createBranch,
  createCommit,
  createTag,
  deleteBranch,
  deleteTag,
  describeThrown,
  dropStash,
  fetchCommit,
  rebaseOnto,
  resetBranch,
  startFetch,
} from "../engine"
import type { Dialogs } from "./useDialogs"
import type { EngineSession } from "./useEngineSession"
import type { History } from "./useHistory"
import type { Jobs } from "./useJobs"
import type { RepoState } from "./useRepoState"

export type GitActionsDeps = {
  session: Pick<EngineSession, "repo" | "setEngineError">
  history: Pick<History, "current">
  repoState: Pick<RepoState, "status" | "setStatus" | "setRefs" | "refresh" | "branchNames" | "openFolder">
  jobs: Pick<Jobs, "withBusy" | "runJob">
  dialogs: Dialogs
}

export type GitActions = ReturnType<typeof useGitActions>

// Every git operation the shell can start, shared by the command bar, the
// hotkeys, the context menu and the ref tree so all entry points agree.
export function useGitActions({ session, history, repoState, jobs, dialogs }: GitActionsDeps) {
  const { repo, setEngineError } = session
  const { current } = history
  const { status, setStatus, setRefs, refresh, branchNames, openFolder } = repoState
  const { withBusy, runJob } = jobs
  const { dialog, open, close } = dialogs

  function openCommit() {
    open({ kind: "commit", amend: false, initialMsg: undefined })
  }

  async function openAmend() {
    let initialMsg: string | undefined
    try {
      const d = await fetchCommit("HEAD")
      initialMsg = d.body ? `${d.subject}\n\n${d.body}` : d.subject
    } catch {
      initialMsg = undefined
    }
    open({ kind: "commit", amend: true, initialMsg })
  }

  async function commit(msg: string) {
    const amend = dialog.kind === "commit" && dialog.amend
    if (!msg.trim() || (!status?.stagedCount && !amend)) return
    await createCommit(msg.trim(), amend)
    close("commit")
    await refresh({ revisions: true, refs: true, status: true })
  }

  async function createRef(name: string) {
    if (dialog.kind !== "createRef") return
    const tree = dialog.refKind === "branch" ? await createBranch(name, dialog.sha) : await createTag(name, dialog.sha)
    setRefs(tree)
    await refresh({ revisions: true })
  }

  async function checkout(branch: string, force: boolean) {
    await withBusy("Checking out", async () => {
      setStatus(await checkoutRef(branch, force))
      await refresh({ revisions: true, refs: true, status: true })
    })
  }
  async function reset(mode: "soft" | "mixed" | "hard") {
    if (dialog.kind !== "reset") return
    const sha = dialog.row.rev.id
    await withBusy("Resetting", async () => {
      setStatus(await resetBranch(sha, mode))
      await refresh({ revisions: true, refs: true, status: true })
    })
  }
  async function rebase() {
    if (dialog.kind !== "rebase") return
    const sha = dialog.row.rev.id
    await withBusy("Rebasing", async () => {
      setStatus(await rebaseOnto(sha))
      await refresh({ revisions: true, refs: true, status: true })
    })
  }

  async function removeBranch(name: string) {
    if (!window.confirm(`Delete branch '${name}'?`)) return
    try {
      setRefs(await deleteBranch(name))
      await refresh({ revisions: true })
    } catch (e) {
      setEngineError(`Delete branch failed: ${describeThrown(e)}`)
    }
  }
  async function removeTag(name: string) {
    if (!window.confirm(`Delete tag '${name}'?`)) return
    try {
      setRefs(await deleteTag(name))
      await refresh({ revisions: true })
    } catch (e) {
      setEngineError(`Delete tag failed: ${describeThrown(e)}`)
    }
  }
  async function fetchRemote(name: string) {
    await runJob("Fetching", () => startFetch(name))
  }

  // Shared by the toolbar buttons and their hotkeys so both entry points
  // always agree on behaviour.
  function openCreateBranch() {
    if (!current) return
    open({ kind: "createRef", refKind: "branch", sha: current.rev.id, subject: current.rev.message })
  }
  function openCreateTag() {
    if (!current) return
    open({ kind: "createRef", refKind: "tag", sha: current.rev.id, subject: current.rev.message })
  }
  function openCheckoutBranch() {
    const name = repo?.branch ?? branchNames[0]
    if (name) open({ kind: "checkout", branch: name })
  }
  function openRebase() {
    if (current) open({ kind: "rebase", row: current })
  }
  async function deleteBranchPrompt() {
    const hint = branchNames.length > 0 ? `Delete which branch?\n(${branchNames.join(", ")})` : "Delete which branch?"
    const target = window.prompt(hint)
    if (target?.trim()) await removeBranch(target.trim())
  }
  function openSubmodule(path: string) {
    if (!repo) return
    const sep = repo.root.endsWith("/") || repo.root.endsWith("\\") ? "" : "/"
    void openFolder(`${repo.root}${sep}${path}`)
  }

  // Quick stash actions on stash@{0}; the full list lives in the dialog.
  function applyLatestStash(pop: boolean) {
    void withBusy(pop ? "Popping stash" : "Applying stash", async () => {
      setStatus(await applyStash("stash@{0}", pop))
      await refresh({ revisions: true, status: true, stashes: true })
    })
  }
  function dropLatestStash() {
    if (!window.confirm("Drop stash@{0}? This cannot be undone.")) return
    void withBusy("Dropping stash", async () => {
      await dropStash("stash@{0}")
      await refresh({ revisions: true, status: true, stashes: true })
    })
  }

  return {
    openCommit,
    openAmend,
    commit,
    createRef,
    checkout,
    reset,
    rebase,
    removeBranch,
    removeTag,
    fetchRemote,
    openCreateBranch,
    openCreateTag,
    openCheckoutBranch,
    openRebase,
    deleteBranchPrompt,
    openSubmodule,
    applyLatestStash,
    dropLatestStash,
  }
}
