import Box from "@mui/material/Box"
import Paper from "@mui/material/Paper"
import Tab from "@mui/material/Tab"
import Tabs from "@mui/material/Tabs"
import Typography from "@mui/material/Typography"
import { useEffect, useState } from "react"
import { CommitFileTree } from "./CommitFileTree"
import { CompactFileList } from "./CompactFileList"
import { DiffView } from "./DiffView"
import { fetchCommit, fetchDiff, fetchFiles, type CommitDetail, type DiffDto, type FileChange } from "../engine"
import type { GraphRow } from "../graph/types"

type Props = {
  current: GraphRow | undefined
  height: number
}

export function BottomPanel({ current, height }: Props) {
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
    let cancelled = false
    fetchDiff(current.rev.id, file)
      .then((d) => {
        if (!cancelled) setDiff(d)
      })
      .catch((e: unknown) => {
        if (!cancelled) setDiff({ path: file, text: e instanceof Error ? e.message : "diff failed", binary: false })
      })
    return () => {
      cancelled = true
    }
  }, [current, file])

  return (
    <Paper data-testid="bottom-panel" sx={{ height, flexShrink: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <Tabs value={tab} onChange={(_, v: number) => setTab(v)} sx={{ px: 0.5, minHeight: 34, "& .MuiTab-root": { minHeight: 34, py: 0.5 }, borderBottom: 1, borderColor: "divider" }}>
        <Tab label="Commit" />
        <Tab label={`Diff${files.length ? ` (${files.length})` : ""}`} />
        <Tab label="File Tree" />
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
          <>
            <Box sx={{ width: 340, flexShrink: 0, overflow: "auto", borderRight: 1, borderColor: "divider", display: "flex", flexDirection: "column" }}>
              <CompactFileList
                testid="file-list"
                files={files}
                selectedPath={file}
                emptyText="No files for this revision."
                onSelect={(f) => setFile(f.path)}
              />
            </Box>
            <DiffPane diff={diff} file={file} />
          </>
        )}
        {tab === 2 && (
          <CommitFileTree
            commitId={current && current.rev.id.length >= 16 ? current.rev.id : null}
            onSelectFile={(path) => {
              setFile(path)
              setTab(1)
            }}
          />
        )}
      </Box>
    </Paper>
  )
}

function DiffPane({ diff, file }: { diff: DiffDto | null; file: string | null }) {
  return (
    <Box
      data-testid="diff-pane"
      sx={{
        m: 0,
        p: 2,
        flex: 1,
        minWidth: 0,
        overflow: "auto",
        bgcolor: "#ffffff",
      }}
    >
      {diff ? <DiffView text={diff.text} /> : file ? "Loading diff…" : "Select a file."}
    </Box>
  )
}

function formatWhen(iso: string) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso.replace("T", " ").slice(0, 16)
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}
