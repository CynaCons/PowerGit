import CloseIcon from "@mui/icons-material/Close"
import ContentCopyIcon from "@mui/icons-material/ContentCopy"
import Alert from "@mui/material/Alert"
import Box from "@mui/material/Box"
import IconButton from "@mui/material/IconButton"
import Tooltip from "@mui/material/Tooltip"

import { copyToClipboard } from "./clipboard"

export function ErrorBanner({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  return (
    <Alert
      data-testid="error-banner"
      severity="error"
      sx={{ borderRadius: 0, py: 0.25 }}
      action={
        <Box sx={{ display: "flex", gap: 0.5 }}>
          <Tooltip title="Copy error text">
            <IconButton
              data-testid="error-banner-copy"
              size="small"
              color="inherit"
              aria-label="Copy error text"
              onClick={() => void copyToClipboard(message)}
            >
              <ContentCopyIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <IconButton
            data-testid="error-banner-close"
            size="small"
            color="inherit"
            aria-label="Dismiss"
            onClick={onDismiss}
          >
            <CloseIcon fontSize="small" />
          </IconButton>
        </Box>
      }
    >
      {message}
    </Alert>
  )
}
