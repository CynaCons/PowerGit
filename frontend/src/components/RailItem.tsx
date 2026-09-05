import ChevronRightIcon from "@mui/icons-material/ChevronRight"
import Box from "@mui/material/Box"
import ButtonBase from "@mui/material/ButtonBase"
import Menu from "@mui/material/Menu"
import Tooltip from "@mui/material/Tooltip"
import Typography from "@mui/material/Typography"
import { useEffect, useId, useState, type ReactNode } from "react"
import { badgeText } from "./commandItems"

// One row of the command rail: icon (+ label when the rail is expanded),
// an optional count pill, and an options chevron that opens the item's
// menu. The count (Commit's files changed) has its own place rather than a
// corner badge: above the icon when collapsed, trailing the label when
// expanded, so it is never clipped and grows to "999+" at most.
//
// The chevron is a sibling button, not a child of the row's button (a
// button inside a button is invalid HTML and unreachable by keyboard); the
// row itself opens the menu on right-click, Shift+F10 or the ContextMenu
// key. The menu lets pointer events through its modal root so a right-click
// on another row re-targets instead of being swallowed (same pattern as
// RevisionContextMenu), with a manual outside-click close.

export type Item = {
  id: string
  label: string
  icon: ReactNode
  testid: string
  disabled?: boolean
  shortcut?: string
  primary?: boolean
  badge?: number
  onClick: () => void
  menu?: ReactNode
}

function Pill({ n, testid }: { n: number; testid: string }) {
  return (
    <Box
      component="span"
      data-testid={testid}
      sx={{
        display: "inline-block",
        minWidth: 18,
        height: 16,
        lineHeight: "16px",
        px: 0.75,
        borderRadius: 8,
        fontSize: 10.5,
        fontWeight: 600,
        textAlign: "center",
        bgcolor: "primary.main",
        color: "primary.contrastText",
        fontVariantNumeric: "tabular-nums",
      }}
    >
      {badgeText(n)}
    </Box>
  )
}

export function RailItem({ item, expanded }: { item: Item; expanded: boolean }) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const menuId = useId()
  const hint = item.shortcut ? `${item.label} (${item.shortcut})` : item.label
  const showPill = item.badge !== undefined && item.badge > 0
  const stacked = !expanded && showPill
  const open = anchor !== null

  // Click-away by hand: the modal root passes pointer events through, so
  // the backdrop no longer closes the menu (see the file comment).
  useEffect(() => {
    if (!open) return
    const closeIfOutside = (e: Event) => {
      const el = e.target as HTMLElement | null
      if (el?.closest(`[data-menu-id="${menuId}"]`)) return
      setAnchor(null)
    }
    document.addEventListener("mousedown", closeIfOutside, true)
    document.addEventListener("contextmenu", closeIfOutside, true)
    return () => {
      document.removeEventListener("mousedown", closeIfOutside, true)
      document.removeEventListener("contextmenu", closeIfOutside, true)
    }
  }, [open, menuId])

  const icon = item.primary ? (
    <Box
      sx={{
        width: 26,
        height: 26,
        borderRadius: 1.5,
        display: "grid",
        placeItems: "center",
        bgcolor: "primary.main",
        color: "primary.contrastText",
        flexShrink: 0,
      }}
    >
      {item.icon}
    </Box>
  ) : (
    item.icon
  )

  const openMenuFrom = (el: HTMLElement) => {
    if (item.menu && !item.disabled) setAnchor(el)
  }

  return (
    <>
      <Box sx={{ display: "flex", alignItems: "stretch", gap: "2px" }}>
        <Tooltip title={expanded ? "" : hint} placement="right" disableInteractive>
          <span style={{ display: "block", flex: 1, minWidth: 0 }}>
            <ButtonBase
              data-testid={item.testid}
              aria-label={item.label}
              aria-haspopup={item.menu ? "menu" : undefined}
              title={expanded ? hint : undefined}
              disabled={item.disabled}
              onClick={item.onClick}
              onContextMenu={
                item.menu
                  ? (e) => {
                      e.preventDefault()
                      openMenuFrom(e.currentTarget)
                    }
                  : undefined
              }
              onKeyDown={
                item.menu
                  ? (e) => {
                      if (e.key === "ContextMenu" || (e.key === "F10" && e.shiftKey)) {
                        e.preventDefault()
                        openMenuFrom(e.currentTarget)
                      }
                    }
                  : undefined
              }
              sx={{
                width: "100%",
                minHeight: 34,
                height: stacked ? 52 : 34,
                display: "flex",
                flexDirection: stacked ? "column" : "row",
                alignItems: "center",
                justifyContent: stacked ? "center" : "flex-start",
                gap: stacked ? 0.25 : 1.25,
                px: "11px",
                borderRadius: 1.5,
                color: item.disabled ? "text.disabled" : "text.primary",
                "& .MuiSvgIcon-root": { fontSize: 18 },
                "&:hover": { bgcolor: "action.hover" },
                "&.Mui-focusVisible": { boxShadow: "inset 0 0 0 1px var(--pg-focus-ring, #1553c9)" },
              }}
            >
              {stacked && <Pill n={item.badge!} testid={`${item.testid}-count`} />}
              {icon}
              {expanded && (
                <Typography
                  variant="body2"
                  sx={{ fontSize: 12.5, fontWeight: 500, whiteSpace: "nowrap", flex: 1, textAlign: "left" }}
                >
                  {item.label}
                </Typography>
              )}
              {expanded && showPill && <Pill n={item.badge!} testid={`${item.testid}-count`} />}
            </ButtonBase>
          </span>
        </Tooltip>
        {expanded && item.menu && (
          <ButtonBase
            aria-label={`${item.label} options`}
            aria-haspopup="menu"
            data-testid={`${item.testid}-menu`}
            disabled={item.disabled}
            onClick={(e) => openMenuFrom(e.currentTarget)}
            sx={{
              width: 22,
              borderRadius: 1.5,
              color: item.disabled ? "text.disabled" : "text.secondary",
              "&:hover": { bgcolor: "action.hover" },
              "&.Mui-focusVisible": { boxShadow: "inset 0 0 0 1px var(--pg-focus-ring, #1553c9)" },
            }}
          >
            <ChevronRightIcon sx={{ fontSize: 16 }} />
          </ButtonBase>
        )}
      </Box>
      {item.menu && (
        <Menu
          transitionDuration={0}
          open={open}
          anchorEl={anchor}
          onClose={() => setAnchor(null)}
          anchorOrigin={{ vertical: "top", horizontal: "right" }}
          transformOrigin={{ vertical: "top", horizontal: "left" }}
          onClick={() => setAnchor(null)}
          slotProps={{
            root: { sx: { pointerEvents: "none" } },
            paper: { sx: { pointerEvents: "auto" }, "data-menu-id": menuId } as never,
          }}
        >
          {item.menu}
        </Menu>
      )}
    </>
  )
}
