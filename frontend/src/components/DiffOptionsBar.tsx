import TuneIcon from "@mui/icons-material/Tune"
import Box from "@mui/material/Box"
import Checkbox from "@mui/material/Checkbox"
import FormControl from "@mui/material/FormControl"
import MenuItem from "@mui/material/MenuItem"
import Select from "@mui/material/Select"
import Tooltip from "@mui/material/Tooltip"
import Typography from "@mui/material/Typography"
import type { DiffOptions } from "../engine"
import { useFloatingBar } from "./floatingBar"

type Props = {
  options: DiffOptions
  onChange: (options: DiffOptions) => void
}

const CONTEXT_CHOICES = [0, 3, 6, 10, 25]

// Git Extensions FileViewer diff options, as a floating bottom-center bar:
// a compact translucent pill at rest, an opaque toolbar while the pointer
// is inside or one of its menus is open (see floatingBar.ts).
export function DiffOptionsBar({ options, onChange }: Props) {
  const bar = useFloatingBar()
  const { expanded } = bar

  return (
    <Box
      ref={bar.rootRef}
      data-testid="diff-options-bar"
      data-expanded={expanded ? "true" : "false"}
      {...bar.rootProps}
      sx={{
        position: "absolute",
        left: "50%",
        bottom: 10,
        transform: "translateX(-50%)",
        zIndex: 5,
        bgcolor: expanded ? "background.paper" : "transparent",
        border: expanded ? 1 : 0,
        borderColor: "divider",
        borderRadius: 2,
        boxShadow: expanded ? 3 : 0,
        px: expanded ? 1.5 : 1,
        py: expanded ? 0.75 : 0.25,
        display: "flex",
        alignItems: "center",
        gap: 1,
        opacity: expanded ? 1 : 0.45,
        transition: "all 120ms ease",
        cursor: expanded ? "default" : "pointer",
        "&:hover": { opacity: 1 },
      }}
    >
      <Tooltip title={bar.pinned ? "Unpin diff options" : "Diff options"}>
        <TuneIcon
          fontSize="small"
          onClick={bar.togglePinned}
          sx={{ color: bar.pinned ? "primary.main" : "text.secondary", cursor: "pointer" }}
        />
      </Tooltip>
      {/* Kept mounted: an open Select must never be torn down by the bar. */}
      <Box sx={{ display: expanded ? "flex" : "none", alignItems: "center", gap: 1 }}>
        <Typography variant="caption" color="text.secondary">
          Context
        </Typography>
        <FormControl size="small" sx={{ minWidth: 86 }}>
          <Select
            data-testid="diff-context-select"
            value={options.full ? "full" : String(options.context)}
            onOpen={bar.menuProps.onOpen}
            onClose={bar.menuProps.onClose}
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
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.25 }}>
          <Checkbox
            size="small"
            checked={options.ws}
            onChange={(e) => onChange({ ...options, ws: e.target.checked })}
            sx={{ py: 0.25 }}
          />
          <Typography variant="caption">Ignore whitespace</Typography>
        </Box>
      </Box>
    </Box>
  )
}
