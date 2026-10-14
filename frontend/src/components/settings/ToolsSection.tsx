import Box from "@mui/material/Box"
import Button from "@mui/material/Button"
import Typography from "@mui/material/Typography"
import { useEffect, useState } from "react"
import { describeThrown, useEngine, type ToolInfo, type VsCodeInfo } from "../../engine"
import { MONO_FONT } from "../../theme"
import { SettingSelect, SettingText } from "./controls"
import { SettingRow } from "./SettingRow"
import { SettingsSection } from "./SettingsSection"
import { isShown, type SettingId } from "./settingsCatalog"
import { scopeTarget, useGitConfig, type GitScope } from "./useGitConfig"

// Diff tool, merge tool and editor (v0.15.0; v0.18.0 applied as edited).
// Git drives the tools it knows by name, so choosing one writes
// `diff.tool` / `merge.tool` and, when the binary is somewhere git would
// not look, its path. "Custom command" leaves the name to the user, which
// is what a tool git has never heard of needs — picking it shows the name
// field and writes nothing until a name is committed there.

const CUSTOM = "__custom__"

type Props = {
  visible: Set<SettingId> | null
  scope: GitScope
  onScope: (scope: GitScope) => void
}

type ToolRowProps = {
  id: SettingId
  hidden: boolean
  kind: "diff" | "merge"
  tools: ToolInfo[]
  value: string
  disabled: boolean
  onPick: (name: string) => void
}

function ToolRow({ id, hidden, kind, tools, value, disabled, onPick }: ToolRowProps) {
  const [custom, setCustom] = useState(false)
  const options = tools.filter((t) => t.kinds.includes(kind))
  const known = options.some((t) => t.name === value)
  // A tool this machine does not have can still be configured (a shared
  // config, a laptop where it is not installed yet), so an unknown name
  // shows as the custom choice rather than disappearing.
  const showCommand = custom || (value !== "" && !known)
  const label = kind === "diff" ? "Diff tool" : "Merge tool"
  return (
    <SettingRow id={id} hidden={hidden} changed={value !== ""} resetLabel="Unset" onReset={() => onPick("")}>
      <SettingSelect
        value={known ? value : showCommand ? CUSTOM : ""}
        disabled={disabled}
        onChange={(v) => {
          setCustom(v === CUSTOM)
          if (v !== CUSTOM) onPick(v)
        }}
        label={label}
        testid={`settings-${kind}tool`}
      >
        <option value="">Unset</option>
        {options.map((t) => (
          <option key={t.name} value={t.name} disabled={!t.found}>
            {t.label}
            {t.found ? "" : " (not found)"}
          </option>
        ))}
        <option value={CUSTOM}>Custom command…</option>
      </SettingSelect>
      {showCommand && (
        <SettingText
          value={known ? "" : value}
          disabled={disabled}
          onCommit={(v) => {
            setCustom(false)
            onPick(v)
          }}
          label={`${label} name`}
          placeholder="e.g. meld"
          testid={`settings-${kind}tool-command`}
          mono
        />
      )}
    </SettingRow>
  )
}

export function ToolsSection({ visible, scope, onScope }: Props) {
  const engine = useEngine()
  const { cfg, patch, status, reload } = useGitConfig(engine, scope)
  const [tools, setTools] = useState<ToolInfo[]>([])
  const [vs, setVs] = useState<VsCodeInfo | null>(null)
  const [vsError, setVsError] = useState<string | null>(null)
  useEffect(() => {
    engine
      .tools()
      .then(setTools)
      .catch(() => setTools([]))
    engine
      .vsCode()
      .then(setVs)
      .catch(() => setVs({ found: false, path: null, applied: false }))
  }, [engine])
  const disabled = !cfg
  const editor = cfg?.editor ?? ""
  const applyVsCode = () => {
    setVsError(null)
    engine
      .applyVsCode()
      .then((info) => {
        setVs(info)
        reload()
      })
      .catch((e: unknown) => setVsError(describeThrown(e)))
  }
  return (
    <SettingsSection
      id="tools"
      visible={visible}
      scope={scope}
      onScope={onScope}
      target={scopeTarget(scope)}
      status={status}
    >
      <ToolRow
        id="tools.diffTool"
        hidden={!isShown(visible, "tools.diffTool")}
        kind="diff"
        tools={tools}
        value={cfg?.diffTool ?? ""}
        disabled={disabled}
        onPick={(name) => patch({ diffTool: name })}
      />
      <ToolRow
        id="tools.mergeTool"
        hidden={!isShown(visible, "tools.mergeTool")}
        kind="merge"
        tools={tools}
        value={cfg?.mergeTool ?? ""}
        disabled={disabled}
        onPick={(name) => patch({ mergeTool: name })}
      />
      <SettingRow
        id="tools.editor"
        hidden={!isShown(visible, "tools.editor")}
        changed={editor !== ""}
        resetLabel="Unset"
        onReset={() => patch({ editor: "" })}
      >
        <SettingText
          value={editor}
          disabled={disabled}
          onCommit={(v) => patch({ editor: v })}
          label="Editor"
          placeholder="e.g. code --wait"
          testid="settings-editor"
          mono
        />
      </SettingRow>
      <SettingRow id="tools.vsCode" hidden={!isShown(visible, "tools.vsCode")}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.25, flexWrap: "wrap" }}>
          <Button variant="outlined" size="small" disabled={!vs?.found} onClick={applyVsCode}>
            Use VS Code
          </Button>
          <Typography
            component="code"
            data-testid="settings-vscode-path"
            sx={{ fontFamily: MONO_FONT, fontSize: 11.5, color: "text.secondary" }}
          >
            {vs === null ? "…" : vs.found ? vs.path : "not found"}
          </Typography>
        </Box>
        {vsError && (
          <Typography variant="caption" color="error">
            {vsError}
          </Typography>
        )}
      </SettingRow>
    </SettingsSection>
  )
}
