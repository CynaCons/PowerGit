import Checkbox from "@mui/material/Checkbox"
import FormControlLabel from "@mui/material/FormControlLabel"

// One of the file history header's option toggles (v0.16.0): GE's
// FormFileHistory menu check items, drawn as small labelled checkboxes.
export function FileHistoryToggle({
  id,
  label,
  checked,
  disabled,
  onChange,
}: {
  id: string
  label: string
  checked: boolean
  disabled?: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <FormControlLabel
      sx={{ mr: 1, ml: 0, "& .MuiFormControlLabel-label": { fontSize: 12 } }}
      control={
        <Checkbox
          size="small"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
          sx={{ py: 0, px: 0.5 }}
          data-testid={`file-history-${id}`}
        />
      }
      label={label}
    />
  )
}
