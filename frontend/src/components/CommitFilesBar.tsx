import AccountTreeOutlinedIcon from "@mui/icons-material/AccountTreeOutlined"
import ViewListOutlinedIcon from "@mui/icons-material/ViewListOutlined"
import Box from "@mui/material/Box"
import IconButton from "@mui/material/IconButton"
import Tooltip from "@mui/material/Tooltip"
import Typography from "@mui/material/Typography"

// The bar at the very bottom of the commit dialog's file column (v0.14.0):
// switches both lists between full paths and a directory tree, the same
// choice the diff view offers.
export function CommitFilesBar({ tree, onToggle }: { tree: boolean; onToggle: () => void }) {
  const label = tree ? "Show full paths" : "Group by directory"
  return (
    <Box
      data-testid="commit-files-bar"
      sx={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 0.75, flexShrink: 0 }}
    >
      <Typography variant="caption" color="text.secondary">
        {tree ? "Directory tree" : "Full paths"}
      </Typography>
      <Tooltip title={label} placement="top">
        <IconButton
          size="small"
          data-testid="commit-files-mode"
          aria-label={label}
          aria-pressed={tree}
          onClick={onToggle}
          sx={{ color: "primary.main", border: 1, borderColor: "divider" }}
        >
          {tree ? <ViewListOutlinedIcon fontSize="small" /> : <AccountTreeOutlinedIcon fontSize="small" />}
        </IconButton>
      </Tooltip>
    </Box>
  )
}
