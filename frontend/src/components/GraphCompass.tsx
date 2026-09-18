import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward"
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward"
import HomeIcon from "@mui/icons-material/Home"
import Box from "@mui/material/Box"
import CircularProgress from "@mui/material/CircularProgress"
import IconButton from "@mui/material/IconButton"
import Menu from "@mui/material/Menu"
import MenuItem from "@mui/material/MenuItem"
import { alpha } from "@mui/material/styles"
import Tooltip from "@mui/material/Tooltip"
import Typography from "@mui/material/Typography"
import { useRef, useState, type ReactNode } from "react"
import { reasonText, rowOf, type NavReason } from "../graph/graphNav"
import type { GraphRow } from "../graph/types"
import type { GraphNav } from "../hooks/useGraphNav"
import { shortcutLabel } from "../hotkeys"
import { MONO_FONT } from "../theme"
import { useFloatingBar } from "./floatingBar"
import { Kbd } from "./Kbd"

type Props = {
  rows: GraphRow[]
  /** The targets, the SHA the history is paging towards, and the actions. */
  nav: Pick<GraphNav, "targets" | "loadingTarget" | "goToParent" | "goToChild" | "goToHead">
}

const SIZE = 28
const LONG_PRESS_MS = 450

// The compass (v0.18.12, owner: "definitely the compass bottom right",
// docs/prototypes/graph-nav.html B): three round buttons stacked at the
// bottom-right of the graph body — ↑ child, ⌂ HEAD, ↓ parent — the twin of
// the options pill at the bottom-left: 45 % at rest, full with a border and
// a shadow on hover, focus or while its menu is open (floatingBar.ts). A
// button with nowhere to go is dimmed, not disabled, so its tooltip still
// says why. On a merge the parent button wears the count; the badge, a
// right-click or a long press open the parents list, which opens to the
// left so it never leaves the graph; the button itself and Ctrl+P take the
// first parent, as Git Extensions does.
export function GraphCompass({ rows, nav }: Props) {
  const { targets, loadingTarget, goToParent: onParent, goToChild: onChild, goToHead: onHead } = nav
  const bar = useFloatingBar()
  const [focused, setFocused] = useState(false)
  const [menuAt, setMenuAt] = useState<HTMLElement | null>(null)
  const expanded = bar.expanded || focused || menuAt !== null
  const many = targets.parents.length > 1
  const parentBtn = useRef<HTMLButtonElement | null>(null)
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const openList = () => {
    if (many) setMenuAt(parentBtn.current)
  }
  const closeList = () => setMenuAt(null)
  const cancelPress = () => {
    if (pressTimer.current) clearTimeout(pressTimer.current)
    pressTimer.current = null
  }

  const loadingParent = loadingTarget !== null && loadingTarget === targets.parent
  const loadingHead = loadingTarget !== null && loadingTarget === targets.head

  return (
    <Box
      ref={bar.rootRef}
      data-testid="graph-nav"
      data-expanded={expanded ? "true" : "false"}
      role="group"
      aria-label="Go to"
      {...bar.rootProps}
      onFocus={() => setFocused(true)}
      onBlur={(e) => setFocused(e.currentTarget.contains(e.relatedTarget as Node | null))}
      sx={{
        position: "absolute",
        right: 10,
        bottom: 10,
        zIndex: 5,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 0.5,
        p: 0.5,
        borderRadius: 2,
        border: 1,
        // A hairline frame and the paper behind it at rest, at 70 %: the
        // 45 % transparent version blended into the SHA column's text and the
        // owner never found it (2026-09-18, "make it a bit more visible").
        borderColor: "divider",
        bgcolor: "background.paper",
        boxShadow: expanded ? 3 : 0,
        opacity: expanded ? 1 : 0.7,
        transition: "all 120ms ease",
        "&:hover": { opacity: 1 },
      }}
    >
      <NavButton
        testid="graph-nav-child"
        expanded={expanded}
        reason={targets.childReason}
        tip={<Go what="child" sha={targets.child} chord={shortcutLabel("browse.goToChild")} />}
        onClick={onChild}
      >
        <ArrowUpwardIcon sx={{ fontSize: 16 }} />
      </NavButton>
      <NavButton
        testid="graph-nav-head"
        expanded={expanded}
        lit={targets.atHead}
        reason={targets.headReason}
        tip={<Go what="HEAD" sha={targets.head} chord={shortcutLabel("browse.goToHead")} />}
        onClick={onHead}
      >
        {loadingHead ? <Spinner /> : <HomeIcon sx={{ fontSize: 16 }} />}
      </NavButton>
      <NavButton
        testid="graph-nav-parent"
        buttonRef={parentBtn}
        expanded={expanded}
        reason={targets.parentReason}
        tip={
          loadingParent ? (
            <>Loading history to {targets.parent?.slice(0, 7)}…</>
          ) : (
            <Go
              what={many ? "first parent" : "parent"}
              sha={targets.parent}
              chord={shortcutLabel("browse.goToParent")}
              after={many ? ` — ${targets.parents.length} parents, open the list` : undefined}
            />
          )
        }
        onClick={() => onParent()}
        onContextMenu={(e) => {
          e.preventDefault()
          openList()
        }}
        onPointerDown={() => {
          cancelPress()
          if (many) pressTimer.current = setTimeout(openList, LONG_PRESS_MS)
        }}
        onPointerUp={cancelPress}
        onPointerLeave={cancelPress}
      >
        {loadingParent ? <Spinner /> : <ArrowDownwardIcon sx={{ fontSize: 16 }} />}
        {many && (
          // No tooltip of its own: the button's already says "open the list",
          // and a nested one would open both.
          <Box
            component="span"
            data-testid="graph-nav-parent-count"
            aria-label={`${targets.parents.length} parents — open the list`}
            onClick={(e) => {
              e.stopPropagation()
              cancelPress()
              openList()
            }}
            sx={{
              position: "absolute",
              right: -6,
              top: -5,
              minWidth: 15,
              height: 15,
              px: "4px",
              borderRadius: 999,
              bgcolor: "primary.main",
              color: "primary.contrastText",
              fontSize: 10,
              fontWeight: 700,
              lineHeight: "15px",
              textAlign: "center",
              cursor: "pointer",
            }}
          >
            {targets.parents.length}
          </Box>
        )}
      </NavButton>
      <Menu
        open={menuAt !== null}
        anchorEl={menuAt}
        onClose={closeList}
        anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
        transformOrigin={{ vertical: "bottom", horizontal: "right" }}
        slotProps={{ paper: { sx: { ml: -1, minWidth: 300, maxWidth: 440 } }, list: { dense: true } }}
        data-testid="graph-nav-parents"
      >
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ display: "block", px: 1.5, pt: 0.25, pb: 0.75, borderBottom: 1, borderColor: "divider", mb: 0.5 }}
        >
          {targets.parents.length} parents of{" "}
          <Box component="span" sx={{ fontFamily: MONO_FONT }}>
            {targets.sha?.slice(0, 7)}
          </Box>{" "}
          — {shortcutLabel("browse.goToParent")} goes to the first
        </Typography>
        {targets.parents.map((p, n) => (
          <MenuItem
            key={p}
            data-testid={`graph-nav-parent-${n}`}
            onClick={() => {
              closeList()
              onParent(n)
            }}
            sx={{ gap: 1 }}
          >
            <Box
              component="span"
              sx={{
                width: 14,
                height: 14,
                borderRadius: "50%",
                border: 1,
                borderColor: n === 0 ? "primary.main" : "divider",
                bgcolor: n === 0 ? "primary.main" : "transparent",
                color: n === 0 ? "primary.contrastText" : "text.secondary",
                fontSize: 9.5,
                lineHeight: "12px",
                textAlign: "center",
                flex: "none",
              }}
            >
              {n + 1}
            </Box>
            <Box component="span" sx={{ fontFamily: MONO_FONT, fontSize: 12 }}>
              {p.slice(0, 7)}
            </Box>
            <Typography variant="body2" color="text.secondary" noWrap sx={{ minWidth: 0, flex: 1, fontSize: 12.5 }}>
              {rowOf(rows, p)?.rev.message ?? "(not loaded yet)"}
            </Typography>
            {n === 0 && <Kbd>{shortcutLabel("browse.goToParent")}</Kbd>}
          </MenuItem>
        ))}
      </Menu>
    </Box>
  )
}

