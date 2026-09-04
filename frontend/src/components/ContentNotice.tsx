import ContentCopyIcon from "@mui/icons-material/ContentCopy"
import Box from "@mui/material/Box"
import Button from "@mui/material/Button"
import IconButton from "@mui/material/IconButton"
import Tooltip from "@mui/material/Tooltip"
import Typography from "@mui/material/Typography"
import type { DiffDto } from "../engine"
import { formatBytes } from "../format"
import { copyToClipboard } from "./clipboard"

/**
 * v0.13.11: the intentional "too large / binary" state for a diff or blob.
 * Says what was cut and why, with the size, and offers the ways out (copy
 * the path, open in the external diff tool, retry) instead of silently
 * handing a giant element tree to the webview.
 */
export function ContentNotice({
  dto,
  onOpenDifftool,
  onRetry,
}: {
  dto: DiffDto
  onOpenDifftool?: () => void
  onRetry?: () => void
}) {
  if (!dto.truncated && !dto.binary) return null
  const reason = dto.binary
    ? "Binary content is not previewed."
    : dto.truncatedReason === "lines"
      ? "Only the first 50,000 lines are shown."
      : "Only the first part is shown."
  const title = dto.binary ? "Binary file" : "Too large to preview in full"
  return (
    <Box
      data-testid="content-notice"
      role="note"
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 1,
        px: 1.5,
        py: 0.5,
        borderBottom: 1,
        borderColor: "divider",
        bgcolor: "#fffbeb",
        fontSize: 12,
        flexWrap: "wrap",
      }}
    >
      <Typography variant="caption" sx={{ fontWeight: 700 }}>
        {title}
      </Typography>
      <Typography variant="caption" color="text.secondary">
        {reason} {dto.sizeBytes > 0 ? `Size: ${formatBytes(dto.sizeBytes)}.` : ""}
      </Typography>
      <Box sx={{ ml: "auto", display: "flex", gap: 0.5, alignItems: "center" }}>
        <Tooltip title="Copy path">
          <IconButton size="small" aria-label="Copy path" onClick={() => void copyToClipboard(dto.path)}>
            <ContentCopyIcon sx={{ fontSize: 14 }} />
          </IconButton>
        </Tooltip>
        {onOpenDifftool && (
          <Button size="small" onClick={onOpenDifftool} data-testid="content-notice-difftool">
            Open in diff tool
          </Button>
        )}
        {onRetry && (
          <Button size="small" onClick={onRetry} data-testid="content-notice-retry">
            Reload
          </Button>
        )}
      </Box>
    </Box>
  )
}
