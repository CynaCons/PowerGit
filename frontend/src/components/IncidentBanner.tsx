import Alert from "@mui/material/Alert"
import Button from "@mui/material/Button"
import { useEffect, useState } from "react"
import { lastIncident, revealInFolder, type Incident } from "../diagnostics/snapshot"
import { copyToClipboard } from "./clipboard"

// Shown once, on the launch after the watchdog caught the webview not
// responding (v0.14.1): the snapshot already exists, this is how the user
// finds it without hunting for the logs folder.
export function IncidentBanner() {
  const [incident, setIncident] = useState<Incident | null>(null)
  useEffect(() => {
    void lastIncident().then((i) => setIncident(i))
  }, [])
  if (!incident) return null
  const when = incident.at.replace("T", " ").slice(0, 19)
  return (
    <Alert
      severity="warning"
      data-testid="incident-banner"
      onClose={() => setIncident(null)}
      sx={{ borderRadius: 0, py: 0, alignItems: "center" }}
      action={
        <>
          <Button size="small" color="inherit" onClick={() => void copyToClipboard(incident.snapshot)}>
            Copy path
          </Button>
          <Button size="small" color="inherit" onClick={() => void revealInFolder(incident.snapshot)}>
            Show in folder
          </Button>
          <Button size="small" color="inherit" onClick={() => setIncident(null)}>
            Dismiss
          </Button>
        </>
      }
    >
      PowerGit stopped responding on {when}. A diagnostic snapshot was saved; please attach it to your report.
    </Alert>
  )
}
