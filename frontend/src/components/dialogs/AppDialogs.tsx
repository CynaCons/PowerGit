import type { RepoInfo } from "../../engine"
import { focusGrid } from "../../hooks/focusGrid"
import type { Dialogs } from "../../hooks/useDialogs"
import type { GitActions } from "../../hooks/useGitActions"
import type { Jobs } from "../../hooks/useJobs"
import type { RepoState } from "../../hooks/useRepoState"
import { CommitDialog } from "../CommitDialog"
import { RecentsDialog } from "../RecentsDialog"
import { RemoteDialog } from "../RemoteDialog"
import { SettingsDialog } from "../SettingsDialog"
import { StashDialog } from "../StashDialog"
import { CheckoutBranchDialog } from "./CheckoutBranchDialog"
import { CompareDialog } from "./CompareDialog"
import { ConfirmDialog } from "./ConfirmDialog"
import { CreateRefDialog } from "./CreateRefDialog"
import { DeleteBranchDialog } from "./DeleteBranchDialog"
import { InteractiveRebaseDialog } from "./InteractiveRebaseDialog"
import { MergeDialog } from "./MergeDialog"
import { RebaseDialog } from "./RebaseDialog"
import { RefContextMenu } from "./RefContextMenu"
import { ResetBranchDialog } from "./ResetBranchDialog"
import { ResolveConflictsDialog } from "./ResolveConflictsDialog"
import { PullPushPreview } from "./PullPushPreview"
import { RevisionContextMenu } from "./RevisionContextMenu"

export type AppDialogsProps = {
  dialogs: Dialogs
  actions: GitActions
  repo: RepoInfo | null
  recents: RepoInfo[]
  onForgetRecent?: (root: string) => void
  repoState: Pick<RepoState, "status" | "setStatus" | "refs" | "branchNames" | "dirty" | "refresh" | "openFolder">
  jobs: Jobs
  /** v0.16.0: the commit dialog's "View file history". */
  onFileHistory?: (path: string) => void
}

