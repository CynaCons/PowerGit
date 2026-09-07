import RouteOutlinedIcon from "@mui/icons-material/RouteOutlined"
import Box from "@mui/material/Box"
import FormControl from "@mui/material/FormControl"
import MenuItem from "@mui/material/MenuItem"
import Select from "@mui/material/Select"
import ToggleButton from "@mui/material/ToggleButton"
import Tooltip from "@mui/material/Tooltip"
import Typography from "@mui/material/Typography"
import { useState } from "react"
import { setGraphOptions, useGraphOptions } from "../graph/graphOptions"
import type { HighlightScope } from "../graph/ancestry"

// The graph's floating options pill (v0.14.0), the same device as the diff
// view's DiffOptionsBar: a translucent icon at rest over the graph column,
// an opaque toolbar on hover. Owner: "a bar with different settings" for
// how the checked-out branch's history is highlighted.
export function GraphOptionsBar() {
  const [hover, setHover] = useState(false)
  const options = useGraphOptions()

  return (
    <Box
      data-testid="graph-options-bar"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      sx={{
        position: "absolute",
        left: 10,
        bottom: 10,
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
        <Tooltip title="Branch history highlight">
          <RouteOutlinedIcon fontSize="small" sx={{ color: "text.secondary" }} />
        </Tooltip>
      ) : (
        <>
          <Typography variant="caption" color="text.secondary">
            Checked-out branch
          </Typography>
          <FormControl size="small" sx={{ minWidth: 150 }}>
            <Select
              data-testid="graph-scope-select"
              value={options.scope}
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
        </>
      )}
    </Box>
  )
}
