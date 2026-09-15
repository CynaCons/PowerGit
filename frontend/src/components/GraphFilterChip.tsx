import CloseIcon from "@mui/icons-material/Close"
import FilterAltOutlinedIcon from "@mui/icons-material/FilterAltOutlined"
import Box from "@mui/material/Box"
import IconButton from "@mui/material/IconButton"
import { alpha } from "@mui/material/styles"

// The graph's ref filter, seen from the grid (v0.18.5, prototype tab 4 A
// `renderHead`): a chip at the end of the Message header while the mode is
// on — funnel, "n of N refs", and an × that leaves the mode. The tree's
// strip is the same count with Show all and Exit.
export function GraphFilterChip({ shown, total, onExit }: { shown: number; total: number; onExit: () => void }) {
  return (
    <Box
      component="span"
      data-testid="graph-filter-chip"
      title={`The graph shows the history of ${shown} ${shown === 1 ? "ref" : "refs"}`}
      sx={{
        ml: "auto",
        mr: 1,
        display: "inline-flex",
        alignItems: "center",
        gap: 0.5,
        height: 18,
        pl: 0.75,
        pr: 0.25,
        borderRadius: 1,
        bgcolor: (t) => alpha(t.palette.primary.main, 0.12),
        color: "primary.main",
        fontSize: 11,
        fontWeight: 600,
        whiteSpace: "nowrap",
        flexShrink: 0,
      }}
    >
      <FilterAltOutlinedIcon sx={{ fontSize: 12 }} />
      <span data-testid="graph-filter-count">
        {shown} of {total} refs
      </span>
      <IconButton
        size="small"
        aria-label="Show all refs"
        title="Show all refs"
        onClick={onExit}
        sx={{ p: 0, width: 14, height: 14, color: "inherit" }}
      >
        <CloseIcon sx={{ fontSize: 12 }} />
      </IconButton>
    </Box>
  )
}
