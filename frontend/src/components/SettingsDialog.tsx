import Button from "@mui/material/Button"
import Dialog from "@mui/material/Dialog"
import DialogActions from "@mui/material/DialogActions"
import DialogContent from "@mui/material/DialogContent"
import DialogTitle from "@mui/material/DialogTitle"
import FormControl from "@mui/material/FormControl"
import InputLabel from "@mui/material/InputLabel"
import MenuItem from "@mui/material/MenuItem"
import Select from "@mui/material/Select"
import TextField from "@mui/material/TextField"
import Typography from "@mui/material/Typography"
import { useEffect, useState } from "react"
import { useEngine, type GitConfig, type VsCodeInfo } from "../engine"
import { getBarLayout, setBarLayout, type BarLayout } from "../theme/barLayout"
import { getThemePreference, setThemePreference, type ThemePreference } from "../theme/appearance"
import { ZOOM_DEFAULT, getZoom, setZoom, stepZoom, zoomPercent } from "../theme/zoom"

type Props = { open: boolean; onClose: () => void }

// Settings (v0.13.18): every field is a draft until Save. Cancel, Escape or
// a backdrop click discards the drafts, including appearance, command
// placement and zoom, which used to apply the moment they were touched
// (audit: "change appearance, press Cancel, keep the change"). Git identity
// is written to this repository's own config; the values shown are the
// effective ones, which may be inherited from the global config.
export function SettingsDialog({ open, onClose }: Props) {
  const engine = useEngine()
  const [cfg, setCfg] = useState<GitConfig | null>(null)
  const [vs, setVs] = useState<VsCodeInfo | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [theme, setTheme] = useState<ThemePreference>("system")
  const [bar, setBar] = useState<BarLayout>("rail")
  const [zoom, setZoomDraft] = useState(ZOOM_DEFAULT)

  useEffect(() => {
    if (!open) return
    setError(null)
    setSaving(false)
    setTheme(getThemePreference())
    setBar(getBarLayout())
    setZoomDraft(getZoom())
    engine
      .config()
      .then(setCfg)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "config failed"))
    engine
      .vsCode()
      .then(setVs)
      .catch(() => setVs({ found: false, path: null, applied: false }))
  }, [engine, open])

  async function onSave() {
    if (saving) return
    setSaving(true)
    setError(null)
    try {
      if (cfg) setCfg(await engine.saveConfig(cfg))
      // Local preferences apply only once the Git config write succeeded, so
      // a failed save leaves nothing half-applied.
      setThemePreference(theme)
      setBarLayout(bar)
      setZoom(zoom)
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : "save failed")
    } finally {
      setSaving(false)
    }
  }

  async function onApplyVsCode() {
    try {
      setVs(await engine.applyVsCode())
    } catch (e) {
      setError(e instanceof Error ? e.message : "vscode apply failed")
    }
  }

  const section = (title: string, hint?: string) => (
    <Typography variant="subtitle2" sx={{ mt: 1 }}>
      {title}
      {hint && (
        <Typography component="span" variant="caption" color="text.secondary" sx={{ display: "block" }}>
          {hint}
        </Typography>
      )}
    </Typography>
  )

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Settings</DialogTitle>
      <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 3 }}>
        {error && <Typography color="error">{error}</Typography>}
        {section("Appearance", "This app, every repository.")}
        <FormControl margin="dense">
          <InputLabel id="appearance-label">Appearance</InputLabel>
          <Select
            labelId="appearance-label"
            label="Appearance"
            value={theme}
            onChange={(e) => setTheme(e.target.value as ThemePreference)}
            inputProps={{ "aria-label": "Appearance" }}
          >
            <MenuItem value="system">System</MenuItem>
            <MenuItem value="light">Light</MenuItem>
            <MenuItem value="dark">Dark</MenuItem>
          </Select>
        </FormControl>
        <FormControl margin="dense">
          <InputLabel id="bar-layout-label">Command bar</InputLabel>
          <Select
            labelId="bar-layout-label"
            label="Command bar"
            value={bar}
            onChange={(e) => setBar(e.target.value as BarLayout)}
            inputProps={{ "aria-label": "Command bar" }}
          >
            <MenuItem value="rail">In the left rail</MenuItem>
            <MenuItem value="top">In the title bar</MenuItem>
          </Select>
        </FormControl>
        <Typography variant="body2" color="text.secondary" sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          Zoom: {zoomPercent(zoom)}
          <Button size="small" onClick={() => setZoomDraft((z) => stepZoom(z, -1))} aria-label="Zoom out">
            −
          </Button>
          <Button size="small" onClick={() => setZoomDraft(ZOOM_DEFAULT)} aria-label="Reset zoom">
            Reset
          </Button>
          <Button size="small" onClick={() => setZoomDraft((z) => stepZoom(z, 1))} aria-label="Zoom in">
            +
          </Button>
        </Typography>

        {section(
          "Git identity",
          "Saved to this repository only. Shown values may be inherited from your global Git config.",
        )}
        <TextField
          label="User name"
          margin="dense"
          value={cfg?.userName ?? ""}
          disabled={!cfg}
          onChange={(e) => setCfg((c) => (c ? { ...c, userName: e.target.value } : c))}
        />
        <TextField
          label="Email"
          margin="dense"
          value={cfg?.userEmail ?? ""}
          disabled={!cfg}
          onChange={(e) => setCfg((c) => (c ? { ...c, userEmail: e.target.value } : c))}
        />
        <FormControl margin="dense" disabled={!cfg}>
          <InputLabel id="crlf-label">Line endings</InputLabel>
          <Select
            labelId="crlf-label"
            label="Line endings"
            value={cfg?.autoCrlf ?? ""}
            onChange={(e) => setCfg((c) => (c ? { ...c, autoCrlf: String(e.target.value) } : c))}
          >
            <MenuItem value="">Git default (core.autocrlf unset)</MenuItem>
            <MenuItem value="true">CRLF in the working tree, LF in commits (true)</MenuItem>
            <MenuItem value="input">Convert to LF on commit only (input)</MenuItem>
            <MenuItem value="false">Never convert (false)</MenuItem>
          </Select>
        </FormControl>

        {section("Tools")}
        <Typography variant="body2" color="text.secondary">
          VS Code: {vs?.found ? vs.path : "not found"}
        </Typography>
        <Button disabled={!vs?.found} onClick={onApplyVsCode} sx={{ alignSelf: "flex-start" }}>
          Use VS Code as editor / diff / merge
        </Button>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={onSave} disabled={saving}>
          Save
        </Button>
      </DialogActions>
    </Dialog>
  )
}
