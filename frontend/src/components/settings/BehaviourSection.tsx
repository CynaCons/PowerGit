import Checkbox from "@mui/material/Checkbox"
import FormControlLabel from "@mui/material/FormControlLabel"
import TextField from "@mui/material/TextField"
import Typography from "@mui/material/Typography"
import { AUTO_FETCH_CHOICES, type Behaviour, type MergeFf } from "../../theme/behaviour"

// Behaviour and confirmations (v0.15.0, owner: an enhanced settings menu).
// A draft is edited here and written by the dialog's Save, like the
// appearance fields; nothing applies until then. The selects are native for
// the same reason the merge dialog's are: no portal between a test, or a
// keyboard, and the control.

type Props = {
  value: Behaviour
  onChange: (patch: Partial<Behaviour>) => void
}

const CONFIRMS: { key: keyof Behaviour; label: string; testid: string }[] = [
  { key: "confirmForcePush", label: "Force-pushing a branch", testid: "settings-confirm-force-push" },
  { key: "confirmDeleteBranch", label: "Deleting a branch or tag", testid: "settings-confirm-delete-branch" },
  { key: "confirmResetHard", label: "Resetting hard (discards changes)", testid: "settings-confirm-reset-hard" },
  {
    key: "confirmCheckoutDirty",
    label: "Checking out with uncommitted changes",
    testid: "settings-confirm-checkout-dirty",
  },
  { key: "confirmAbortOperation", label: "Aborting a merge or rebase", testid: "settings-confirm-abort-operation" },
]

function intervalLabel(minutes: number): string {
  if (minutes === 0) return "Never"
  return minutes === 1 ? "Every minute" : `Every ${minutes} minutes`
}

function Switch({
  label,
  checked,
  testid,
  onChange,
}: {
  label: string
  checked: boolean
  testid: string
  onChange: (next: boolean) => void
}) {
  return (
    <FormControlLabel
      sx={{ ml: 0.5, my: -0.5 }}
      control={
        <Checkbox size="small" checked={checked} onChange={(e) => onChange(e.target.checked)} data-testid={testid} />
      }
      label={<Typography variant="body2">{label}</Typography>}
    />
  )
}

export function BehaviourSection({ value, onChange }: Props) {
  return (
    <>
      <Typography variant="body2" color="text.secondary">
        Ask before:
      </Typography>
      {CONFIRMS.map((c) => (
        <Switch
          key={c.key}
          label={c.label}
          testid={c.testid}
          checked={Boolean(value[c.key])}
          onChange={(next) => onChange({ [c.key]: next } as Partial<Behaviour>)}
        />
      ))}

      <TextField
        select
        size="small"
        margin="dense"
        label="Fetch in the background"
        value={String(value.autoFetchMinutes)}
        onChange={(e) => onChange({ autoFetchMinutes: Number(e.target.value) })}
        slotProps={{
          select: { native: true },
          htmlInput: { "data-testid": "settings-autofetch", "aria-label": "Fetch in the background" },
          inputLabel: { shrink: true },
        }}
      >
        {AUTO_FETCH_CHOICES.map((m) => (
          <option key={m} value={m}>
            {intervalLabel(m)}
          </option>
        ))}
      </TextField>

      <TextField
        select
        size="small"
        margin="dense"
        label="Merges by default"
        value={value.defaultMergeFf}
        onChange={(e) => onChange({ defaultMergeFf: e.target.value as MergeFf })}
        slotProps={{
          select: { native: true },
          htmlInput: { "data-testid": "settings-default-merge-ff", "aria-label": "Merges by default" },
          inputLabel: { shrink: true },
        }}
      >
        <option value="allow">Fast-forward when possible</option>
        <option value="no">Always create a merge commit</option>
        <option value="only">Fast-forward only, else refuse</option>
      </TextField>

      <Switch
        label="Stash and restore local changes around a rebase"
        testid="settings-default-rebase-autostash"
        checked={value.defaultRebaseAutostash}
        onChange={(next) => onChange({ defaultRebaseAutostash: next })}
      />
      <Switch
        label="Fold fixup! and squash! commits during an interactive rebase"
        testid="settings-default-rebase-autosquash"
        checked={value.defaultRebaseAutosquash}
        onChange={(next) => onChange({ defaultRebaseAutosquash: next })}
      />
    </>
  )
}
