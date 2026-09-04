import type { RepoInfo } from "../../engine"
import { focusGrid } from "../../hooks/focusGrid"
import type { Dialogs } from "../../hooks/useDialogs"
import type { GitActions } from "../../hooks/useGitActions"
import type { RepoState } from "../../hooks/useRepoState"
import { CommitDialog } from "../CommitDialog"
import { RecentsDialog } from "../RecentsDialog"
import { RemoteDialog } from "../RemoteDialog"
import { SettingsDialog } from "../SettingsDialog"
import { StashDialog } from "../StashDialog"
import { CheckoutBranchDialog } from "./CheckoutBranchDialog"
import { CreateRefDialog } from "./CreateRefDialog"
import { RebaseDialog } from "./RebaseDialog"
import { ResetBranchDialog } from "./ResetBranchDialog"
import { RevisionContextMenu } from "./RevisionContextMenu"

export type AppDialogsProps = {
  dialogs: Dialogs
  actions: GitActions
  repo: RepoInfo | null
  recents: RepoInfo[]
  repoState: Pick<RepoState, "status" | "setStatus" | "refs" | "branchNames" | "dirty" | "refresh" | "openFolder">
}

// Every modal surface of the shell, driven by the single DialogState. The
// always-mounted MUI dialogs (commit, settings, recents, stash) get an
// `open` flag so their exit transitions play; the rest mount on demand.
export function AppDialogs({ dialogs, actions, repo, recents, repoState }: AppDialogsProps) {
  const { dialog, open, close } = dialogs
  const { status, setStatus, refs, branchNames, dirty, refresh, openFolder } = repoState
  const ctxTarget = dialog.kind === "context" ? dialog.target : null

  return (
    <>
      <CommitDialog
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
        onPick={(p) => {
          if (p) void openFolder(p)
        }}
      />

      <RevisionContextMenu
        target={ctxTarget}
        branches={branchNames}
        onClose={() => close("context")}
        onCheckout={(b) => open({ kind: "checkout", branch: b })}
        onReset={() => {
          if (ctxTarget) open({ kind: "reset", row: ctxTarget.row })
        }}
        onRebase={() => {
          if (ctxTarget) open({ kind: "rebase", row: ctxTarget.row })
        }}
        onCreateBranch={(sha) =>
          open({ kind: "createRef", refKind: "branch", sha, subject: ctxTarget?.row.rev.message })
        }
        onCreateTag={(sha) => open({ kind: "createRef", refKind: "tag", sha, subject: ctxTarget?.row.rev.message })}
      />
      {dialog.kind === "createRef" && (
        <CreateRefDialog
          open
          kind={dialog.refKind}
          commit={dialog.sha}
          subject={dialog.subject}
          existingNames={dialog.refKind === "branch" ? branchNames : (refs?.tags ?? []).map((t) => t.name)}
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
          currentBranch={repo?.branch ?? ""}
          dirtyCount={dirty}
          onClose={() => close("reset")}
          onConfirm={actions.reset}
        />
      )}
      {dialog.kind === "rebase" && (
        <RebaseDialog
          open
          ontoSha={dialog.row.rev.id}
          ontoSubject={dialog.row.rev.message}
          currentBranch={repo?.branch ?? ""}
          onClose={() => close("rebase")}
          onConfirm={actions.rebase}
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
          void refresh({ revisions: true, status: true, stashes: true })
          focusGrid()
        }}
        onStatus={setStatus}
      />
    </>
  )
}
