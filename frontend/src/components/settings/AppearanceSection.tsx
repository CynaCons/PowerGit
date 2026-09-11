import Box from "@mui/material/Box"
import Button from "@mui/material/Button"
import Typography from "@mui/material/Typography"
import { setThemePreference, useThemePreference, type ThemePreference } from "../../theme/appearance"
import { setAuthorDiscs, useAuthorDiscs } from "../../theme/authorDiscs"
import { setBarLayout, useBarLayout, type BarLayout } from "../../theme/barLayout"
import { ZOOM_DEFAULT, setZoom, stepZoom, useZoom, zoomPercent } from "../../theme/zoom"
import { SettingCheck, SettingSelect } from "./controls"
import { SettingRow } from "./SettingRow"
import { SettingsSection } from "./SettingsSection"
import { isShown, type SettingId } from "./settingsCatalog"

// Appearance (v0.18.0): theme, command placement and zoom read their
// stores and write them on change — what used to be a draft until Save
// (v0.13.18) now applies as it is made, and the row's Reset is the way
// back.

export function AppearanceSection({ visible }: { visible: Set<SettingId> | null }) {
  const theme = useThemePreference()
  const bar = useBarLayout()
  const zoom = useZoom()
  const discs = useAuthorDiscs()
  return (
    <SettingsSection id="appearance" visible={visible}>
      <SettingRow
        id="appearance.theme"
        hidden={!isShown(visible, "appearance.theme")}
        changed={theme !== "system"}
        onReset={() => setThemePreference("system")}
      >
        <SettingSelect
          value={theme}
          onChange={(v) => setThemePreference(v as ThemePreference)}
          label="Appearance"
          testid="settings-appearance"
        >
          <option value="system">System</option>
          <option value="light">Light</option>
          <option value="dark">Dark</option>
        </SettingSelect>
      </SettingRow>
      <SettingRow
        id="appearance.commandBar"
        hidden={!isShown(visible, "appearance.commandBar")}
        changed={bar !== "rail"}
        onReset={() => setBarLayout("rail")}
      >
        <SettingSelect
          value={bar}
          onChange={(v) => setBarLayout(v as BarLayout)}
          label="Command bar"
          testid="settings-bar-layout"
        >
          <option value="rail">In the left rail</option>
          <option value="top">In the title bar</option>
        </SettingSelect>
      </SettingRow>
      <SettingRow
        id="appearance.zoom"
        hidden={!isShown(visible, "appearance.zoom")}
        changed={zoom !== ZOOM_DEFAULT}
        onReset={() => setZoom(ZOOM_DEFAULT)}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
          <Button size="small" variant="outlined" onClick={() => setZoom(stepZoom(zoom, -1))} aria-label="Zoom out">
            −
          </Button>
          <Typography sx={{ minWidth: 44, textAlign: "center", fontVariantNumeric: "tabular-nums" }}>
            {zoomPercent(zoom)}
          </Typography>
          <Button size="small" variant="outlined" onClick={() => setZoom(stepZoom(zoom, 1))} aria-label="Zoom in">
            +
          </Button>
          <Button size="small" onClick={() => setZoom(ZOOM_DEFAULT)} aria-label="Reset zoom" sx={{ ml: 0.5 }}>
            Reset
          </Button>
        </Box>
      </SettingRow>
      {/* v0.18.1: off is the pre-disc look; the pill's Mark then only bolds the name. */}
      <SettingRow
        id="appearance.authorDiscs"
        hidden={!isShown(visible, "appearance.authorDiscs")}
        changed={!discs}
        onReset={() => setAuthorDiscs(true)}
      >
        <SettingCheck
          label="Show author discs"
          checked={discs}
          testid="settings-author-discs"
          onChange={setAuthorDiscs}
        />
      </SettingRow>
    </SettingsSection>
  )
}
