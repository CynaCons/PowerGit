import ArrowBackIcon from "@mui/icons-material/ArrowBack"
import SearchIcon from "@mui/icons-material/Search"
import Box from "@mui/material/Box"
import IconButton from "@mui/material/IconButton"
import InputAdornment from "@mui/material/InputAdornment"
import TextField from "@mui/material/TextField"
import Typography from "@mui/material/Typography"
import { useMemo, useState } from "react"
import { AppearanceSection } from "./AppearanceSection"
import { BehaviourSection } from "./BehaviourSection"
import { DiagnosticsSection } from "./DiagnosticsSection"
import { IdentitySection } from "./IdentitySection"
import { SettingsToc } from "./SettingsToc"
import { ToolsSection } from "./ToolsSection"
import { UpdatesSection } from "./UpdatesSection"
import { matchSettings } from "./settingsCatalog"
import type { GitScope } from "./useGitConfig"

// Settings as a page (v0.18.0, owner: "It's ugly, poor layout… We could do
// something like VS Code" — layout A of docs/prototypes/settings-layouts.html).
// It sits where the tree, the graph and the bottom panel were; the back
// arrow, the gear and Escape return there. A header with the search box,
// a contents column on the left and one long list of sections on the
// right. Nothing is a draft: every row writes its store or its Git key as
// it is changed, and a row that differs from its default says so with a
// bar and a Reset. The search hides every row it does not match, the
// sections that end up empty, and their contents entries.

type Props = { onClose: () => void }

export function SettingsView({ onClose }: Props) {
  const [query, setQuery] = useState("")
  // One scope for both Git sections: flipping it in Tools flips Identity.
  const [scope, setScope] = useState<GitScope>("local")
  const visible = useMemo(() => matchSettings(query), [query])
  const count = visible === null ? null : visible.size

  return (
    <Box
      data-testid="settings-page"
      tabIndex={-1}
      onKeyDown={(e) => {
        if (e.key !== "Escape") return
        e.stopPropagation()
        // Escape empties the search first; a second one leaves the page.
        if (query) {
          setQuery("")
          return
        }
        onClose()
      }}
      sx={{
        flex: 1,
        minWidth: 0,
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        bgcolor: "background.paper",
        outline: "none",
      }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1.5,
          minHeight: 48,
          px: 2.5,
          borderBottom: 1,
          borderColor: "divider",
          flexShrink: 0,
        }}
      >
        <IconButton size="small" onClick={onClose} aria-label="Back to Browse" data-testid="settings-back">
          <ArrowBackIcon fontSize="small" />
        </IconButton>
        <Typography component="h2" sx={{ fontSize: 15, fontWeight: 600, m: 0 }}>
          Settings
        </Typography>
        <TextField
          size="small"
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search settings  (fetch, editor, force…)"
          slotProps={{
            htmlInput: { "aria-label": "Search settings", "data-testid": "settings-search" },
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon sx={{ fontSize: 16, color: "text.secondary" }} />
                </InputAdornment>
              ),
              endAdornment:
                count === null ? undefined : (
                  <InputAdornment position="end">
                    <Typography data-testid="settings-count" sx={{ fontSize: 11, color: "text.secondary" }}>
                      {count} {count === 1 ? "setting" : "settings"}
                    </Typography>
                  </InputAdornment>
                ),
            },
          }}
          sx={{
            ml: 1.5,
            flex: 1,
            maxWidth: 460,
            "& .MuiInputBase-root": { bgcolor: "var(--pg-surface-sunken)", height: 30 },
            "& .MuiInputBase-root.Mui-focused": { bgcolor: "background.paper" },
          }}
        />
        <Box
          sx={{ ml: "auto", display: "flex", alignItems: "center", gap: 0.75, color: "text.secondary", fontSize: 12 }}
        >
          <Box sx={{ width: 7, height: 7, borderRadius: "50%", bgcolor: "var(--pg-status-ok)" }} />
          Changes apply as you make them
        </Box>
      </Box>
      <SettingsToc visible={visible}>
        <AppearanceSection visible={visible} />
        <IdentitySection visible={visible} scope={scope} onScope={setScope} />
        <ToolsSection visible={visible} scope={scope} onScope={setScope} />
        <BehaviourSection visible={visible} />
        <DiagnosticsSection visible={visible} onClose={onClose} />
        <UpdatesSection visible={visible} />
        {count === 0 && (
          <Typography data-testid="settings-empty" sx={{ color: "text.secondary", py: 5, textAlign: "center" }}>
            No setting matches.
          </Typography>
        )}
      </SettingsToc>
    </Box>
  )
}
