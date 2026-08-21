import Box from "@mui/material/Box"
import List from "@mui/material/List"
import ListItemButton from "@mui/material/ListItemButton"
import ListItemText from "@mui/material/ListItemText"
import Paper from "@mui/material/Paper"
import Tab from "@mui/material/Tab"
import Tabs from "@mui/material/Tabs"
import Typography from "@mui/material/Typography"
import { useEffect, useState } from "react"
import { fetchCommit, fetchDiff, fetchFiles, type CommitDetail, type DiffDto, type FileChange } from "../engine"
import type { GraphRow } from "../graph/types"

type Props = {
  current: GraphRow | undefined
}

export function BottomPanel({ current }: Props) {
  const [tab, setTab] = useState(0)
  const [detail, setDetail] = useState<CommitDetail | null>(null)
  const [files, setFiles] = useState<FileChange[]>([])
  const [file, setFile] = useState<string | null>(null)
  const [diff, setDiff] = useState<DiffDto | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!current) {
      setDetail(null)
      setFiles([])
      setFile(null)
      setDiff(null)
      return
    }

    const id = current.rev.id
    if (id.length < 16) {
      return
    }
    setError(null)
    setFile(null)
    setDiff(null)
    fetchCommit(id)
      .then(setDetail)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "commit failed"))
    fetchFiles(id)
      .then((list) => {
        setFiles(list)
        if (list[0]) setFile(list[0].path)
      })
      .catch(() => setFiles([]))
  }, [current])

  useEffect(() => {
    if (!current || !file || current.rev.id.length < 16) {
      setDiff(null)
      return
    }
    fetchDiff(current.rev.id, file)
      .then(setDiff)
      .catch((e: unknown) => setDiff({ path: file, text: e instanceof Error ? e.message : "diff failed", binary: false }))
  }, [current, file])

  return (
    <Paper data-testid="bottom-panel" sx={{ height: 260, flexShrink: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <Tabs value={tab} onChange={(_, v: number) => setTab(v)} sx={{ px: 1, minHeight: 42, borderBottom: 1, borderColor: "divider" }}>
        <Tab label="Commit" />
        <Tab label={`Files${files.length ? ` (${files.length})` : ""}`} />
        <Tab label="Diff" />
      </Tabs>
      <Box sx={{ flex: 1, minHeight: 0, display: "flex" }}>
        {tab === 0 && (
          <Box data-testid="commit-info" sx={{ flex: 1, overflow: "auto", p: 2 }}>
            {error && <Typography color="error">{error}</Typography>}
            {detail ? (
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
                  Author: {detail.author} &lt;{detail.authorEmail}&gt; · {formatWhen(detail.authorDate)}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Committer: {detail.committer} &lt;{detail.committerEmail}&gt; · {formatWhen(detail.commitDate)}
                </Typography>
                {detail.parents.length > 0 && (
                  <Typography variant="caption" sx={{ display: "block", mt: 1, fontFamily: "Fira Code, ui-monospace, monospace" }}>
                    Parents: {detail.parents.map((p) => p.slice(0, 7)).join(" ")}
                  </Typography>
                )}
                <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: "block", fontFamily: "Fira Code, ui-monospace, monospace" }}>
                  {detail.id}
                </Typography>
              </>
            ) : (
              <Typography color="text.secondary">{current ? "Loading…" : "Select a revision"}</Typography>
            )}
          </Box>
        )}
        {tab === 1 && (
          <List data-testid="file-list" dense disablePadding sx={{ flex: 1, overflow: "auto" }}>
            {files.length === 0 ? (
              <Box sx={{ p: 2 }}>
                <Typography color="text.secondary">No files for this revision.</Typography>
              </Box>
            ) : (
              files.map((f) => (
                <ListItemButton
                  key={f.path}
                  selected={file === f.path}
                  onClick={() => {
                    setFile(f.path)
                    setTab(2)
                  }}
                >
                  <ListItemText
                    primary={f.path}
                    secondary={f.status}
                    slotProps={{ primary: { sx: { fontFamily: "Fira Code, ui-monospace, monospace", fontSize: 12 } } }}
                  />
                </ListItemButton>
              ))
            )}
          </List>
        )}
        {tab === 2 && (
          <Box
            data-testid="diff-pane"
            component="pre"
            sx={{
              m: 0,
              p: 2,
              flex: 1,
              overflow: "auto",
              fontFamily: "Fira Code, ui-monospace, monospace",
              fontSize: 12,
              bgcolor: "grey.50",
            }}
          >
            {diff ? diff.text : "Select a file in Files."}
          </Box>
        )}
      </Box>
    </Paper>
  )
}

function formatWhen(iso: string) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso.replace("T", " ").slice(0, 16)
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}
