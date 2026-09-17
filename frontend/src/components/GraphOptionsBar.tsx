import PersonOutlinedIcon from "@mui/icons-material/PersonOutlined"
import RouteOutlinedIcon from "@mui/icons-material/RouteOutlined"
import Box from "@mui/material/Box"
import Button from "@mui/material/Button"
import Divider from "@mui/material/Divider"
import FormControl from "@mui/material/FormControl"
import MenuItem from "@mui/material/MenuItem"
import Select from "@mui/material/Select"
import ToggleButton from "@mui/material/ToggleButton"
import Tooltip from "@mui/material/Tooltip"
import Typography from "@mui/material/Typography"
import { memo, useMemo } from "react"
import type { HighlightScope } from "../graph/ancestry"
import { countAuthor } from "../graph/authorIdentity"
import { setGraphOptions, useGraphOptions } from "../graph/graphOptions"
import type { GraphRow } from "../graph/types"
import { MONO_FONT } from "../theme"
import { useFloatingBar } from "./floatingBar"
import { Kbd } from "./Kbd"

type Props = {
  /** The loaded rows, for the Author group's "n of N" (v0.18.1). */
  rows: GraphRow[]
  /** The selected row's author; null with nothing (or a pending row) selected. */
  selectedAuthor: string | null
  /** Highlight ancestry (v0.18.4): the temporary root's row, or null for the checked-out branch. */
  highlightRoot: GraphRow | null
  /** Exit: back to the checked-out branch's highlight. */
  onExitHighlight: () => void
}

const TOGGLE_SX = { py: 0.25, px: 1, fontSize: 12, textTransform: "none", whiteSpace: "nowrap" } as const

// The temporary mode's colour: the review amber (tokens.ts `review`), the
// one hue outside the blues, so the pill reads as "not the usual state".
const AMBER = "var(--pg-review-todo, #b7791f)"
const AMBER_BORDER = "var(--pg-review-todo-stripe, #d99a2b)"
const AMBER_BG = "var(--pg-review-todo-bg, rgba(183, 121, 31, 0.10))"

