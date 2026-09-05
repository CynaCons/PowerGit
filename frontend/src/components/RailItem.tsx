import ChevronRightIcon from "@mui/icons-material/ChevronRight"
import Box from "@mui/material/Box"
import ButtonBase from "@mui/material/ButtonBase"
import Menu from "@mui/material/Menu"
import Tooltip from "@mui/material/Tooltip"
import Typography from "@mui/material/Typography"
import { useState, type ReactNode } from "react"
import { badgeText } from "./commandItems"

// One row of the command rail: icon (+ label when the rail is expanded),
// an optional count pill, and a chevron / right-click that opens the item's
// options menu. The count (Commit's files changed) has its own place rather
// than a corner badge: above the icon when collapsed, trailing the label
// when expanded, so it is never clipped and grows to "999+" at most.

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
  const hint = item.shortcut ? `${item.label} (${item.shortcut})` : item.label
  const showPill = item.badge !== undefined && item.badge > 0
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
  // Collapsed: the pill sits above the icon inside the rail's width.
  const stacked = !expanded && showPill
  return (
    <>
      <Tooltip title={expanded ? "" : hint} placement="right" disableInteractive>
        <span style={{ display: "block" }}>
          <ButtonBase
            data-testid={item.testid}
            aria-label={item.label}
            title={expanded ? hint : undefined}
            disabled={item.disabled}
            onClick={item.onClick}
            onContextMenu={
              item.menu
                ? (e) => {
                    e.preventDefault()
                    setAnchor(e.currentTarget)
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
            {expanded && item.menu && (
              <Box
                component="span"
                role="button"
                aria-label={`${item.label} options`}
                data-testid={`${item.testid}-menu`}
                onClick={(e: React.MouseEvent<HTMLElement>) => {
                  e.stopPropagation()
                  setAnchor(e.currentTarget)
                }}
                sx={{
                  display: "grid",
                  placeItems: "center",
                  width: 20,
                  height: 20,
                  borderRadius: 1,
                  color: "text.secondary",
                  "&:hover": { bgcolor: "action.selected" },
                }}
              >
                <ChevronRightIcon sx={{ fontSize: 16 }} />
              </Box>
            )}
          </ButtonBase>
        </span>
      </Tooltip>
      {item.menu && (
        <Menu
          open={anchor !== null}
          anchorEl={anchor}
          onClose={() => setAnchor(null)}
          anchorOrigin={{ vertical: "top", horizontal: "right" }}
          transformOrigin={{ vertical: "top", horizontal: "left" }}
          onClick={() => setAnchor(null)}
        >
          {item.menu}
        </Menu>
      )}
    </>
  )
}
