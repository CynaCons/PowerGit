import Box from "@mui/material/Box"
import ToggleButton from "@mui/material/ToggleButton"
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup"
import Typography from "@mui/material/Typography"
import type { ReactNode } from "react"
import { MONO_FONT } from "../../theme"
import { sectionOf, sectionShown, type SettingId } from "./settingsCatalog"
import type { GitConfigStatus, GitScope } from "./useGitConfig"

// A section of the page (v0.18.0; v0.21.6 lean): the title and, for the
// Git sections, the scope switch and the file it writes; a status slot for
// their "Saved" / "Saving…" / error. Hidden when the search leaves none of
// its rows.

type Props = {
  id: string
  visible: Set<SettingId> | null
  /** Git sections only: the scope in force and the switch that changes it. */
  scope?: GitScope
  onScope?: (scope: GitScope) => void
  /** Test ids of the scope switch: the group, then the local and global buttons. */
  scopeTestIds?: [string, string, string]
  /** Git sections only: the config file the scope writes. */
  target?: string
  status?: GitConfigStatus
  children: ReactNode
}

export function SettingsSection({ id, visible, scope, onScope, scopeTestIds, target, status, children }: Props) {
  if (!sectionShown(visible, id)) return null
  const meta = sectionOf(id)
  const [groupId, localId, globalId] = scopeTestIds ?? [
    `settings-${id}-scope`,
    `settings-${id}-scope-local`,
    `settings-${id}-scope-global`,
  ]
  return (
    <Box component="section" id={`settings-${id}`} data-testid={`settings-section-${id}`} sx={{ pt: 3 }}>
      <Box sx={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 1.25, mb: 1, minHeight: 30 }}>
        <Typography component="h3" sx={{ fontSize: 15, fontWeight: 600, m: 0 }}>
          {meta.title}
        </Typography>
        {meta.scope === "git" && scope && onScope ? (
          <ToggleButtonGroup
            size="small"
            exclusive
            value={scope}
            onChange={(_, v: GitScope | null) => v && onScope(v)}
            data-testid={groupId}
            sx={{ "& .MuiToggleButton-root": { py: 0.25, px: 1.25, fontSize: 12.5, lineHeight: 1.5 } }}
          >
            <ToggleButton value="local" data-testid={localId}>
              Local
            </ToggleButton>
            <ToggleButton value="global" data-testid={globalId}>
              Global
            </ToggleButton>
          </ToggleButtonGroup>
        ) : null}
        {target && (
          <Typography
            component="code"
            data-testid={`settings-target-${id}`}
            sx={{ fontFamily: MONO_FONT, fontSize: 11.5, color: "text.secondary" }}
          >
            {target}
          </Typography>
        )}
        <Box sx={{ flex: 1 }} />
        {status !== undefined && <SectionStatus id={id} status={status} />}
      </Box>
      {children}
    </Box>
  )
}

function SectionStatus({ id, status }: { id: string; status: GitConfigStatus }) {
  const kind = typeof status === "string" ? status : "error"
  const text = status === "idle" ? "" : status === "saving" ? "Saving…" : status === "saved" ? "Saved" : status.error
  return (
    <Typography
      data-testid={`settings-status-${id}`}
      data-status={kind}
      sx={{
        fontSize: 12,
        color: kind === "error" ? "error.main" : kind === "saved" ? "var(--pg-status-ok)" : "text.secondary",
        maxWidth: "50ch",
        textAlign: "right",
      }}
    >
      {text}
    </Typography>
  )
}
