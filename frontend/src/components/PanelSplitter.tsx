import Box from "@mui/material/Box"
import type { ChromeLayout } from "../hooks/useChromeLayout"

// The drag line between a revision grid and the bottom panel, shared by
// the Browse view and the file history (v0.18.0 factored it out of both).
// A GTK focus steal mid-drag fires pointercancel, never pointerup; without
// the cancel and lost-capture handlers the handle stays stuck to the cursor.
export function PanelSplitter({ testid, splitter }: { testid: string; splitter: ChromeLayout["splitter"] }) {
  return (
    <Box
      data-testid={testid}
      onPointerDown={splitter.onDividerDown}
      onPointerMove={splitter.onDividerMove}
      onPointerUp={splitter.onDividerUp}
      onPointerCancel={splitter.onDividerUp}
      onLostPointerCapture={splitter.onDividerUp}
      role="separator"
      aria-orientation="horizontal"
      aria-label="Resize bottom panel"
      sx={{
        height: 5,
        flexShrink: 0,
        cursor: "row-resize",
        bgcolor: "background.default",
        borderTop: 1,
        borderColor: "divider",
        transition: "background-color 120ms",
        "&:hover": { bgcolor: "primary.main" },
      }}
    />
  )
}
