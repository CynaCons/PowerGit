import UndoIcon from "@mui/icons-material/Undo"
import Box from "@mui/material/Box"
import Button from "@mui/material/Button"
import Typography from "@mui/material/Typography"
import { useRef, type ReactNode } from "react"
import { metaOf, type SettingId } from "./settingsCatalog"

// One setting on the page (v0.18.0, prototype A): the title, the one-line
// description and the control under them. A row whose value differs from
// its default carries a primary bar at the left, a "changed" tag after the
// title and a Reset (Unset for a Git key) that shows on hover or focus — it
// is always in the DOM so a test can click it without hovering first.

type Props = {
  id: SettingId
  /** Overrides the catalog title (the Updates row shows the version). */
  title?: string
  changed?: boolean
  onReset?: () => void
  resetLabel?: "Reset" | "Unset"
  /** A row the search filtered out renders nothing. */
  hidden?: boolean
  children: ReactNode
}

export function SettingRow({ id, title, changed = false, onReset, resetLabel = "Reset", hidden, children }: Props) {
  const root = useRef<HTMLDivElement | null>(null)
  if (hidden) return null
  const meta = metaOf(id)
  return (
    <Box
      ref={root}
      id={`setting-${id}`}
      data-testid={`settings-row-${id}`}
      data-changed={changed ? "true" : "false"}
      // Click-focusable so the keys keep reaching the page: the Reset
      // button leaves the DOM once pressed, and focus must land here
      // rather than on the body, where Escape would go unheard.
      tabIndex={-1}
      sx={{
        position: "relative",
        outline: "none",
        display: "flex",
        flexDirection: "column",
        gap: 0.75,
        my: 0.25,
        py: 1.25,
        pl: 1.75,
        pr: 1.5,
        borderRadius: 1,
        "&:hover": { bgcolor: "var(--pg-surface-sunken)" },
        "&:hover .pg-setting-reset, &:focus-within .pg-setting-reset": { opacity: 1 },
        ...(changed && {
          "&::before": {
            content: '""',
            position: "absolute",
            left: 2,
            top: 10,
            bottom: 10,
            width: 3,
            borderRadius: 1,
            bgcolor: "primary.main",
          },
        }),
      }}
    >
      <Typography component="div" sx={{ fontWeight: 600, lineHeight: 1.4 }}>
        {title ?? meta.title}
        {changed && (
          <Typography component="span" sx={{ fontWeight: 400, color: "text.secondary", ml: 0.75 }}>
            changed
          </Typography>
        )}
      </Typography>
      {meta.description && (
        <Typography sx={{ color: "text.secondary", fontSize: 12, lineHeight: 1.4, maxWidth: "70ch" }}>
          {meta.description}
        </Typography>
      )}
      <Box sx={{ mt: 0.25, display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 0.75 }}>
        {children}
      </Box>
      {changed && onReset && (
        <Button
          className="pg-setting-reset"
          size="small"
          startIcon={<UndoIcon sx={{ fontSize: 14 }} />}
          onClick={() => {
            root.current?.focus({ preventScroll: true })
            onReset()
          }}
          data-testid={`settings-reset-${id}`}
          title={resetLabel === "Unset" ? "Unset at this scope" : "Reset to default"}
          sx={{
            position: "absolute",
            right: 10,
            top: 8,
            opacity: 0,
            minWidth: 0,
            px: 1,
            py: 0.25,
            fontSize: 12,
            "&.Mui-focusVisible": { opacity: 1 },
          }}
        >
          {resetLabel}
        </Button>
      )}
    </Box>
  )
}
