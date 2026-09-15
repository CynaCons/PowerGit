import ChevronLeftIcon from "@mui/icons-material/ChevronLeft"
import FilterAltOutlinedIcon from "@mui/icons-material/FilterAltOutlined"
import SearchIcon from "@mui/icons-material/Search"
import Box from "@mui/material/Box"
import IconButton from "@mui/material/IconButton"
import InputBase from "@mui/material/InputBase"
import Link from "@mui/material/Link"
import Tooltip from "@mui/material/Tooltip"
import Typography from "@mui/material/Typography"
import { alpha } from "@mui/material/styles"

// The top of the Repository panel: the title row, the search box and, in
// the graph filter mode (v0.18.5, prototype tab 4 A `renderLeft`), the
// strip that says what the graph shows with Show all and Exit.
export function RepoTreeHeader({
  filter,
  onFilter,
  onCollapse,
  mode,
  shown,
  total,
  onToggleMode,
  onShowAll,
}: {
  filter: string
  onFilter: (value: string) => void
  onCollapse?: () => void
  /** The graph filter mode; the funnel is tinted while on. */
  mode: boolean
  shown: number
  total: number
  onToggleMode: () => void
  onShowAll: () => void
}) {
  return (
    <>
      <Box sx={{ px: 1, py: 0.75, borderBottom: 1, borderColor: "divider", display: "flex", alignItems: "center" }}>
        <Typography variant="subtitle2" sx={{ flex: 1, pl: 1 }}>
          Repository
        </Typography>
        <Tooltip title="Choose the branches the graph shows">
          <IconButton
            size="small"
            data-testid="tree-filter-mode"
            aria-pressed={mode}
            aria-label="Choose the branches the graph shows"
            color={mode ? "primary" : "default"}
            onClick={onToggleMode}
          >
            <FilterAltOutlinedIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        {onCollapse && (
          <IconButton size="small" data-testid="left-panel-collapse" onClick={onCollapse} aria-label="Collapse panel">
            <ChevronLeftIcon fontSize="small" />
          </IconButton>
        )}
      </Box>
      <Box
        sx={{
          px: 1,
          py: 0.5,
          borderBottom: 1,
          borderColor: "divider",
          display: "flex",
          alignItems: "center",
          gap: 0.5,
        }}
      >
        <SearchIcon sx={{ fontSize: 14, color: "text.secondary" }} />
        <InputBase
          value={filter}
          onChange={(e) => onFilter(e.target.value)}
          placeholder="Filter refs…"
          inputProps={{ "data-testid": "tree-filter", "aria-label": "Filter refs" }}
          sx={{ flex: 1, fontSize: 12.5, "& input": { p: 0 } }}
        />
      </Box>
      {mode && (
        <Box
          data-testid="tree-filter-strip"
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1,
            px: 1.25,
            py: 0.625,
            fontSize: 12,
            whiteSpace: "nowrap",
            borderBottom: 1,
            borderColor: "divider",
            bgcolor: (t) => alpha(t.palette.primary.main, 0.12),
            color: "text.primary",
          }}
        >
          <span>
            Graph:{" "}
            <Box component="span" data-testid="tree-filter-count" sx={{ fontWeight: 600 }}>
              {shown} of {total}
            </Box>{" "}
            refs
          </span>
          <Box component="span" sx={{ flex: 1 }} />
          <Link component="button" type="button" underline="hover" data-testid="tree-filter-all" onClick={onShowAll}>
            Show all
          </Link>
          <Link
            component="button"
            type="button"
            underline="hover"
            data-testid="tree-filter-exit"
            onClick={onToggleMode}
          >
            Exit
          </Link>
        </Box>
      )}
    </>
  )
}
