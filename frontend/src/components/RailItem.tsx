import ChevronRightIcon from "@mui/icons-material/ChevronRight"
import Badge from "@mui/material/Badge"
import Box from "@mui/material/Box"
import ButtonBase from "@mui/material/ButtonBase"
import Menu from "@mui/material/Menu"
import Tooltip from "@mui/material/Tooltip"
import Typography from "@mui/material/Typography"
import { useState, type ReactNode } from "react"

// One row of the command rail (split out of CommandRail.tsx for the lint
// size limit): icon (+ label when the rail is expanded), optional badge,
// and a chevron / right-click that opens the item's options menu.

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

export function RailItem({ item, expanded }: { item: Item; expanded: boolean }) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const hint = item.shortcut ? `${item.label} (${item.shortcut})` : item.label
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
      }}
    >
      {item.icon}
    </Box>
  ) : (
    item.icon
  )
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
              height: 34,
              display: "flex",
              alignItems: "center",
              justifyContent: "flex-start",
              gap: 1.25,
              px: "11px",
              borderRadius: 1.5,
              color: item.disabled ? "text.disabled" : "text.primary",
              "& .MuiSvgIcon-root": { fontSize: 18 },
              "&:hover": { bgcolor: "action.hover" },
              "&.Mui-focusVisible": { boxShadow: "inset 0 0 0 1px var(--pg-focus-ring, #1553c9)" },
            }}
          >
            <Badge
              badgeContent={item.badge ?? 0}
              color="primary"
              overlap="rectangular"
              sx={{ "& .MuiBadge-badge": { fontSize: 10, minWidth: 16, height: 16, px: 0.5 } }}
            >
              {icon}
            </Badge>
            {expanded && (
              <Typography
                variant="body2"
                sx={{ fontSize: 12.5, fontWeight: 500, whiteSpace: "nowrap", flex: 1, textAlign: "left" }}
              >
                {item.label}
              </Typography>
            )}
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
