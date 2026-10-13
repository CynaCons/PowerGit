import Box from "@mui/material/Box"
import Button from "@mui/material/Button"

// Small pieces of the agent review screen (v0.21.3): the coloured chip and
// the Accept / Reject buttons of a change.

export function Chip({
  tone,
  children,
}: {
  tone: "accept" | "agent" | "wait" | "info" | "muted" | "reject"
  children: React.ReactNode
}) {
  const palette = {
    accept: ["var(--pg-review-accept-bg)", "var(--pg-review-accept)"],
    reject: ["var(--pg-review-rejected-bg)", "var(--pg-review-rejected)"],
    agent: ["var(--pg-agent-bg)", "var(--pg-agent)"],
    wait: ["var(--pg-review-todo-bg)", "var(--pg-review-todo)"],
    info: ["var(--pg-review-ok-bg)", "var(--pg-review-ok)"],
    muted: ["action.hover", "text.secondary"],
  }[tone]
  return (
    <Box
      component="span"
      sx={{
        display: "inline-block",
        borderRadius: 2.5,
        px: 0.9,
        fontSize: 11,
        lineHeight: "18px",
        whiteSpace: "nowrap",
        bgcolor: palette[0],
        color: palette[1],
        fontFamily: "system-ui, sans-serif",
      }}
    >
      {children}
    </Box>
  )
}

export function VerdictButton({
  testid,
  active,
  tone,
  disabled,
  onClick,
  children,
}: {
  testid: string
  active: boolean
  tone: "accept" | "reject"
  disabled: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  const color = tone === "accept" ? "var(--pg-review-accept)" : "var(--pg-review-rejected)"
  const bg = tone === "accept" ? "var(--pg-review-accept-bg)" : "var(--pg-review-rejected-bg)"
  return (
    <Button
      size="small"
      variant="outlined"
      data-testid={testid}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      sx={{
        minWidth: 0,
        py: 0,
        px: 1,
        fontSize: 12,
        textTransform: "none",
        fontWeight: active ? 700 : 400,
        color: active ? color : "text.primary",
        borderColor: active ? color : "divider",
        bgcolor: active ? bg : "background.paper",
        "&.Mui-disabled": { color: active ? color : undefined, opacity: active ? 0.9 : 0.5 },
      }}
    >
      {children}
    </Button>
  )
}
