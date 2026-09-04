import CloseIcon from "@mui/icons-material/Close"
import ContentCopyIcon from "@mui/icons-material/ContentCopy"
import Alert from "@mui/material/Alert"
import Box from "@mui/material/Box"
import IconButton from "@mui/material/IconButton"
import Tooltip from "@mui/material/Tooltip"

// navigator.clipboard requires a secure context and can be missing/blocked
// under tauri:// (no https, no permission prompt shown yet); fall back to
// the classic hidden-textarea + execCommand trick, which works from any
// focused document regardless of origin.
async function copyToClipboard(text: string): Promise<void> {
  try {
    if (!navigator.clipboard?.writeText) throw new Error("clipboard API unavailable")
    await navigator.clipboard.writeText(text)
    return
  } catch {
    // fall through to the textarea fallback below
  }
  const textarea = document.createElement("textarea")
  textarea.value = text
  textarea.style.position = "fixed"
  textarea.style.opacity = "0"
  document.body.appendChild(textarea)
  textarea.focus()
  textarea.select()
  try {
    document.execCommand("copy")
  } finally {
    document.body.removeChild(textarea)
  }
}

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
