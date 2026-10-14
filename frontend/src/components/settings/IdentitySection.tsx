import { useEngine } from "../../engine"
import { SettingSelect, SettingText } from "./controls"
import { SettingRow } from "./SettingRow"
import { SettingsSection } from "./SettingsSection"
import { isShown, type SettingId } from "./settingsCatalog"
import { scopeTarget, useGitConfig, type GitScope } from "./useGitConfig"

// Git identity (v0.15.0 scopes; v0.18.0 applied as edited). The rows show
// what this scope's file sets — a repository with no user.name of its own
// shows an empty field whose placeholder names the config the name in use
// comes from. A non-empty value is "changed", and Unset removes the key here.

type Props = {
  visible: Set<SettingId> | null
  scope: GitScope
  onScope: (scope: GitScope) => void
}

/** An empty local field names the config the value in use comes from. */
function inherited(origin: string | null | undefined): string | undefined {
  return origin && origin !== "local" ? `from ${origin} config` : undefined
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
      target={scopeTarget(scope)}
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
          placeholder={scope === "local" ? inherited(cfg?.userNameOrigin) : undefined}
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
          placeholder={scope === "local" ? inherited(cfg?.userEmailOrigin) : undefined}
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
          <option value="">Unset</option>
          <option value="true">true — CRLF in the working tree, LF in commits</option>
          <option value="input">input — LF on commit</option>
          <option value="false">false — no conversion</option>
        </SettingSelect>
      </SettingRow>
    </SettingsSection>
  )
}
