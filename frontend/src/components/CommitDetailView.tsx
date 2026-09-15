import Box from "@mui/material/Box"
import Typography from "@mui/material/Typography"
import { useMemo } from "react"
import type { CommitDetail } from "../engine"
import { MONO_FONT } from "../theme"
import { EmptyState, ErrorState, LoadingState } from "./AsyncState"
import type { Loadable } from "./loadable"
import { RefChips, type RefMenuKind } from "./RefChips"

type RefProps = {
  /** Tag and remote names from the ref tree, as the grid gets them (v0.18.3). */
  tagNames?: string[]
  remoteNames?: string[]
  /** The checked-out branch: its chip comes first after HEAD. */
  currentBranch?: string | null
  /** A chip clicked: select that ref's tip in the grid. */
  onSelectRef?: (name: string, kind: RefMenuKind) => void
  /** A chip right-clicked: the ref menu the grid's chips open. */
  onRefContextMenu?: (e: React.MouseEvent, name: string, kind: RefMenuKind, sha: string) => void
}

type Props = RefProps & { detail: CommitDetail }

/** The Commit tab: the load states around CommitDetailView (moved out of
 *  BottomPanel.tsx in v0.18.3 for the lint size limit). */
export function CommitInfo({
  detail,
  hasCurrent,
  onRetry,
  busy,
  ...refProps
}: RefProps & { detail: Loadable<CommitDetail>; hasCurrent: boolean; onRetry: () => void; busy: boolean }) {
  return (
    <Box data-testid="commit-info" sx={{ flex: 1, overflow: "auto", p: detail.kind === "ready" ? 2 : 0 }}>
      {detail.kind === "error" && <ErrorState message={detail.message} onRetry={onRetry} testid="commit-error" />}
      {detail.kind === "loading" && busy && <LoadingState label="Loading commit…" testid="commit-loading" />}
      {detail.kind === "idle" && (
        <EmptyState text={hasCurrent ? "Loading commit…" : "Select a revision"} testid="commit-empty" />
      )}
      {detail.kind === "ready" && <CommitDetailView detail={detail.value} {...refProps} />}
    </Box>
  )
}

// The Commit tab's body (split out of BottomPanel.tsx for the lint size limit).
// v0.18.3, owner: "When I click on a commit and view the Commit summary in
// the bottom panel, I should see the active branches / tags on this commit,
// with the icon to differentiate the local and remote." The Refs row
// (prototype branch-visibility.html tab 2 variant A) shows every ref of
// the commit as the grid's chips one size up, nothing folded; absent when
// the commit carries none. Pending rows never reach this view.
export function CommitDetailView({
  detail,
  tagNames,
  remoteNames,
  currentBranch,
  onSelectRef,
  onRefContextMenu,
}: Props) {
  const tagSet = useMemo(() => new Set(tagNames ?? []), [tagNames])
  return (
    <>
      <Typography variant="body1" sx={{ fontWeight: 600 }}>
        {detail.subject}
      </Typography>
      {detail.body ? (
        <Typography variant="body2" sx={{ mt: 1, whiteSpace: "pre-wrap" }}>
          {detail.body}
        </Typography>
      ) : null}
      {detail.refs.length > 0 && (
        <Box className="commit-refs" data-testid="commit-refs">
          <Typography variant="caption" color="text.secondary" component="span" className="commit-refs-label">
            Refs
          </Typography>
          <RefChips
            refs={detail.refs}
            tagSet={tagSet}
            remoteNames={remoteNames}
            current={currentBranch}
            big
            onRefClick={onSelectRef}
            onRefContextMenu={
              onRefContextMenu ? (e, name, kind) => onRefContextMenu(e, name, kind, detail.id) : undefined
            }
          />
        </Box>
      )}
      <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
        Author: {detail.author} &lt;{detail.authorEmail}&gt;
        <Box component="span" sx={{ ml: 2, color: "text.disabled" }}>
          {formatWhen(detail.authorDate)}
        </Box>
      </Typography>
      <Typography variant="body2" color="text.secondary">
        Committer: {detail.committer} &lt;{detail.committerEmail}&gt;
        <Box component="span" sx={{ ml: 2, color: "text.disabled" }}>
          {formatWhen(detail.commitDate)}
        </Box>
      </Typography>
      {detail.parents.length > 0 && (
        <Typography variant="caption" sx={{ display: "block", mt: 1, fontFamily: MONO_FONT }}>
          Parents: {detail.parents.map((p) => p.slice(0, 7)).join(" ")}
        </Typography>
      )}
      <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: "block", fontFamily: MONO_FONT }}>
        {detail.id}
      </Typography>
    </>
  )
}

function formatWhen(iso: string) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso.replace("T", " ").slice(0, 16)
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}
