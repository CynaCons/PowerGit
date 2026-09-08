import TextField from "@mui/material/TextField"
import Typography from "@mui/material/Typography"
import type { GitConfig, ToolInfo } from "../../engine"

// Diff tool, merge tool and editor (v0.15.0). Git drives the tools it knows
// by name, so choosing one writes `diff.tool` / `merge.tool` and, when the
// binary is somewhere git would not look, its path. "Custom command" leaves
// the name to the user, which is what a tool git has never heard of needs.
// Native selects, like the merge dialog's: no portal in the way.

const CUSTOM = "__custom__"

type Props = {
  tools: ToolInfo[]
  cfg: GitConfig | null
  onChange: (patch: Partial<GitConfig>) => void
}

function ToolSelect({
  label,
  testid,
  kind,
  tools,
  value,
  disabled,
  onPick,
}: {
  label: string
  testid: string
  kind: string
  tools: ToolInfo[]
  value: string
  disabled: boolean
  onPick: (name: string) => void
}) {
  const options = tools.filter((t) => t.kinds.includes(kind))
  const known = options.some((t) => t.name === value)
  // A tool this machine does not have can still be configured (a shared
  // config, a laptop where it is not installed yet), so an unknown name
  // shows as the custom choice rather than disappearing.
  const custom = value !== "" && !known
  return (
    <TextField
      select
      size="small"
      margin="dense"
      label={label}
      disabled={disabled}
      value={known ? value : custom ? CUSTOM : ""}
      onChange={(e) => onPick(e.target.value === CUSTOM ? value || "custom" : e.target.value)}
      slotProps={{
        select: { native: true },
        htmlInput: { "data-testid": testid, "aria-label": label },
        inputLabel: { shrink: true },
      }}
    >
      <option value="">Not set</option>
      {options.map((t) => (
        <option key={t.name} value={t.name} disabled={!t.found}>
          {t.label}
          {t.found ? "" : " — not found"}
        </option>
      ))}
      <option value={CUSTOM}>Custom command…</option>
    </TextField>
  )
}

export function ToolsSection({ tools, cfg, onChange }: Props) {
  const disabled = !cfg
  const diff = cfg?.diffTool ?? ""
  const merge = cfg?.mergeTool ?? ""
  const editor = cfg?.editor ?? ""
  const customDiff = diff !== "" && !tools.some((t) => t.name === diff)
  const customMerge = merge !== "" && !tools.some((t) => t.name === merge)

  return (
    <>
      <ToolSelect
        label="Diff tool"
        testid="settings-difftool"
        kind="diff"
        tools={tools}
        value={diff}
        disabled={disabled}
        onPick={(name) => onChange({ diffTool: name })}
      />
      {customDiff && (
        <TextField
          label="Diff tool name"
          margin="dense"
          size="small"
          value={diff}
          onChange={(e) => onChange({ diffTool: e.target.value })}
          slotProps={{ htmlInput: { "data-testid": "settings-difftool-command" } }}
        />
      )}
      <ToolSelect
        label="Merge tool"
        testid="settings-mergetool"
        kind="merge"
        tools={tools}
        value={merge}
        disabled={disabled}
        onPick={(name) => onChange({ mergeTool: name })}
      />
      {customMerge && (
        <TextField
          label="Merge tool name"
          margin="dense"
          size="small"
          value={merge}
          onChange={(e) => onChange({ mergeTool: e.target.value })}
          slotProps={{ htmlInput: { "data-testid": "settings-mergetool-command" } }}
        />
      )}
      <TextField
        label="Editor"
        margin="dense"
        size="small"
        placeholder="core.editor, e.g. code --wait"
        value={editor}
        disabled={disabled}
        onChange={(e) => onChange({ editor: e.target.value })}
        slotProps={{ htmlInput: { "data-testid": "settings-editor" }, inputLabel: { shrink: true } }}
      />
      <Typography variant="caption" color="text.secondary">
        The merge tool is what “Resolve conflicts” opens for a file.
      </Typography>
    </>
  )
}
