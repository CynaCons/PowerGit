import TuneIcon from "@mui/icons-material/Tune"
import Box from "@mui/material/Box"
import Checkbox from "@mui/material/Checkbox"
import FormControl from "@mui/material/FormControl"
import MenuItem from "@mui/material/MenuItem"
import Select from "@mui/material/Select"
import Tooltip from "@mui/material/Tooltip"
import Typography from "@mui/material/Typography"
import { useState } from "react"
import type { DiffOptions } from "../engine"

type Props = {
  options: DiffOptions
  onChange: (options: DiffOptions) => void
}

const CONTEXT_CHOICES = [0, 3, 6, 10, 25]

// Git Extensions FileViewer diff options, as a floating bottom-center bar:
// a compact translucent pill at rest, an opaque toolbar on hover.
export function DiffOptionsBar({ options, onChange }: Props) {
  const [hover, setHover] = useState(false)

  return (
    <Box
      data-testid="diff-options-bar"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      sx={{
        position: "absolute",
        left: "50%",
        bottom: 10,
        transform: "translateX(-50%)",
        zIndex: 5,
        bgcolor: hover ? "background.paper" : "transparent",
        border: hover ? 1 : 0,
        borderColor: "divider",
        borderRadius: 2,
        boxShadow: hover ? 3 : 0,
        px: hover ? 1.5 : 1,
        py: hover ? 0.75 : 0.25,
        display: "flex",
        alignItems: "center",
        gap: 1,
        opacity: hover ? 1 : 0.45,
        transition: "all 120ms ease",
        cursor: hover ? "default" : "pointer",
        "&:hover": { opacity: 1 },
      }}
    >
      {!hover ? (
        <Tooltip title="Diff options">
          <TuneIcon fontSize="small" sx={{ color: "text.secondary" }} />
        </Tooltip>
      ) : (
        <>
          <Typography variant="caption" color="text.secondary">
            Context
          </Typography>
          <FormControl size="small" sx={{ minWidth: 86 }}>
            <Select
              data-testid="diff-context-select"
              value={options.full ? "full" : String(options.context)}
              onChange={(e) => {
                const v = e.target.value
                onChange(v === "full" ? { ...options, full: true } : { ...options, full: false, context: Number(v) })
              }}
              sx={{ "& .MuiSelect-select": { py: 0.25, fontSize: 12 } }}
            >
              {CONTEXT_CHOICES.map((c) => (
                <MenuItem key={c} value={String(c)}>
                  {c} lines
                </MenuItem>
              ))}
              <MenuItem value="full">Full file</MenuItem>
            </Select>
          </FormControl>
          <FormControlLabelLike
            label="Ignore whitespace"
            checked={options.ws}
            onChange={(v) => onChange({ ...options, ws: v })}
          />
        </>
      )}
    </Box>
  )
}

function FormControlLabelLike({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 0.25 }}>
      <Checkbox size="small" checked={checked} onChange={(e) => onChange(e.target.checked)} sx={{ py: 0.25 }} />
      <Typography variant="caption">{label}</Typography>
    </Box>
  )
}
