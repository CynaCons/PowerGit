import Box from "@mui/material/Box"
import type { ChromeLayout } from "../hooks/useChromeLayout"
import { deskGap } from "../theme/panels"

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
        // The gutter between the two cards is the handle (v0.20.5): it shows
        // the desk at rest and draws a line under the pointer, so the grab
        // area is the space you already aim at.
        height: deskGap,
        flexShrink: 0,
        cursor: "row-resize",
        // Belt and braces with onDividerDown's preventDefault (v0.18.18):
        // Chromium does not start a selection from a user-select:none target.
        userSelect: "none",
        display: "flex",
        alignItems: "center",
        "&::after": {
          content: '""',
          flex: 1,
          height: "2px",
          borderRadius: "1px",
          bgcolor: "transparent",
          transition: "background-color 120ms",
        },
        "&:hover::after": { bgcolor: "primary.main" },
      }}
    />
  )
}
