import Box from "@mui/material/Box"
import Button from "@mui/material/Button"
import LinearProgress from "@mui/material/LinearProgress"
import Link from "@mui/material/Link"
import Typography from "@mui/material/Typography"
import { useEffect, useState } from "react"
import { openAppLocation } from "../../diagnostics/snapshot"
import { useEngine } from "../../engine"
import { useUpdater } from "../../hooks/useUpdater"
import { isTauriShell } from "../../shell"
import { progressPercent, progressText } from "../../updates/updateMachine"
import { SettingRow } from "./SettingRow"
import { SettingsSection } from "./SettingsSection"
import { isShown, type SettingId } from "./settingsCatalog"

// Updates (v0.14.0; its own section since v0.18.0). The version is the
// row's title, so "PowerGit v1.2.3" reads as one line above the check.

export function UpdatesSection({ visible }: { visible: Set<SettingId> | null }) {
  const engine = useEngine()
  const updater = useUpdater()
  const [version, setVersion] = useState<string | null>(null)
  // App and engine share the one version in package.json (check-version.mjs).
  useEffect(() => {
    let cancelled = false
    engine
      .health()
      .then((h) => {
        if (!cancelled) setVersion(h.engine)
      })
      .catch(() => {
        if (!cancelled) setVersion(null)
      })
    return () => {
      cancelled = true
    }
  }, [engine])
  return (
    <SettingsSection id="updates" visible={visible}>
      <SettingRow
        id="updates.check"
        title={version ? `PowerGit v${version}` : "PowerGit"}
        hidden={!isShown(visible, "updates.check")}
      >
        <UpdateControls updater={updater} />
      </SettingRow>
      <SettingRow id="updates.location" hidden={!isShown(visible, "updates.location")}>
        <Button variant="outlined" size="small" disabled={!isTauriShell()} onClick={() => void openAppLocation()}>
          Open app location
        </Button>
      </SettingRow>
    </SettingsSection>
  )
}

// Manual updates (v0.14.0): nothing is fetched until "Check for updates",
// nothing installed until "Download and restart". Outside the desktop app
// (browser, Pages demo) the row only says where updates come from.
function UpdateControls({ updater }: { updater: ReturnType<typeof useUpdater> }) {
  const { state, kind, checkNow, install } = updater
  if (kind === "none") {
    return (
      <Typography variant="body2" color="text.secondary" data-testid="updates-none">
        Updates come with the desktop app. Downloads:{" "}
        <Link href="https://github.com/CynaCons/PowerGit/releases" target="_blank" rel="noreferrer">
          github.com/CynaCons/PowerGit/releases
        </Link>
      </Typography>
    )
  }
  const busy = state.phase === "checking" || state.phase === "downloading"
  const update =
    state.phase === "available" || state.phase === "ready" || state.phase === "downloading" ? state.update : null
  return (
    <Box
      sx={{ display: "flex", flexDirection: "column", gap: 1, alignSelf: "stretch" }}
      data-testid="updates-section"
      data-phase={state.phase}
    >
      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        <Button variant="outlined" size="small" onClick={checkNow} disabled={busy} data-testid="update-check">
          Check for updates
        </Button>
        {state.phase === "checking" && (
          <Typography variant="body2" color="text.secondary">
            Checking…
          </Typography>
        )}
        {state.phase === "upToDate" && (
          <Typography variant="body2" color="text.secondary" data-testid="update-uptodate">
            You are up to date.
          </Typography>
        )}
      </Box>
      {update && (
        <Typography variant="body2" data-testid="update-available">
          PowerGit v{update.version} is available.
          {update.notes ? ` ${update.notes}` : ""}
        </Typography>
      )}
      {state.phase === "available" && (
        <>
          <Typography variant="caption" color="text.secondary">
            PowerGit closes, installs v{state.update.version} and reopens.
          </Typography>
          <Button
            variant="contained"
            size="small"
            onClick={install}
            sx={{ alignSelf: "flex-start" }}
            data-testid="update-install"
          >
            Download and restart
          </Button>
        </>
      )}
      {state.phase === "downloading" && (
        <Box data-testid="update-progress" sx={{ maxWidth: 420 }}>
          <LinearProgress
            variant={progressPercent(state.received, state.total) === null ? "indeterminate" : "determinate"}
            value={progressPercent(state.received, state.total) ?? 0}
          />
          <Typography variant="caption" color="text.secondary">
            Downloading {progressText(state.received, state.total)}
          </Typography>
        </Box>
      )}
      {state.phase === "ready" && (
        <Typography variant="body2" color="text.secondary" data-testid="update-ready">
          Downloaded. PowerGit is restarting…
        </Typography>
      )}
      {state.phase === "error" && (
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <Typography variant="body2" color="error" data-testid="update-error">
            {state.message}
          </Typography>
          <Button size="small" onClick={state.update ? install : checkNow}>
            Retry
          </Button>
        </Box>
      )}
    </Box>
  )
}
