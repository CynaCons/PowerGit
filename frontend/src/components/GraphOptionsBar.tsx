import PersonOutlinedIcon from "@mui/icons-material/PersonOutlined"
import RouteOutlinedIcon from "@mui/icons-material/RouteOutlined"
import Box from "@mui/material/Box"
import Divider from "@mui/material/Divider"
import FormControl from "@mui/material/FormControl"
import MenuItem from "@mui/material/MenuItem"
import Select from "@mui/material/Select"
import ToggleButton from "@mui/material/ToggleButton"
import Tooltip from "@mui/material/Tooltip"
import Typography from "@mui/material/Typography"
import { useMemo } from "react"
import type { HighlightScope } from "../graph/ancestry"
import { countAuthor } from "../graph/authorIdentity"
import { setGraphOptions, useGraphOptions } from "../graph/graphOptions"
import type { GraphRow } from "../graph/types"
import { useFloatingBar } from "./floatingBar"

type Props = {
  /** The loaded rows, for the Author group's "n of N" (v0.18.1). */
  rows: GraphRow[]
  /** The selected row's author; null with nothing (or a pending row) selected. */
  selectedAuthor: string | null
}

const TOGGLE_SX = { py: 0.25, px: 1, fontSize: 12, textTransform: "none" } as const

// The graph's floating options pill (v0.14.0), the same device as the diff
// view's DiffOptionsBar. Owner: "a bar with different settings" for how
// the checked-out branch's history is highlighted. Stays expanded while a
// menu is open (floatingBar.ts, v0.14.1). v0.18.1 adds the Author group
// after a divider: who the selected commit is by, how many of the loaded
// rows are theirs, and Mark for the ring and the bold on those rows.
export function GraphOptionsBar({ rows, selectedAuthor }: Props) {
  const bar = useFloatingBar()
  const { expanded } = bar
  const options = useGraphOptions()
  const count = useMemo(() => countAuthor(rows, selectedAuthor), [rows, selectedAuthor])

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
          sx={TOGGLE_SX}
        >
          Ring
        </ToggleButton>
        <ToggleButton
          size="small"
          value="dim"
          selected={options.dim}
          onChange={() => setGraphOptions({ dim: !options.dim })}
          data-testid="graph-dim-toggle"
          sx={TOGGLE_SX}
        >
          Dim others
        </ToggleButton>
        <Divider orientation="vertical" flexItem sx={{ height: 18, alignSelf: "center" }} />
        <PersonOutlinedIcon fontSize="small" sx={{ color: "text.secondary" }} />
        {selectedAuthor ? (
          <>
            <Typography variant="caption" sx={{ fontWeight: 600 }} data-testid="graph-author-name">
              {selectedAuthor}
            </Typography>
            <Typography variant="caption" color="text.secondary" data-testid="graph-author-count">
              {count.n} of {count.total}
            </Typography>
          </>
        ) : (
          <Typography variant="caption" color="text.secondary" data-testid="graph-author-name">
            Author
          </Typography>
        )}
        <ToggleButton
          size="small"
          value="author-mark"
          selected={options.authorMark}
          onChange={() => setGraphOptions({ authorMark: !options.authorMark })}
          data-testid="graph-author-mark"
          sx={TOGGLE_SX}
        >
          Mark
        </ToggleButton>
      </Box>
    </Box>
  )
}
