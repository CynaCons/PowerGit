import ArrowDropDownIcon from "@mui/icons-material/ArrowDropDown"
import Button from "@mui/material/Button"
import ButtonGroup from "@mui/material/ButtonGroup"
import Menu from "@mui/material/Menu"
import { useState, type ReactNode } from "react"

// Git Extensions density for the whole command bar: ~26px buttons keep the
// toolbar row to ~28-30px total instead of MUI's default ~31-33px "small"
// button metrics stacking up with the toolbar's own padding. Icons keep
// their fontSize="small" prop at call sites (untouched) and are rescaled to
// 18px here via the MuiSvgIcon-root descendant selector, so every toolbar
// icon shrinks uniformly without editing each call site.
const TOOLBAR_BUTTON_SX = {
  height: 26,
  minWidth: 0,
  px: 1,
  py: 0,
  fontSize: 12,
  fontWeight: 500,
  borderRadius: 4,
  "& .MuiSvgIcon-root": { fontSize: 18 },
} as const

// The split-button dropdown caret is its own narrow segment, not a second
// full-width button. MuiButtonGroup applies `.MuiButtonGroup-grouped { min-
// width: 40px }` to every grouped child via a two-class descendant selector,
// which outranks a single-class sx utility rule on specificity alone (not
// source order) — !important is the narrow, deliberate override for just
// this instance.
// Icon-only variant used by the collapsed tiers: square, no label box, so a
// row of them reads as a compact icon bar rather than a row of empty buttons.
const TOOLBAR_ICON_SX = {
  height: 26,
  minWidth: "26px !important",
  width: 26,
  px: 0,
  py: 0,
  "& .MuiSvgIcon-root": { fontSize: 18 },
} as const

const TOOLBAR_CARET_SX = {
  ...TOOLBAR_BUTTON_SX,
  px: 0,
  minWidth: "20px !important",
  width: "20px !important",
} as const

// Git Extensions-style split button: main action on the left, dropdown caret
// for secondary actions. A MUI ButtonGroup keeps both halves in one bordered
// group with a single shared divider (no gap), so the caret is unambiguously
// part of the button to its left rather than floating between two buttons.
export function SplitButton({
  label,
  icon,
  testid,
  variant = "text",
  disabled,
  shortcut,
  compact = false,
  onMainClick,
  children,
}: {
  label: string
  icon?: ReactNode
  testid: string
  variant?: "text" | "outlined" | "contained"
  disabled?: boolean
  shortcut?: string
  compact?: boolean
  onMainClick: () => void
  children?: ReactNode
}) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  // Collapsed to an icon there is no visible label, so the tooltip carries
  // the whole meaning — it always names the action, with the shortcut only
  // as a suffix.
  const hint = shortcut ? `${label} (${shortcut})` : label
  const iconOnly = compact && icon !== undefined
  return (
    <>
      <ButtonGroup
        size="small"
        variant={variant}
        color={variant === "contained" ? "primary" : "inherit"}
        disabled={disabled}
      >
        <Button
          data-testid={testid}
          startIcon={iconOnly ? undefined : icon}
          aria-label={label}
          title={hint}
          onClick={onMainClick}
          sx={iconOnly ? TOOLBAR_ICON_SX : TOOLBAR_BUTTON_SX}
        >
          {iconOnly ? icon : label}
        </Button>
        <Button
          data-testid={`${testid}-menu`}
          aria-label={`${label} options`}
          onClick={(e) => setAnchor(e.currentTarget)}
          sx={TOOLBAR_CARET_SX}
        >
          <ArrowDropDownIcon fontSize="small" />
        </Button>
      </ButtonGroup>
      <Menu open={anchor !== null} anchorEl={anchor} onClose={() => setAnchor(null)} transitionDuration={0}>
        {children}
      </Menu>
    </>
  )
}

// Standalone Git Extensions-style toolbar button: icon + short label, no
// caret — reserved for actions with no attached menu (see SplitButton).
export function ToolbarButton({
  label,
  icon,
  testid,
  disabled,
  shortcut,
  compact = false,
  onClick,
}: {
  label: string
  icon: ReactNode
  testid: string
  disabled?: boolean
  shortcut?: string
  compact?: boolean
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void
}) {
  const hint = shortcut ? `${label} (${shortcut})` : label
  return (
    <Button
      size="small"
      variant="text"
      color="inherit"
      data-testid={testid}
      startIcon={compact ? undefined : icon}
      disabled={disabled}
      aria-label={label}
      title={hint}
      onClick={onClick}
      sx={compact ? TOOLBAR_ICON_SX : TOOLBAR_BUTTON_SX}
    >
      {compact ? icon : label}
    </Button>
  )
}
