import { useEngine, type GitConfig } from "../../engine"
import { SettingSelect, SettingText } from "./controls"
import { SettingRow } from "./SettingRow"
import { SettingsSection } from "./SettingsSection"
import { isShown, type SettingId } from "./settingsCatalog"
import { useGitConfig, type GitScope } from "./useGitConfig"

// Git identity (v0.15.0 scopes; v0.18.0 applied as edited). The rows show
// what this scope's file sets — a repository with no user.name of its own
// shows an empty field, and the hint says where the name in use comes
// from. A non-empty value is "changed", and Unset removes the key here.

type Props = {
  visible: Set<SettingId> | null
  scope: GitScope
  onScope: (scope: GitScope) => void
}

// Says where the values on screen actually come from, so "This
// repository" showing a name set globally is not mistaken for a local one.
function scopeHint(which: GitScope, config: GitConfig | null): string {
  if (which === "global") return "Saved to your global Git config, for every repository."
  const inherited = config?.userNameOrigin && config.userNameOrigin !== "local"
  return inherited
    ? `Saved to this repository only. The name in use comes from your ${config?.userNameOrigin} config until you set one here.`
    : "Saved to this repository only."
}

export function IdentitySection({ visible, scope, onScope }: Props) {
  const engine = useEngine()
  const { cfg, patch, status } = useGitConfig(engine, scope)
  const disabled = !cfg
  const name = cfg?.userName ?? ""
  const email = cfg?.userEmail ?? ""
  const crlf = cfg?.autoCrlf ?? ""
  return (
    <SettingsSection
      id="git"
      visible={visible}
      scope={scope}
      onScope={onScope}
      scopeTestIds={["settings-identity-scope", "settings-scope-local", "settings-scope-global"]}
      hint={scopeHint(scope, cfg)}
      status={status}
    >
      <SettingRow
        id="git.userName"
        hidden={!isShown(visible, "git.userName")}
        changed={name !== ""}
        resetLabel="Unset"
        onReset={() => patch({ userName: "" })}
      >
        <SettingText
          value={name}
          disabled={disabled}
          onCommit={(v) => patch({ userName: v })}
          label="User name"
          testid="settings-user-name"
        />
      </SettingRow>
      <SettingRow
        id="git.userEmail"
        hidden={!isShown(visible, "git.userEmail")}
        changed={email !== ""}
        resetLabel="Unset"
        onReset={() => patch({ userEmail: "" })}
      >
        <SettingText
          value={email}
          disabled={disabled}
          onCommit={(v) => patch({ userEmail: v })}
          label="Email"
          testid="settings-user-email"
        />
      </SettingRow>
      <SettingRow
        id="git.autoCrlf"
        hidden={!isShown(visible, "git.autoCrlf")}
        changed={crlf !== ""}
        resetLabel="Unset"
        onReset={() => patch({ autoCrlf: "" })}
      >
        <SettingSelect
          value={crlf}
          disabled={disabled}
          onChange={(v) => patch({ autoCrlf: v })}
          label="Line endings"
          testid="settings-autocrlf"
        >
          <option value="">Git default (core.autocrlf unset)</option>
          <option value="true">CRLF in the working tree, LF in commits (true)</option>
          <option value="input">Convert to LF on commit only (input)</option>
          <option value="false">Never convert (false)</option>
        </SettingSelect>
      </SettingRow>
    </SettingsSection>
  )
}