// The graph's floating options pill (v0.14.0), the same device as the diff
// view's DiffOptionsBar. Owner: "a bar with different settings" for how
// the checked-out branch's history is highlighted. Stays expanded while a
// menu is open (floatingBar.ts, v0.14.1). v0.18.1 adds the Author group
// after a divider: who the selected commit is by, how many of the loaded
// rows are theirs, and Mark for the ring and the bold on those rows.
// v0.18.4: while "Highlight ancestry" has a root, the pill is the mode's
// home — pinned open, amber border and icon, the root's SHA and subject in
// place of "Checked-out branch", and Exit (Esc). Scope, Ring, Dim and the
// Author group keep working on the temporary root.
// RevisionGrid passes stable rows, selectedAuthor, rootRow and exitHighlight,
// so hover and scroll renders can bail out here (v0.18.18).
export const GraphOptionsBar = memo(function GraphOptionsBar({ rows, selectedAuthor, highlightRoot, onExitHighlight }: Props) {
  const temporary = highlightRoot !== null
  const bar = useFloatingBar(temporary)
  const { expanded } = bar
  const options = useGraphOptions()
  const count = useMemo(() => countAuthor(rows, selectedAuthor), [rows, selectedAuthor])

  return (
    <Box
      ref={bar.rootRef}
      data-testid="graph-options-bar"
      data-expanded={expanded ? "true" : "false"}
      data-ancestry={temporary ? "true" : "false"}
      {...bar.rootProps}
      sx={{
        position: "absolute",
        left: 10,
        bottom: 10,
        // The ancestry state adds the root and Exit: the pill stays one line
        // and gives the subject up first rather than wrapping its buttons.
        // The compass (v0.18.12) has the 48 px at the right end.
        maxWidth: "calc(100% - 68px)",
        whiteSpace: "nowrap",
        zIndex: 5,
        bgcolor: expanded ? "background.paper" : "transparent",
        border: expanded ? 1 : 0,
        borderColor: temporary ? AMBER_BORDER : "divider",
        borderRadius: 2,
        boxShadow: expanded ? 3 : 0,
        px: expanded ? 1.5 : 1,
        py: expanded ? 0.75 : 0.25,
        display: "flex",
        alignItems: "center",
        gap: 1,
        opacity: expanded ? 1 : 0.45,
        transition: "all 120ms ease",
        cursor: expanded ? "default" : "pointer",
        "&:hover": { opacity: 1 },
      }}
    >
      <Tooltip title={temporary ? "Highlight ancestry" : bar.pinned ? "Unpin" : "Branch history highlight"}>
        <RouteOutlinedIcon
          fontSize="small"
          onClick={bar.togglePinned}
          sx={{ color: temporary ? AMBER : bar.pinned ? "primary.main" : "text.secondary", cursor: "pointer" }}
        />
      </Tooltip>
      <Box sx={{ display: expanded ? "flex" : "none", alignItems: "center", gap: 1, minWidth: 0 }}>
        {highlightRoot ? (
          <>
            <Typography variant="caption" color="text.secondary">
              Ancestry of
            </Typography>
            <Typography
              component="span"
              data-testid="graph-ancestry-root"
              title={highlightRoot.rev.id}
              sx={{ fontFamily: MONO_FONT, fontSize: 11, lineHeight: 1.4 }}
            >
              {highlightRoot.rev.id.slice(0, 7)}
            </Typography>
            <Typography
              variant="caption"
              color="text.secondary"
              noWrap
              title={highlightRoot.rev.message}
              sx={{ maxWidth: 150, minWidth: 0, flexShrink: 1 }}
            >
              {highlightRoot.rev.message}
            </Typography>
          </>
        ) : (
          <Typography variant="caption" color="text.secondary">
            Checked-out branch
          </Typography>
        )}
        <FormControl size="small" sx={{ minWidth: 150 }}>
          <Select
            data-testid="graph-scope-select"
            value={options.scope}
            onOpen={bar.menuProps.onOpen}
            onClose={bar.menuProps.onClose}
            onChange={(e) => setGraphOptions({ scope: e.target.value as HighlightScope })}
            inputProps={{ "aria-label": "Highlight scope" }}
            sx={{ fontSize: 12, "& .MuiSelect-select": { py: 0.5 } }}
          >
            <MenuItem value="all">All ancestors</MenuItem>
            <MenuItem value="first-parent">First parent only</MenuItem>
          </Select>
        </FormControl>
        <ToggleButton
          size="small"
          value="ring"
          selected={options.ring}
          onChange={() => setGraphOptions({ ring: !options.ring })}
          data-testid="graph-ring-toggle"
          sx={TOGGLE_SX}
        >
          Ring
        </ToggleButton>
        <ToggleButton
          size="small"
          value="dim"
          selected={options.dim}
          onChange={() => setGraphOptions({ dim: !options.dim })}
          data-testid="graph-dim-toggle"
          sx={TOGGLE_SX}
        >
          Dim others
        </ToggleButton>
        {temporary && (
          <>
            <Divider orientation="vertical" flexItem sx={{ height: 18, alignSelf: "center" }} />
            <Button
              size="small"
              variant="outlined"
              data-testid="graph-ancestry-exit"
              onClick={onExitHighlight}
              sx={{
                ...TOGGLE_SX,
                minWidth: 0,
                fontWeight: 600,
                color: AMBER,
                borderColor: AMBER_BORDER,
                bgcolor: AMBER_BG,
                "&:hover": { borderColor: AMBER, bgcolor: AMBER_BG },
              }}
            >
              Exit
              <Kbd>Esc</Kbd>
            </Button>
          </>
        )}
        <Divider orientation="vertical" flexItem sx={{ height: 18, alignSelf: "center" }} />
        <PersonOutlinedIcon fontSize="small" sx={{ color: "text.secondary" }} />
        {selectedAuthor ? (
          <>
            <Typography variant="caption" noWrap sx={{ fontWeight: 600 }} data-testid="graph-author-name">
              {selectedAuthor}
            </Typography>
            <Typography variant="caption" color="text.secondary" data-testid="graph-author-count">
              {count.n} of {count.total}
            </Typography>
          </>
        ) : (
          <Typography variant="caption" color="text.secondary" data-testid="graph-author-name">
            Author
          </Typography>
        )}
        <ToggleButton
          size="small"
          value="author-mark"
          selected={options.authorMark}
          onChange={() => setGraphOptions({ authorMark: !options.authorMark })}
          data-testid="graph-author-mark"
          sx={TOGGLE_SX}
        >
          Mark
        </ToggleButton>
      </Box>
    </Box>
  )
})
