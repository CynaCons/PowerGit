import Box from "@mui/material/Box"
import Button from "@mui/material/Button"
import Typography from "@mui/material/Typography"
import type { Pending } from "./pendingRows"

/** The Commit tab for a pending row: what it is and where to act on it. */
export function PendingSummary({
  pending,
  branch,
  onOpenCommit,
}: {
  pending: NonNullable<Pending>
  branch: string | null
  onOpenCommit: () => void
}) {
  const noun = pending.count === 1 ? "file" : "files"
  return (
    // Same testid as the commit view: it is what the Commit tab shows for this row.
    <Box
      sx={{ p: 2, display: "flex", flexDirection: "column", gap: 1 }}
      data-testid="commit-info"
      data-pending={pending.kind}
    >
      <Typography variant="subtitle1">
        {pending.kind === "worktree" ? "Working directory" : "Index"}
        {branch ? ` on ${branch}` : ""}
      </Typography>
      <Typography variant="body2" color="text.secondary">
        {pending.kind === "worktree"
          ? `${pending.count} ${noun} changed in the working tree and not staged. The Diff tab shows each change against the index.`
          : `${pending.count} ${noun} staged for the next commit. The Diff tab shows each change against HEAD.`}
      </Typography>
      <Button
        variant="contained"
        size="small"
        onClick={onOpenCommit}
        sx={{ alignSelf: "flex-start" }}
        data-testid="pending-open-commit"
      >
        Open commit dialog
      </Button>
    </Box>
  )
}