function Spinner() {
  return <CircularProgress size={13} thickness={5} data-testid="graph-nav-loading" />
}

/** "Go to parent febf4ba" + the chord as a key chip. */
function Go({ what, sha, chord, after }: { what: string; sha: string | null; chord: string; after?: string }) {
  return (
    <Box component="span" sx={{ whiteSpace: "nowrap" }}>
      Go to {what}
      {sha && (
        <>
          {" "}
          <Box component="span" sx={{ fontFamily: MONO_FONT }}>
            {sha.slice(0, 7)}
          </Box>
        </>
      )}
      {chord && <Kbd>{chord}</Kbd>}
      {after}
    </Box>
  )
}

type ButtonProps = {
  testid: string
  expanded: boolean
  lit?: boolean
  /** Why the button cannot go anywhere; null when it can. */
  reason: NavReason | null
  tip: ReactNode
  onClick: () => void
  onContextMenu?: (e: React.MouseEvent) => void
  onPointerDown?: () => void
  onPointerUp?: () => void
  onPointerLeave?: () => void
  buttonRef?: React.Ref<HTMLButtonElement>
  children: ReactNode
}

// A 28 px round button. `reason` dims it and swaps the tooltip for the
// reason; it stays focusable and hoverable (aria-disabled, not disabled)
// so the reason is readable where the button is. A mouse click must not
// take keyboard focus (v0.18.18): the compass sits outside .grid-body, so
// a focused button swallowed the plain arrows until the grid was clicked
// again; preventing the mousedown default keeps focus where it was, while
// Tab still reaches the button and MUI's ripple still starts (ButtonBase
// runs the handler, then the ripple, whatever the event's default). The
// parents Menu's focus trap then hands focus back to the grid on close
// (docs/perf/reactivity-review-2026-09-17.md second pass, finding 7).
function NavButton({ testid, expanded, lit, reason, tip, onClick, buttonRef, children, ...handlers }: ButtonProps) {
  const off = reason !== null
  return (
    <Tooltip title={off ? reasonText(reason) : tip} placement="left" enterDelay={300}>
      <IconButton
        ref={buttonRef}
        size="small"
        data-testid={testid}
        data-lit={lit ? "true" : undefined}
        aria-disabled={off ? "true" : undefined}
        data-reason={off ? reason : undefined}
        onClick={off ? undefined : onClick}
        onMouseDown={(e) => e.preventDefault()}
        {...(off ? {} : handlers)}
        sx={{
          width: SIZE,
          height: SIZE,
          p: 0,
          overflow: "visible",
          border: 1,
          borderColor: lit ? "primary.main" : expanded ? "divider" : "transparent",
          bgcolor: lit ? (t) => alpha(t.palette.primary.main, 0.12) : expanded ? "background.paper" : "transparent",
          color: off ? "text.disabled" : lit ? "primary.main" : "text.secondary",
          opacity: off ? 0.5 : 1,
          cursor: off ? "default" : "pointer",
          transition: "all 120ms ease",
          "&:hover": {
            bgcolor: off ? "transparent" : lit ? (t) => alpha(t.palette.primary.main, 0.18) : "var(--pg-grid-hover)",
            color: off ? "text.disabled" : lit ? "primary.main" : "text.primary",
          },
        }}
      >
        {children}
      </IconButton>
    </Tooltip>
  )
}
