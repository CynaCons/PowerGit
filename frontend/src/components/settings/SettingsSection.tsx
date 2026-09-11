import Box from "@mui/material/Box"
import ToggleButton from "@mui/material/ToggleButton"
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup"
import Typography from "@mui/material/Typography"
import type { ReactNode } from "react"
import { sectionOf, sectionShown, type SettingId } from "./settingsCatalog"
import type { GitConfigStatus, GitScope } from "./useGitConfig"

// A section of the page (v0.18.0): the title, then either the scope switch
// (Git identity and Tools write Git config, this repository or all of
// them) or the pill that says the rows are this app's own; a hint line;
// and a status slot for the Git sections' "Saved" / "Saving…" / error.
// Hidden when the search leaves none of its rows.

type Props = {
  id: string
  visible: Set<SettingId> | null
  /** Git sections only: the scope in force and the switch that changes it. */
  scope?: GitScope
  onScope?: (scope: GitScope) => void
  /** Test ids of the scope switch: the group, then the local and global buttons. */
  scopeTestIds?: [string, string, string]
  hint?: string
  status?: GitConfigStatus
  children: ReactNode
}

export function SettingsSection({ id, visible, scope, onScope, scopeTestIds, hint, status, children }: Props) {
  if (!sectionShown(visible, id)) return null
  const meta = sectionOf(id)
  const [groupId, localId, globalId] = scopeTestIds ?? [
    `settings-${id}-scope`,
    `settings-${id}-scope-local`,
    `settings-${id}-scope-global`,
  ]
  return (
    <Box component="section" id={`settings-${id}`} data-testid={`settings-section-${id}`} sx={{ pt: 2.75 }}>
      <Box sx={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 1.25, mb: 0.5, minHeight: 30 }}>
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
              This repository
            </ToggleButton>
            <ToggleButton value="global" data-testid={globalId}>
              All repositories
            </ToggleButton>
          </ToggleButtonGroup>
        ) : (
          <Typography
            component="span"
            sx={{
              fontSize: 11,
              px: 0.875,
              py: 0.125,
              borderRadius: 9,
              color: "text.secondary",
              bgcolor: "background.default",
              border: 1,
              borderColor: "var(--pg-border-soft)",
            }}
          >
            This app, every repository
          </Typography>
        )}
        <Box sx={{ flex: 1 }} />
        {status !== undefined && <SectionStatus id={id} status={status} />}
      </Box>
      {hint && <Typography sx={{ color: "text.secondary", fontSize: 12, mb: 1 }}>{hint}</Typography>}
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
