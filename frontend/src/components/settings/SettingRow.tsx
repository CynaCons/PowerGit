import UndoIcon from "@mui/icons-material/Undo"
import Box from "@mui/material/Box"
import Button from "@mui/material/Button"
import Typography from "@mui/material/Typography"
import { useRef, type ReactNode } from "react"
import { MONO_FONT } from "../../theme"
import { metaOf, type SettingId } from "./settingsCatalog"

// One setting on the page (v0.18.0; v0.21.6 lean layout). The label column
// on the left — the title, the Git key it writes or a short line — and the
// control on the right; rows are split by a hairline. A row whose value
// differs from its default carries a primary bar at the left, a tag after
// the title and a button that shows on hover or focus — it is always in the
// DOM so a test can click it without hovering first. App rows say
// "changed" / Reset; a Git key is not changed but set at this scope, so it
// says "set here" / Unset. Below 640 px of list the columns stack.

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
        display: "grid",
        gridTemplateColumns: "minmax(180px, 240px) minmax(0, 1fr) auto",
        columnGap: 3,
        rowGap: 0.75,
        alignItems: "start",
        py: 1.25,
        pl: 1.5,
        pr: 1,
        borderTop: 1,
        borderColor: "var(--pg-border-soft)",
        "&:hover": { bgcolor: "var(--pg-surface-sunken)" },
        "&:hover .pg-setting-reset, &:focus-within .pg-setting-reset": { opacity: 1 },
        "@container settings-list (max-width: 640px)": { gridTemplateColumns: "minmax(0, 1fr) auto" },
        ...(changed && {
          "&::before": {
            content: '""',
            position: "absolute",
            left: 0,
            top: 8,
            bottom: 8,
            width: 3,
            borderRadius: 1,
            bgcolor: "primary.main",
          },
        }),
      }}
    >
      <Box sx={{ minWidth: 0, pt: 0.5 }}>
        <Typography component="div" sx={{ fontWeight: 600, fontSize: 13, lineHeight: 1.4 }}>
          {title ?? meta.title}
          {changed && (
            <Typography component="span" sx={{ fontWeight: 400, fontSize: 12, color: "text.secondary", ml: 0.75 }}>
              {resetLabel === "Unset" ? "set here" : "changed"}
            </Typography>
          )}
        </Typography>
        {meta.gitKey && (
          <Typography
            component="code"
            data-testid={`settings-key-${id}`}
            sx={{ display: "block", fontFamily: MONO_FONT, fontSize: 11.5, color: "text.secondary", mt: 0.25 }}
          >
            {meta.gitKey}
          </Typography>
        )}
        {meta.description && (
          <Typography sx={{ color: "text.secondary", fontSize: 12, lineHeight: 1.4, mt: 0.25 }}>
            {meta.description}
          </Typography>
        )}
      </Box>
      <Box
        sx={{
          minWidth: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          gap: 0.75,
          "@container settings-list (max-width: 640px)": { gridColumn: "1 / -1", gridRow: 2 },
        }}
      >
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
            gridColumn: "-2 / -1",
            gridRow: 1,
            alignSelf: "start",
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
