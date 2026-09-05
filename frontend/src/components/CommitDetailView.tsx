import Box from "@mui/material/Box"
import Typography from "@mui/material/Typography"
import type { CommitDetail } from "../engine"
import { MONO_FONT } from "../theme"

// The Commit tab's body (split out of BottomPanel.tsx for the lint size limit).
export function CommitDetailView({ detail }: { detail: CommitDetail }) {
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
