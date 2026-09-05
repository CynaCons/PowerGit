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
import { setBarLayout, useBarLayout, type BarLayout } from "../theme/barLayout"
import {
  setThemePreference,
  useThemePreference,
  useZoom,
  zoomIn,
  zoomOut,
  zoomPercent,
  zoomReset,
  type ThemePreference,
} from "../theme"

type Props = { open: boolean; onClose: () => void }

export function SettingsDialog({ open, onClose }: Props) {
  const engine = useEngine()
  const [cfg, setCfg] = useState<GitConfig | null>(null)
  const [vs, setVs] = useState<VsCodeInfo | null>(null)
  const [error, setError] = useState<string | null>(null)
  const themePreference = useThemePreference()
  const barLayout = useBarLayout()
  const zoom = useZoom()

  useEffect(() => {
    if (!open) return
    setError(null)
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
    if (!cfg) return
    try {
      setCfg(await engine.saveConfig(cfg))
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : "save failed")
    }
  }

  async function onApplyVsCode() {
    try {
      setVs(await engine.applyVsCode())
    } catch (e) {
      setError(e instanceof Error ? e.message : "vscode apply failed")
    }
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Settings</DialogTitle>
      <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 3 }}>
        {error && <Typography color="error">{error}</Typography>}
        <TextField
          label="User name"
          margin="dense"
          value={cfg?.userName ?? ""}
          onChange={(e) => setCfg((c) => (c ? { ...c, userName: e.target.value } : c))}
        />
        <TextField
          label="Email"
          margin="dense"
          value={cfg?.userEmail ?? ""}
          onChange={(e) => setCfg((c) => (c ? { ...c, userEmail: e.target.value } : c))}
        />
        <FormControl margin="dense">
          <InputLabel id="crlf-label">core.autocrlf</InputLabel>
          <Select
            labelId="crlf-label"
            label="core.autocrlf"
            value={cfg?.autoCrlf ?? ""}
            onChange={(e) => setCfg((c) => (c ? { ...c, autoCrlf: String(e.target.value) } : c))}
          >
            <MenuItem value="">(unset)</MenuItem>
            <MenuItem value="true">true</MenuItem>
            <MenuItem value="input">input</MenuItem>
            <MenuItem value="false">false</MenuItem>
          </Select>
        </FormControl>
        <FormControl margin="dense">
          <InputLabel id="appearance-label">Appearance</InputLabel>
          <Select
            labelId="appearance-label"
            label="Appearance"
            value={themePreference}
            onChange={(e) => setThemePreference(e.target.value as ThemePreference)}
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
            value={barLayout}
            onChange={(e) => setBarLayout(e.target.value as BarLayout)}
            inputProps={{ "aria-label": "Command bar" }}
          >
            <MenuItem value="rail">In the left rail</MenuItem>
            <MenuItem value="top">In the title bar</MenuItem>
          </Select>
        </FormControl>
        <Typography variant="body2" color="text.secondary" sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          Zoom: {zoomPercent(zoom)}
          <Button size="small" onClick={zoomOut} aria-label="Zoom out">
            −
          </Button>
          <Button size="small" onClick={zoomReset} aria-label="Reset zoom">
            Reset
          </Button>
          <Button size="small" onClick={zoomIn} aria-label="Zoom in">
            +
          </Button>
        </Typography>
        <Typography variant="body2" color="text.secondary">
          VS Code: {vs?.found ? vs.path : "not found"}
        </Typography>
        <Button disabled={!vs?.found} onClick={onApplyVsCode}>
          Use VS Code as editor / diff / merge
        </Button>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={onSave}>
          Save
        </Button>
      </DialogActions>
    </Dialog>
  )
}
