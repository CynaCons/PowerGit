import RouteOutlinedIcon from "@mui/icons-material/RouteOutlined"
import Box from "@mui/material/Box"
import FormControl from "@mui/material/FormControl"
import MenuItem from "@mui/material/MenuItem"
import Select from "@mui/material/Select"
import ToggleButton from "@mui/material/ToggleButton"
import Tooltip from "@mui/material/Tooltip"
import Typography from "@mui/material/Typography"
import type { HighlightScope } from "../graph/ancestry"
import { setGraphOptions, useGraphOptions } from "../graph/graphOptions"
import { useFloatingBar } from "./floatingBar"

// The graph's floating options pill (v0.14.0), the same device as the diff
// view's DiffOptionsBar. Owner: "a bar with different settings" for how
// the checked-out branch's history is highlighted. Stays expanded while a
// menu is open (floatingBar.ts, v0.14.1).
export function GraphOptionsBar() {
  const bar = useFloatingBar()
  const { expanded } = bar
  const options = useGraphOptions()

  return (
    <Box
      ref={bar.rootRef}
      data-testid="graph-options-bar"
      data-expanded={expanded ? "true" : "false"}
      {...bar.rootProps}
      sx={{
        position: "absolute",
        left: 10,
        bottom: 10,
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
      <Tooltip title={bar.pinned ? "Unpin" : "Branch history highlight"}>
        <RouteOutlinedIcon
          fontSize="small"
          onClick={bar.togglePinned}
          sx={{ color: bar.pinned ? "primary.main" : "text.secondary", cursor: "pointer" }}
        />
      </Tooltip>
      <Box sx={{ display: expanded ? "flex" : "none", alignItems: "center", gap: 1 }}>
        <Typography variant="caption" color="text.secondary">
          Checked-out branch
        </Typography>
        <FormControl size="small" sx={{ minWidth: 150 }}>
          <Select
            data-testid="graph-scope-select"
            value={options.scope}
            onOpen={bar.menuProps.onOpen}
            onClose={bar.menuProps.onClose}
            onChange={(e) => setGraphOptions({ scope: e.target.value as HighlightScope })}
            inputProps={{ "aria-label": "Highlight scope" }}
            sx={{ fontSize: 12, "& .MuiSelect-select": { py: 0.5 } }}
          >
            <MenuItem value="all">All ancestors</MenuItem>
            <MenuItem value="first-parent">First parent only</MenuItem>
          </Select>
        </FormControl>
        <ToggleButton
          size="small"
          value="ring"
          selected={options.ring}
          onChange={() => setGraphOptions({ ring: !options.ring })}
          data-testid="graph-ring-toggle"
          sx={{ py: 0.25, px: 1, fontSize: 12, textTransform: "none" }}
        >
          Ring
        </ToggleButton>
        <ToggleButton
          size="small"
          value="dim"
          selected={options.dim}
          onChange={() => setGraphOptions({ dim: !options.dim })}
          data-testid="graph-dim-toggle"
          sx={{ py: 0.25, px: 1, fontSize: 12, textTransform: "none" }}
        >
          Dim others
        </ToggleButton>
      </Box>
    </Box>
  )
}
