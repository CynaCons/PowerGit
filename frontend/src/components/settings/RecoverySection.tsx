import Box from "@mui/material/Box"
import Button from "@mui/material/Button"
import Typography from "@mui/material/Typography"
import { useState } from "react"
import { describeThrown } from "../../engine"
import { RECOVERY_STEPS, RECOVERY_TRY_FIRST, requestRecovery } from "../../diagnostics/recovery"
import { shortcutLabel, type CommandId } from "../../hotkeys"
import { isTauriShell } from "../../shell"

// Settings → Diagnostics → Recovery experiments (v0.15.6). The nine steps
// of the shell's recovery ladder, each with its hotkey, for the owner to
// try while the picture is frozen. The hotkeys are the real trigger (a
// frozen window cannot show this page); the list is where the owner reads
// what they do. The row's title and description come from the catalog;
// this is the control under them.

export function RecoverySection() {
  const shell = isTauriShell()
  const [note, setNote] = useState<string | null>(null)
  const tryFirst = RECOVERY_TRY_FIRST.join(", ")

  const run = (step: number) => {
    setNote(null)
    requestRecovery(step)
      .then((key) => setNote(key ? `Step ${step} (${key}) requested — see engine.log.` : null))
      .catch((e: unknown) => setNote(`Step ${step} failed: ${describeThrown(e)}`))
  }

  return (
    <Box data-testid="recovery-experiments" sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
      <Typography variant="caption" color="text.secondary" data-testid="recovery-experiments-help">
        Try {tryFirst} first. Every press is written to engine.log
        {shell ? "." : " (desktop app only; the buttons do nothing in a browser)."}
      </Typography>
      <Box component="ul" sx={{ m: 0, pl: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 0.25 }}>
        {RECOVERY_STEPS.map((s) => (
          <Box
            component="li"
            key={s.step}
            data-testid={`recovery-step-${s.step}`}
            data-key={s.key}
            sx={{ display: "flex", alignItems: "center", gap: 1 }}
          >
            <Button
              size="small"
              variant="outlined"
              disabled={!shell}
              onClick={() => run(s.step)}
              data-testid={`recovery-run-${s.step}`}
              sx={{ minWidth: 0, whiteSpace: "nowrap", fontSize: 11, py: 0.125, px: 0.75 }}
            >
              {shortcutLabel(`recovery.step${s.step}` as CommandId)}
            </Button>
            <Typography variant="body2" component="span">
              <code>{s.key}</code> — {s.meaning}
              {RECOVERY_TRY_FIRST.includes(s.step) ? " · try first" : ""}
            </Typography>
          </Box>
        ))}
      </Box>
      {note && (
        <Typography variant="caption" color="text.secondary" data-testid="recovery-note">
          {note}
        </Typography>
      )}
    </Box>
  )
}
