import Box from "@mui/material/Box"
import Button from "@mui/material/Button"
import Checkbox from "@mui/material/Checkbox"
import FormControlLabel from "@mui/material/FormControlLabel"
import Radio from "@mui/material/Radio"
import RadioGroup from "@mui/material/RadioGroup"
import TextField from "@mui/material/TextField"
import Typography from "@mui/material/Typography"
import { useEffect, useState } from "react"
import { useEngine, type RepoInfo, type RepoStatus } from "../../engine"
import type { Jobs, PreviewKind } from "../../hooks/useJobs"
import { OpDialog } from "./OpDialog"

/**
 * v0.13.12: Pull and Push state their source/destination before running.
 * Fetch stays one click (the toolbar shows the remote it targets); pull and
 * push show branch, upstream, ahead/behind and the rebase / force choice,
 * and force-with-lease needs the branch name typed back.
 */
export function PullPushPreview({
  kind,
  repo,
  status,
  jobs,
  onClose,
}: {
  kind: PreviewKind
  repo: RepoInfo | null
  status: RepoStatus | null
  jobs: Pick<Jobs, "runJob" | "busy">
  onClose: () => void
}) {
  const engine = useEngine()
  const [rebase, setRebase] = useState<"ff" | "rebase">("ff")
  const [force, setForce] = useState(kind === "push-force")
  const [confirmName, setConfirmName] = useState("")
  useEffect(() => {
    setForce(kind === "push-force")
    setConfirmName("")
  }, [kind])

  const branch = repo?.branch ?? status?.branch ?? "(detached)"
  const upstream = status?.upstream ?? null
  const ahead = status?.ahead ?? null
  const behind = status?.behind ?? null
  const isPull = kind === "pull"
  const forceOk = !force || confirmName.trim() === branch

  const run = () => {
    onClose()
    if (isPull) {
      const useRebase = rebase === "rebase"
      void jobs.runJob(useRebase ? "Pulling (rebase)" : "Pulling", () => engine.startPull(useRebase))
    } else {
      void jobs.runJob(force ? "Pushing (force with lease)" : "Pushing", () => engine.startPush(force))
    }
  }

  const Row = ({ label, value, testid }: { label: string; value: string; testid?: string }) => (
    <Box sx={{ display: "flex", gap: 1, alignItems: "baseline" }}>
      <Typography variant="caption" color="text.secondary" sx={{ width: 96, flexShrink: 0 }}>
        {label}
      </Typography>
      <Typography
        variant="body2"
        data-testid={testid}
        sx={{ fontFamily: "var(--pg-font-mono)", wordBreak: "break-all" }}
      >
        {value}
      </Typography>
    </Box>
  )

  return (
    <OpDialog
      open
      title={isPull ? "Pull" : force ? "Push (force with lease)" : "Push"}
      onClose={onClose}
      actions={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="contained"
            color={force ? "warning" : "primary"}
            onClick={run}
            disabled={jobs.busy || !forceOk}
            data-testid="preview-confirm"
          >
            {isPull ? (rebase === "rebase" ? "Pull with rebase" : "Pull") : force ? "Force push" : "Push"}
          </Button>
        </>
      }
    >
      <Box data-testid={`${kind}-preview`} sx={{ display: "flex", flexDirection: "column", gap: 0.75 }}>
        <Row label={isPull ? "Into branch" : "From branch"} value={branch} testid="preview-branch" />
        <Row
          label={isPull ? "From" : "To"}
          value={
            upstream ?? (isPull ? "no upstream — pull will fail" : "no upstream — push sets origin/HEAD as upstream")
          }
          testid="preview-upstream"
        />
        {ahead !== null && behind !== null && (
          <Row label="Ahead / behind" value={`↑${ahead} ↓${behind}`} testid="preview-ahead-behind" />
        )}
        {isPull && behind === 0 && ahead !== null && (
          <Typography variant="caption" color="text.secondary">
            Already up to date with the upstream.
          </Typography>
        )}
        {!isPull && behind !== null && behind > 0 && !force && (
          <Typography variant="caption" color="warning.main">
            The upstream has {behind} commit{behind === 1 ? "" : "s"} you do not have; a plain push will be rejected.
          </Typography>
        )}
      </Box>
      {isPull ? (
        <RadioGroup value={rebase} onChange={(e) => setRebase(e.target.value as "ff" | "rebase")}>
          <FormControlLabel value="ff" control={<Radio size="small" />} label="Fast-forward only (fails if diverged)" />
          <FormControlLabel
            value="rebase"
            control={<Radio size="small" />}
            label="Rebase local commits onto the upstream"
          />
        </RadioGroup>
      ) : (
        <>
          <FormControlLabel
            control={
              <Checkbox
                size="small"
                checked={force}
                onChange={(e) => setForce(e.target.checked)}
                data-testid="preview-force"
              />
            }
            label="Force with lease (rewrites the remote branch if nobody else pushed)"
          />
          {force && (
            <TextField
              size="small"
              label={`Type ${branch} to confirm`}
              value={confirmName}
              onChange={(e) => setConfirmName(e.target.value)}
              autoFocus
              slotProps={{ htmlInput: { "data-testid": "preview-force-confirm" } }}
            />
          )}
        </>
      )}
    </OpDialog>
  )
}
