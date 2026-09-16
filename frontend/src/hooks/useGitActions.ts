import { isArtificialId } from "../graph/artificial"
import type { CreateRefOptions } from "../components/dialogs/CreateRefDialog"
import { isRemote } from "../components/refChipsModel"
import { describeThrown, type CheckoutOptions } from "../engine"
import { getBehaviour } from "../theme/behaviour"
import type { Dialogs } from "./useDialogs"
import type { EngineSession } from "./useEngineSession"
import type { History } from "./useHistory"
import type { Jobs } from "./useJobs"
import { useOperationActions } from "./useOperationActions"
import type { RepoState } from "./useRepoState"
import type { StatusNotes } from "./useStatusNote"

export type GitActionsDeps = {
  session: Pick<EngineSession, "client" | "view" | "setEngineError">
  history: Pick<History, "current" | "selectedSha" | "setHighlightRoot">
  repoState: Pick<
    RepoState,
    "status" | "setStatus" | "setRefs" | "refresh" | "branchNames" | "remoteNames" | "openFolder"
  >
  jobs: Pick<Jobs, "withBusy" | "runJob">
  dialogs: Dialogs
  notes: Pick<StatusNotes, "setNote">
}

export type GitActions = ReturnType<typeof useGitActions>

/** After anything that can move HEAD or the refs. */
const FULL = { revisions: true, refs: true, status: true } as const
/** After a stash moved: the pending row, the count and the list. */
const STASHES = { revisions: true, status: true, stashes: true } as const

// Every git operation the shell can start, shared by the command bar, the
// hotkeys, the context menus, the operation banner and the ref tree so all
// entry points agree. The v0.15.0 operations (merge, rebase, sequencer,
// conflicts, compare, archive) live in useOperationActions and are spread
// into the same object.
export function useGitActions({ session, history, repoState, jobs, dialogs, notes }: GitActionsDeps) {
  const { client: engine, view, setEngineError } = session
  const repo = view.repo
  const { current } = history
  const { status, setStatus, setRefs, refresh, branchNames, remoteNames, openFolder } = repoState
  const { withBusy, runJob } = jobs
  const { dialog, open, close } = dialogs
  const operations = useOperationActions({ session, repoState, jobs, dialogs, notes })

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

  // v0.18.11: GE's "Checkout after create" and "Orphan" ride on the create
  // route; a checked-out branch changes the status too, so that refresh is
  // the full one, run behind the top bar after the dialog has closed.
  async function createRef(name: string, options: CreateRefOptions) {
    if (dialog.kind !== "createRef") return
    const branch = dialog.refKind === "branch"
    const moves = branch && (options.checkout || options.orphan)
    await withBusy(
      branch ? "Creating branch" : "Creating tag",
      async () =>
        setRefs(
          branch
            ? await engine.createBranch(name, dialog.sha, { checkout: options.checkout, orphan: options.orphan })
            : await engine.createTag(name, dialog.sha, options.message),
        ),
      { refresh: moves ? FULL : { revisions: true } },
    )
  }

  // Two phases under withBusy (v0.18.9): the engine call resolves the
  // promise (the dialog closes), the refresh runs on behind the top bar.
  // v0.18.11: the options are the checkout dialog's (track / reset /
  // detached, keep / stash / discard); `false` is the plain old checkout.
  async function checkout(ref: string, options: CheckoutOptions | boolean = false, inline = false) {
    await withBusy("Checking out", async () => setStatus(await engine.checkout(ref, options)), {
      refresh: FULL,
      propagateError: inline,
    })
  }
  async function reset(mode: "soft" | "mixed" | "hard") {
    if (dialog.kind !== "reset") return
    const sha = dialog.row.rev.id
    await withBusy("Resetting", async () => setStatus(await engine.reset(sha, mode)), { refresh: FULL })
  }

  // v0.15.0: every destructive action asks in-app (a window.confirm is an
  // OS prompt in the WebView and blocks automation). v0.18.11: the question
  // is the Delete branch / Delete tag dialog itself — the chip, its tip and
  // what the deletion costs — unless Settings, Behaviour turned it off.
  async function deleteBranch(name: string) {
    await withBusy("Deleting branch", async () => setRefs(await engine.deleteBranch(name)), {
      refresh: { revisions: true },
    })
  }
  async function deleteTag(name: string) {
    await withBusy("Deleting tag", async () => setRefs(await engine.deleteTag(name)), { refresh: { revisions: true } })
  }
  function removeBranch(name: string) {
    if (!getBehaviour().confirmDeleteBranch) {
      deleteBranch(name).catch((e: unknown) => setEngineError(`Delete branch failed: ${describeThrown(e)}`))
      return
    }
    open({ kind: "deleteBranch", branch: name })
  }
  function removeTag(name: string) {
    if (!getBehaviour().confirmDeleteBranch) {
      deleteTag(name).catch((e: unknown) => setEngineError(`Delete tag failed: ${describeThrown(e)}`))
      return
    }
    open({ kind: "deleteTag", tag: name })
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
    const name = branchNames.find((b) => b !== repo?.branch) ?? repo?.branch ?? branchNames[0]
    if (name) open({ kind: "checkout", branch: name })
  }
  /** The tree's and the chips' "Checkout branch": a local branch checks out
   *  at once, as in Git Extensions' left panel; a remote branch or a tag
   *  opens the dialog, which asks how (v0.18.11). */
  function checkoutRef(name: string, kind?: "local" | "remote" | "tag" | "submodule") {
    const remote = kind ? kind !== "local" : isRemote(name, remoteNames)
    if (remote) open({ kind: "checkout", branch: name })
    else void checkout(name, false)
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
  /** The row menu's "Highlight ancestry (until refresh)" (v0.18.4): this
   *  commit's history takes the checked-out branch's highlight. */
  function highlightAncestry(sha: string) {
    if (!isArtificialId(sha)) history.setHighlightRoot(sha)
  }
  function openSubmodule(path: string) {
    if (!repo) return
    const sep = repo.root.endsWith("/") || repo.root.endsWith("\\") ? "" : "/"
    void openFolder(`${repo.root}${sep}${path}`)
  }

  // Quick stash actions on stash@{0}; the full list lives in the dialog.
  function applyLatestStash(pop: boolean) {
    void withBusy(
      pop ? "Popping stash" : "Applying stash",
      async () => setStatus(await engine.applyStash("stash@{0}", pop)),
      { refresh: STASHES },
    )
  }
  function dropLatestStash() {
    operations.confirm({
      title: "Drop stash@{0}?",
      body: "The stashed changes are gone for good.",
      confirmLabel: "Drop stash",
      danger: true,
      onConfirm: () =>
        withBusy(
          "Dropping stash",
          async () => {
            await engine.dropStash("stash@{0}")
          },
          { refresh: STASHES },
        ),
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
    deleteBranch,
    deleteTag,
    fetchRemote,
    openCreateBranch,
    openCreateTag,
    openCheckoutBranch,
    checkoutRef,
    openRebase,
    openMergeBranch,
    deleteBranchPrompt,
    highlightAncestry,
    openSubmodule,
    applyLatestStash,
    dropLatestStash,
  }
}
