import { useEffect, useState } from "react"
import { useEngine, type RemoteInfo, type RepoOperationState } from "../../engine"
import type { ContextTarget, Dialogs } from "../../hooks/useDialogs"
import type { GitActions } from "../../hooks/useGitActions"
import { copyToClipboard } from "../clipboard"
import { CherryPickDialog } from "./CherryPickDialog"
import { commitWebUrl } from "./gitUrls"
import { NodeMenu } from "./NodeMenu"
import { buildRevisionMenu, revisionCopyText, type MenuNode } from "./revisionMenuModel"
import { RevertDialog } from "./RevertDialog"

export type { ContextTarget }

// The full Git Extensions commit menu (v0.15.0). What is in it, in which
// order, and when an item is hidden or disabled is decided by
// revisionMenuModel.ts (unit-tested); NodeMenu draws the nodes in the
// CommitFileContextMenu house style — an icon on every row, a shortcut
// column, dividers between groups — and this file dispatches the clicks.
// The file history's grid has its own, smaller menu
// (FileHistoryContextMenu.tsx, v0.16.0 review): Git Extensions'
// FormFileHistory does not offer checkout, reset, branches, tags, rebase
// or archive on a filtered list.

export function RevisionContextMenu({
  target,
  branches,
  tags,
  currentBranch,
  stagedCount,
  operation,
  actions,
  dialogs,
  onClose,
}: {
  target: ContextTarget | null
  branches: string[]
  tags: string[]
  currentBranch: string
  stagedCount: number
  operation: RepoOperationState
  actions: GitActions
  dialogs: Pick<Dialogs, "open">
  onClose: () => void
}) {
  const engine = useEngine()
  const open = target !== null
  const [baseSha, setBaseSha] = useState<string | null>(null)
  const [remotes, setRemotes] = useState<RemoteInfo[] | null>(null)
  // Cherry-pick/revert have no extra options (unlike checkout/reset), so
  // their confirm dialogs are self-contained here rather than threaded
  // through App-level state: the target commit is captured locally when the
  // menu item is clicked, independent of the menu's own open/close lifecycle.
  const [cherryPickTarget, setCherryPickTarget] = useState<ContextTarget["row"] | null>(null)
  const [revertTarget, setRevertTarget] = useState<ContextTarget["row"] | null>(null)

  // "Open in browser" needs the remote URL to know whether it can work at
  // all; one request per menu opening, not per repository refresh.
  useEffect(() => {
    if (!open || remotes !== null || !engine.hasRepo) return
    let cancelled = false
    engine
      .remotes()
      .then((r) => {
        if (!cancelled) setRemotes(r)
      })
      .catch(() => {
        if (!cancelled) setRemotes([])
      })
    return () => {
      cancelled = true
    }
  }, [engine, open, remotes])

  const row = target?.row
  const sha = row?.rev.id ?? ""
  const remote = remotes?.find((r) => r.name === "origin") ?? remotes?.[0]
  const nodes = row
    ? buildRevisionMenu({
        sha,
        subject: row.rev.message,
        artificial: Boolean(row.artificial),
        refs: row.rev.refs,
        currentBranch,
        localBranches: branches,
        tags,
        stagedCount,
        otherSelectedSha: target?.previousSha && target.previousSha !== sha ? target.previousSha : null,
        baseSha,
        webUrl: remote ? commitWebUrl(remote.url, sha) : null,
        operation,
      })
    : []

  function run(node: MenuNode) {
    if (!row) return
    const subject = row.rev.message
    const id = node.id
    // "Select as BASE" only records a commit; it must not close the menu's
    // owner state before the next Compare click can use it.
    if (id === "ctx-compare-set-base") {
      setBaseSha(sha)
      onClose()
      return
    }
    onClose()
    if (id.startsWith("ctx-delete-branch-")) return actions.removeBranch(node.value ?? "")
    if (id.startsWith("ctx-delete-tag-")) return actions.removeTag(node.value ?? "")
    if (id.startsWith("ctx-copy-")) return void copyToClipboard(revisionCopyText(row.rev, node.value))
    switch (id) {
      case "ctx-open-commit":
        return actions.openCommit()
      case "ctx-checkout":
        return dialogs.open({
          kind: "checkout",
          branch: row.rev.refs.find((r) => branches.includes(r)) ?? currentBranch,
        })
      case "ctx-merge":
        return actions.openMerge(node.value)
      case "ctx-rebase":
        return dialogs.open({ kind: "rebase", onto: sha, ontoSubject: subject })
      case "ctx-rebase-interactive":
        return dialogs.open({ kind: "rebase", onto: sha, ontoSubject: subject, interactive: true })
      case "ctx-reset-soft":
      case "ctx-reset-mixed":
      case "ctx-reset-hard":
        return dialogs.open({ kind: "reset", row, initialMode: node.value as "soft" | "mixed" | "hard" })
      case "ctx-create-branch":
        return dialogs.open({ kind: "createRef", refKind: "branch", sha, subject })
      case "ctx-create-tag":
        return dialogs.open({ kind: "createRef", refKind: "tag", sha, subject })
      case "ctx-cherry-pick":
        return setCherryPickTarget(row)
      case "ctx-revert":
        return setRevertTarget(row)
      case "ctx-fixup":
        return actions.fixupCommit("fixup", subject)
      case "ctx-squash":
        return actions.fixupCommit("squash", subject)
      case "ctx-compare-head":
        return actions.compare(sha, "HEAD", { toLabel: "HEAD" })
      case "ctx-compare-worktree":
        return actions.compare(sha, null)
      case "ctx-compare-selected":
        return actions.compare(target?.previousSha ?? sha, sha)
      case "ctx-compare-to-base":
        return actions.compare(baseSha ?? sha, sha, { fromLabel: `BASE ${(baseSha ?? sha).slice(0, 7)}` })
      case "ctx-archive":
        return void actions.archive(sha)
      case "ctx-open-browser":
        return void actions.openInBrowser(sha)
    }
  }

  return (
    <>
      <NodeMenu id="revision-context-menu" position={target} nodes={nodes} onRun={run} onClose={onClose} />
      {cherryPickTarget && (
        <CherryPickDialog
          open
          commit={cherryPickTarget.rev.id}
          subject={cherryPickTarget.rev.message}
          onClose={() => setCherryPickTarget(null)}
        />
      )}
      {revertTarget && (
        <RevertDialog
          open
          commit={revertTarget.rev.id}
          subject={revertTarget.rev.message}
          onClose={() => setRevertTarget(null)}
        />
      )}
    </>
  )
}
