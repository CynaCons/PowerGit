import Box from "@mui/material/Box"
import Button from "@mui/material/Button"
import Typography from "@mui/material/Typography"
import { useState } from "react"
import { openDeveloperTools, openLogsFolder } from "../../diagnostics/snapshot"
import { describeThrown } from "../../engine"
import { isTauriShell } from "../../shell"
import { openConsoleTab } from "../gitConsoleState"
import { RecoverySection } from "./RecoverySection"
import { SettingRow } from "./SettingRow"
import { SettingsSection } from "./SettingsSection"
import { isShown, type SettingId } from "./settingsCatalog"

// Diagnostics (v0.18.0): the log actions that used to sit under Tools, and
// the recovery ladder (v0.15.6), as two rows. Nothing here has a value to
// reset.

type Props = { visible: Set<SettingId> | null; onClose: () => void }

export function DiagnosticsSection({ visible, onClose }: Props) {
  const [devtools, setDevtools] = useState<{ failed: boolean; message?: string } | null>(null)
  const shell = isTauriShell()
  return (
    <SettingsSection id="diagnostics" visible={visible}>
      <SettingRow id="diagnostics.logs" hidden={!isShown(visible, "diagnostics.logs")}>
        <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
          {/* v0.15.3, owner: the WebKitGTK inspector would not open on Ubuntu
              and the button said nothing. The app log needs no inspector, so
              it comes first; "Open developer tools" reports why it failed. */}
          <Button
            variant="outlined"
            size="small"
            onClick={() => {
              openConsoleTab("app")
              onClose()
            }}
            data-testid="open-app-log"
          >
            Open app log
          </Button>
          {shell && (
            <Button
              variant="outlined"
              size="small"
              onClick={() => {
                setDevtools(null)
                openDeveloperTools()
                  .then(() => setDevtools({ failed: false }))
                  .catch((e: unknown) => setDevtools({ failed: true, message: describeThrown(e) }))
              }}
              data-testid="open-devtools"
            >
              Open developer tools
            </Button>
          )}
          {shell && (
            <Button
              variant="outlined"
              size="small"
              onClick={() => void openLogsFolder()}
              data-testid="open-logs-folder"
            >
              Open logs folder
            </Button>
          )}
        </Box>
        {devtools && (
          <Typography
            data-testid="devtools-note"
            variant="caption"
            color={devtools.failed ? "error" : "text.secondary"}
          >
            {devtools.failed
              ? `${devtools.message} — use Open app log instead.`
              : "Asked the system for the inspector. If no window appeared, it is unavailable here: use Open app log, which needs none."}
          </Typography>
        )}
      </SettingRow>
      <SettingRow id="diagnostics.recovery" hidden={!isShown(visible, "diagnostics.recovery")}>
        <RecoverySection />
      </SettingRow>
    </SettingsSection>
  )
}