// Every modal surface of the shell, driven by the single DialogState. The
// always-mounted MUI dialogs (commit, settings, recents, stash) get an
// `open` flag so their exit transitions play; the rest mount on demand.
export function AppDialogs({
  dialogs,
  actions,
  repo,
  recents,
  onForgetRecent,
  repoState,
  jobs,
  onFileHistory,
}: AppDialogsProps) {
  const { dialog, open, close } = dialogs
  const { status, setStatus, refs, branchNames, dirty, refresh, openFolder } = repoState
  const ctxTarget = dialog.kind === "context" ? dialog.target : null
  const currentBranch = repo?.branch ?? ""
  const tagNames = (refs?.tags ?? []).map((t) => t.name)

  return (
    <>
      <CommitDialog
        repository={repo?.root}
        open={dialog.kind === "commit"}
        status={status}
        amend={dialog.kind === "commit" && dialog.amend}
        initialMessage={dialog.kind === "commit" ? dialog.initialMsg : undefined}
        onClose={() => {
          close("commit")
          focusGrid()
        }}
        onStatus={setStatus}
        onCommit={async (msg) => {
          await actions.commit(msg)
        }}
        onFileHistory={onFileHistory}
      />

      <SettingsDialog
        open={dialog.kind === "settings"}
        onClose={() => {
          close("settings")
          focusGrid()
        }}
      />
      <RecentsDialog
        open={dialog.kind === "recents"}
        onClose={() => {
          close("recents")
          focusGrid()
        }}
        recents={recents}
        onForget={onForgetRecent}
        onPick={(p) => {
          if (p) void openFolder(p)
        }}
      />

      <RevisionContextMenu
        target={ctxTarget}
        branches={branchNames}
        tags={tagNames}
        currentBranch={currentBranch}
        stagedCount={status?.stagedCount ?? 0}
        operation={status?.state ?? "none"}
        actions={actions}
        dialogs={dialogs}
        onClose={() => close("context")}
      />
      <RefContextMenu
        target={dialog.kind === "refContext" ? dialog.target : null}
        onClose={() => close("refContext")}
        actions={{
          onCheckout: (name) => open({ kind: "checkout", branch: name }),
          onMerge: (name) => actions.openMerge(name),
          onRebaseOnto: (name) => open({ kind: "rebase", onto: name }),
          onDelete: (name, kind) => (kind === "tag" ? actions.removeTag(name) : actions.removeBranch(name)),
          onFetchRemote: (name) => void actions.fetchRemote(name),
          onConfigureRemote: (name) => open({ kind: "remoteConfig", remote: name }),
        }}
      />
      {dialog.kind === "createRef" && (
        <CreateRefDialog
          open
          kind={dialog.refKind}
          commit={dialog.sha}
          subject={dialog.subject}
          existingNames={dialog.refKind === "branch" ? branchNames : tagNames}
          onClose={() => close("createRef")}
          onConfirm={actions.createRef}
        />
      )}
      {dialog.kind === "checkout" && (
        <CheckoutBranchDialog
          open
          branch={dialog.branch}
          branchOptions={branchNames.length > 0 ? branchNames : [dialog.branch]}
          dirtyCount={dirty}
          onClose={() => close("checkout")}
          onConfirm={actions.checkout}
        />
      )}
      {dialog.kind === "reset" && (
        <ResetBranchDialog
          open
          commit={dialog.row.rev.id}
          subject={dialog.row.rev.message}
          currentBranch={currentBranch}
          dirtyCount={dirty}
          initialMode={dialog.initialMode}
          onClose={() => close("reset")}
          onConfirm={actions.reset}
        />
      )}
      {dialog.kind === "rebase" && (
        <RebaseDialog
          open
          ontoSha={dialog.onto}
          ontoSubject={dialog.ontoSubject}
          currentBranch={currentBranch}
          interactive={dialog.interactive}
          onClose={() => close("rebase")}
          onConfirm={async (options) => {
            const { interactive, ...rest } = options
            if (interactive) {
              await actions.openInteractiveRebase(dialog.onto, dialog.ontoSubject, rest)
              return
            }
            await actions.rebase(dialog.onto, rest)
          }}
        />
      )}
      {dialog.kind === "interactiveRebase" && (
        <InteractiveRebaseDialog
          open
          todo={dialog.todo}
          ontoSubject={dialog.ontoSubject}
          currentBranch={currentBranch}
          onClose={() => close("interactiveRebase")}
          onConfirm={actions.runInteractiveRebase}
        />
      )}
      {dialog.kind === "merge" && (
        <MergeDialog
          open
          currentBranch={currentBranch}
          branch={dialog.branch}
          branchOptions={branchNames}
          dirtyCount={dirty}
          onClose={() => close("merge")}
          onConfirm={actions.merge}
        />
      )}
      {dialog.kind === "resolveConflicts" && (
        <ResolveConflictsDialog
          open
          status={status}
          busy={jobs.busy}
          onClose={() => close("resolveConflicts")}
          onResolve={actions.resolve}
          onMergetool={actions.openMergetool}
          onRescan={() => refresh({ status: true })}
          onContinue={async () => {
            close("resolveConflicts")
            await actions.continueOperation()
          }}
          onSkip={async () => {
            close("resolveConflicts")
            await actions.skipOperation()
          }}
          onAbort={() => {
            close("resolveConflicts")
            actions.abortOperation()
          }}
        />
      )}
      {dialog.kind === "compare" && (
        <CompareDialog
          open
          from={dialog.from}
          to={dialog.to}
          fromLabel={dialog.fromLabel}
          toLabel={dialog.toLabel}
          onClose={() => {
            close("compare")
            focusGrid()
          }}
        />
      )}
      {dialog.kind === "deleteBranch" && (
        <DeleteBranchDialog
          open
          branches={branchNames}
          currentBranch={currentBranch}
          onClose={() => close("deleteBranch")}
          onConfirm={actions.removeBranch}
        />
      )}
      {dialog.kind === "confirm" && (
        <ConfirmDialog
          open
          title={dialog.request.title}
          text={dialog.request.body}
          confirmLabel={dialog.request.confirmLabel}
          destructive={dialog.request.danger}
          onCancel={() => {
            close("confirm")
            focusGrid()
          }}
          onConfirm={() => {
            const { onConfirm } = dialog.request
            close("confirm")
            void onConfirm()
          }}
        />
      )}
      {dialog.kind === "remoteConfig" && (
        <RemoteDialog
          open
          name={dialog.remote}
          onClose={() => {
            close("remoteConfig")
            focusGrid()
          }}
        />
      )}
      <StashDialog
        open={dialog.kind === "stash"}
        dirtyCount={dirty}
        onClose={() => {
          close("stash")
          void refresh({ revisions: true, status: true, stashes: true }).catch(() => undefined)
          focusGrid()
        }}
        onStatus={setStatus}
      />
      {jobs.preview && (
        <PullPushPreview
          kind={jobs.preview}
          repo={repo}
          status={status}
          jobs={jobs}
          onClose={() => {
            jobs.closePreview()
            focusGrid()
          }}
        />
      )}
    </>
  )
}
