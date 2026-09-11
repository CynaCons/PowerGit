import Checkbox from "@mui/material/Checkbox"
import FormControlLabel from "@mui/material/FormControlLabel"
import TextField from "@mui/material/TextField"
import Typography from "@mui/material/Typography"
import { useState, type ReactNode } from "react"
import { MONO_FONT } from "../../theme"

// The three controls the settings rows share (v0.18.0). Native selects, as
// the merge dialog's: no portal between a test, or a keyboard, and the
// control. The row title is the label, so none of these floats one.

const FIELD_SX = { minWidth: 260, "& .MuiInputBase-input": { py: 0.75 } }

type SelectProps = {
  value: string
  onChange: (value: string) => void
  testid: string
  label: string
  disabled?: boolean
  children: ReactNode
}

export function SettingSelect({ value, onChange, testid, label, disabled, children }: SelectProps) {
  return (
    <TextField
      select
      size="small"
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      slotProps={{ select: { native: true }, htmlInput: { "aria-label": label, "data-testid": testid } }}
      sx={FIELD_SX}
    >
      {children}
    </TextField>
  )
}

type TextProps = {
  value: string
  /** Called on blur and on Enter, only when the text differs from `value`. */
  onCommit: (value: string) => void
  testid: string
  label: string
  placeholder?: string
  mono?: boolean
  disabled?: boolean
}

// A text field that writes on blur or Enter (a Git key is a git process,
// not a keystroke). The draft lives here until then; `null` means the
// field shows the value it was given, so an outside change (a scope flip,
// a reload after an error) is visible as soon as nothing is being typed.
export function SettingText({ value, onCommit, testid, label, placeholder, mono, disabled }: TextProps) {
  const [draft, setDraft] = useState<string | null>(null)
  const commit = () => {
    if (draft !== null && draft !== value) onCommit(draft)
    setDraft(null)
  }
  return (
    <TextField
      size="small"
      value={draft ?? value}
      placeholder={placeholder}
      disabled={disabled}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit()
      }}
      slotProps={{
        htmlInput: {
          "aria-label": label,
          "data-testid": testid,
          ...(mono && { style: { fontFamily: MONO_FONT, fontSize: 12.5 } }),
        },
      }}
      sx={{ ...FIELD_SX, minWidth: 320 }}
    />
  )
}

type CheckProps = { label: string; checked: boolean; testid: string; onChange: (next: boolean) => void }

export function SettingCheck({ label, checked, testid, onChange }: CheckProps) {
  return (
    <FormControlLabel
      sx={{ ml: -0.5, my: -0.5 }}
      control={
        <Checkbox size="small" checked={checked} onChange={(e) => onChange(e.target.checked)} data-testid={testid} />
      }
      label={<Typography variant="body2">{label}</Typography>}
    />
  )
}
