import Box from "@mui/material/Box"
import type { ReactNode } from "react"
import { MONO_FONT } from "../theme"

// A hotkey typeset as a key (v0.18.2): the S / U beside Stage and Unstage
// in the commit window used to be a stray capital in caption text. One
// small chip — 10.5 px mono, a 1 px divider border, 3 px radius — for every
// inline shortcut next to a button label. Menu shortcuts (right-aligned
// captions) and tooltips are not chips.
export function Kbd({ children }: { children: ReactNode }) {
  return (
    <Box
      component="span"
      sx={{
        fontFamily: MONO_FONT,
        fontSize: 10.5,
        lineHeight: "14px",
        px: 0.5,
        border: "1px solid",
        borderColor: "divider",
        borderRadius: "3px",
        color: "text.secondary",
        ml: 0.75,
        verticalAlign: "middle",
        // Inside a disabled button the key greys with its label (the look
        // pass: a chip darker than "Stage" read as the live part).
        ".Mui-disabled &": { color: "inherit" },
      }}
    >
      {children}
    </Box>
  )
}
