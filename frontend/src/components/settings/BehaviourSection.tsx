import Box from "@mui/material/Box"
import { AUTO_FETCH_CHOICES, DEFAULT_BEHAVIOUR, setBehaviour, useBehaviour, type MergeFf } from "../../theme/behaviour"
import { CONFIRM_SWITCHES, REBASE_SWITCHES, behaviourChanged, behaviourDefaults, intervalLabel } from "./appRows"
import { SettingCheck, SettingSelect } from "./controls"
import { SettingRow } from "./SettingRow"
import { SettingsSection } from "./SettingsSection"
import { isShown, type SettingId } from "./settingsCatalog"

// Behaviour and confirmations (v0.15.0, owner: an enhanced settings menu;
// v0.18.0: applied as they are made). The five confirmations are one row
// and the two rebase defaults another: a row is "changed" when any of its
// keys differs from the default, and its Reset puts them all back.

const CONFIRM_KEYS = CONFIRM_SWITCHES.map((c) => c.key)
const REBASE_KEYS = REBASE_SWITCHES.map((c) => c.key)

export function BehaviourSection({ visible }: { visible: Set<SettingId> | null }) {
  const value = useBehaviour()
  return (
    <SettingsSection id="behaviour" visible={visible}>
      <SettingRow
        id="behaviour.confirmations"
        hidden={!isShown(visible, "behaviour.confirmations")}
        changed={behaviourChanged(value, CONFIRM_KEYS)}
        onReset={() => setBehaviour(behaviourDefaults(CONFIRM_KEYS))}
      >
        <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
          {CONFIRM_SWITCHES.map((c) => (
            <SettingCheck
              key={c.key}
              label={c.label}
              testid={c.testid}
              checked={Boolean(value[c.key])}
              onChange={(next) => setBehaviour({ [c.key]: next })}
            />
          ))}
        </Box>
      </SettingRow>
      <SettingRow
        id="behaviour.autoFetch"
        hidden={!isShown(visible, "behaviour.autoFetch")}
        changed={value.autoFetchMinutes !== DEFAULT_BEHAVIOUR.autoFetchMinutes}
        onReset={() => setBehaviour({ autoFetchMinutes: DEFAULT_BEHAVIOUR.autoFetchMinutes })}
      >
        <SettingSelect
          value={String(value.autoFetchMinutes)}
          onChange={(v) => setBehaviour({ autoFetchMinutes: Number(v) })}
          label="Fetch in the background"
          testid="settings-autofetch"
        >
          {AUTO_FETCH_CHOICES.map((m) => (
            <option key={m} value={m}>
              {intervalLabel(m)}
            </option>
          ))}
        </SettingSelect>
      </SettingRow>
      <SettingRow
        id="behaviour.mergeFf"
        hidden={!isShown(visible, "behaviour.mergeFf")}
        changed={value.defaultMergeFf !== DEFAULT_BEHAVIOUR.defaultMergeFf}
        onReset={() => setBehaviour({ defaultMergeFf: DEFAULT_BEHAVIOUR.defaultMergeFf })}
      >
        <SettingSelect
          value={value.defaultMergeFf}
          onChange={(v) => setBehaviour({ defaultMergeFf: v as MergeFf })}
          label="Merges by default"
          testid="settings-default-merge-ff"
        >
          <option value="allow">Fast-forward when possible</option>
          <option value="no">Always create a merge commit</option>
          <option value="only">Fast-forward only, else refuse</option>
        </SettingSelect>
      </SettingRow>
      <SettingRow
        id="behaviour.rebaseDefaults"
        hidden={!isShown(visible, "behaviour.rebaseDefaults")}
        changed={behaviourChanged(value, REBASE_KEYS)}
        onReset={() => setBehaviour(behaviourDefaults(REBASE_KEYS))}
      >
        <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
          {REBASE_SWITCHES.map((c) => (
            <SettingCheck
              key={c.key}
              label={c.label}
              testid={c.testid}
              checked={Boolean(value[c.key])}
              onChange={(next) => setBehaviour({ [c.key]: next })}
            />
          ))}
        </Box>
      </SettingRow>
    </SettingsSection>
  )
}
