import Box from "@mui/material/Box"
import Button from "@mui/material/Button"
import Drawer from "@mui/material/Drawer"
import IconButton from "@mui/material/IconButton"
import Typography from "@mui/material/Typography"
import CloseIcon from "@mui/icons-material/Close"
import { useEffect, useState } from "react"
import { explainGitFailure } from "../gitErrors"
import type { JobRecord, Jobs } from "../hooks/useJobs"
import { copyToClipboard } from "./clipboard"

function elapsed(startedAt: string, finishedAt: string | null, now: number): string {
  const end = finishedAt ? new Date(finishedAt).getTime() : now
  const s = Math.max(0, Math.round((end - new Date(startedAt).getTime()) / 1000))
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`
}

/**
 * v0.13.12: the non-modal operation detail behind the status-bar progress
 * line. Lists this session's network operations newest first with elapsed
 * time, the sanitized command, live/final output, and cancel / retry / copy.
 */
export function JobPanel({ jobs, onClose }: { jobs: Jobs; onClose: () => void }) {
  const { panelOpen, jobs: records, cancelActive, retryJob, clearJobs, busy } = jobs
  const [now, setNow] = useState(() => Date.now())
  const running = records.some((j) => j.status === "running")
  useEffect(() => {
    if (!panelOpen || !running) return
    const t = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(t)
  }, [panelOpen, running])

  return (
    <Drawer
      anchor="right"
      open={panelOpen}
      onClose={onClose}
      hideBackdrop
      variant="persistent"
      data-testid="job-panel"
      slotProps={{
        paper: {
          sx: { width: 420, maxWidth: "90vw", top: "auto", bottom: 24, height: "min(70vh, 560px)", boxShadow: 6 },
        },
      }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          px: 1.5,
          py: 0.75,
          borderBottom: 1,
          borderColor: "divider",
          gap: 1,
        }}
      >
        <Typography variant="subtitle2" sx={{ flex: 1 }} id="job-panel-title">
          Operations
        </Typography>
        <Button size="small" onClick={clearJobs} disabled={records.every((j) => j.status === "running")}>
          Clear finished
        </Button>
        <IconButton size="small" aria-label="Close operations" onClick={onClose} data-testid="job-panel-close">
          <CloseIcon fontSize="small" />
        </IconButton>
      </Box>
      <Box
        sx={{ flex: 1, overflow: "auto", display: "flex", flexDirection: "column" }}
        role="list"
        aria-labelledby="job-panel-title"
      >
        {records.length === 0 && (
          <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>
            No network operations yet this session.
          </Typography>
        )}
        {records.map((rec) => (
          <JobRow
            key={rec.key}
            rec={rec}
            now={now}
            busy={busy}
            onCancel={rec.status === "running" ? () => void cancelActive() : undefined}
            onRetry={rec.status !== "running" ? () => void retryJob(rec) : undefined}
          />
        ))}
      </Box>
    </Drawer>
  )
}

function JobRow({
  rec,
  now,
  busy,
  onCancel,
  onRetry,
}: {
  rec: JobRecord
  now: number
  busy: boolean
  onCancel?: () => void
  onRetry?: () => void
}) {
  const failure = rec.status === "failed" ? explainGitFailure(rec.error) : null
  const text = rec.output ?? rec.error ?? ""
  return (
    <Box
      role="listitem"
      data-testid="job-row"
      data-status={rec.status}
      sx={{
        px: 1.5,
        py: 1,
        borderBottom: 1,
        borderColor: "divider",
        display: "flex",
        flexDirection: "column",
        gap: 0.5,
      }}
    >
      <Box sx={{ display: "flex", alignItems: "baseline", gap: 1 }}>
        <Typography variant="body2" sx={{ fontWeight: 600, flex: 1 }} noWrap>
          {rec.label}
        </Typography>
        <Typography
          variant="caption"
          sx={{
            color:
              rec.status === "failed" ? "error.main" : rec.status === "completed" ? "success.main" : "text.secondary",
          }}
        >
          {rec.status === "running" ? "running" : rec.cancelled ? "cancelled" : rec.status}
        </Typography>
        <Typography variant="caption" color="text.disabled">
          {elapsed(rec.startedAt, rec.finishedAt, now)}
        </Typography>
      </Box>
      {rec.command && (
        <Typography variant="caption" sx={{ fontFamily: "var(--pg-font-mono)" }} color="text.secondary">
          {rec.command}
        </Typography>
      )}
      {failure && (
        <Box>
          <Typography variant="body2" color="error">
            {failure.title}
          </Typography>
          {failure.hint && (
            <Typography variant="caption" color="text.secondary">
              {failure.hint}
            </Typography>
          )}
        </Box>
      )}
      {text && (
        <Box
          component="pre"
          data-testid="job-output"
          sx={{
            m: 0,
            maxHeight: 160,
            overflow: "auto",
            fontFamily: "var(--pg-font-mono)",
            fontSize: 11,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            bgcolor: "var(--pg-code-bg, #f8fafc)",
            p: 1,
            borderRadius: 1,
          }}
        >
          {text}
        </Box>
      )}
      <Box sx={{ display: "flex", gap: 0.5 }}>
        {onCancel && (
          <Button size="small" color="warning" onClick={onCancel} data-testid="job-cancel">
            Cancel
          </Button>
        )}
        {onRetry && (
          <Button size="small" onClick={onRetry} disabled={busy} data-testid="job-retry">
            Retry
          </Button>
        )}
        {text && (
          <Button size="small" onClick={() => void copyToClipboard(`${rec.command ?? rec.label}\n${text}`)}>
            Copy
          </Button>
        )}
      </Box>
    </Box>
  )
}
