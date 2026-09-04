import Box from "@mui/material/Box"
import Button from "@mui/material/Button"
import CircularProgress from "@mui/material/CircularProgress"
import Typography from "@mui/material/Typography"
import type { ReactNode } from "react"

/**
 * v0.13.12: the one set of loading / empty / error / retry presentations.
 * Every pane places them the same way (centred, muted, small) so the
 * interface never mixes bare "Loading…" strings with ad-hoc banners.
 */
const wrapSx = { p: 2, display: "flex", alignItems: "center", justifyContent: "center", gap: 1, minHeight: 48 } as const

export function LoadingState({ label = "Loading…", testid }: { label?: string; testid?: string }) {
  return (
    <Box data-testid={testid ?? "loading-state"} role="status" aria-live="polite" sx={wrapSx}>
      <CircularProgress size={14} thickness={5} />
      <Typography variant="body2" color="text.secondary">
        {label}
      </Typography>
    </Box>
  )
}

export function EmptyState({ text, action, testid }: { text: string; action?: ReactNode; testid?: string }) {
  return (
    <Box data-testid={testid ?? "empty-state"} sx={{ ...wrapSx, flexDirection: "column" }}>
      <Typography variant="body2" color="text.secondary">
        {text}
      </Typography>
      {action}
    </Box>
  )
}

export function ErrorState({
  message,
  onRetry,
  testid,
  retryLabel = "Retry",
}: {
  message: string
  onRetry?: () => void
  testid?: string
  retryLabel?: string
}) {
  return (
    <Box data-testid={testid ?? "error-state"} role="alert" sx={{ ...wrapSx, flexDirection: "column" }}>
      <Typography variant="body2" color="error" sx={{ textAlign: "center", wordBreak: "break-word" }}>
        {message}
      </Typography>
      {onRetry && (
        <Button size="small" variant="outlined" onClick={onRetry}>
          {retryLabel}
        </Button>
      )}
    </Box>
  )
}
