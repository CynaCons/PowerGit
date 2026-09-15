import TuneIcon from "@mui/icons-material/Tune"
import Box from "@mui/material/Box"
import Checkbox from "@mui/material/Checkbox"
import FormControl from "@mui/material/FormControl"
import MenuItem from "@mui/material/MenuItem"
import Select from "@mui/material/Select"
import ToggleButton from "@mui/material/ToggleButton"
import Tooltip from "@mui/material/Tooltip"
import Typography from "@mui/material/Typography"
import type { DiffOptions } from "../engine"
import { setCodeWrap, useCodeWrap } from "./codeWrap"
import { useFloatingBar } from "./floatingBar"

type Props =
  | {
      wrapOnly?: false
      options: DiffOptions
      onChange: (options: DiffOptions) => void
    }
  | {
      /** The blob pane (v0.18.8): the same pill reduced to Wrap lines; there are no diff options for a file. */
      wrapOnly: true
      options?: undefined
      onChange?: undefined
    }

const CONTEXT_CHOICES = [0, 3, 6, 10, 25]

// The graph pill's ToggleButton style (GraphOptionsBar TOGGLE_SX).
const TOGGLE_SX = { py: 0.25, px: 1, fontSize: 12, textTransform: "none", whiteSpace: "nowrap" } as const

// Git Extensions FileViewer diff options, as a floating bottom-center bar:
// a compact translucent pill at rest, an opaque toolbar while the pointer
// is inside or one of its menus is open (see floatingBar.ts). v0.18.8 adds
// Wrap lines after Ignore whitespace: one remembered switch (codeWrap.ts)
// shared by every code view, so the Diff tab, the commit window and the
// file history get it through this component and the blob pane mounts it
// with `wrapOnly`. Wrapping is presentation: it is not a DiffOptions field
// and never re-requests the diff.
export function DiffOptionsBar({ options, onChange, wrapOnly }: Props) {
  const bar = useFloatingBar()
  const { expanded } = bar
  const wrap = useCodeWrap()

  return (
    <Box
      ref={bar.rootRef}
      data-testid="diff-options-bar"
      data-expanded={expanded ? "true" : "false"}
      {...bar.rootProps}
      sx={{
        position: "absolute",
        left: "50%",
        bottom: 10,
        transform: "translateX(-50%)",
        zIndex: 5,
        bgcolor: expanded ? "background.paper" : "transparent",
        border: expanded ? 1 : 0,
        borderColor: "divider",
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
      <Tooltip title={bar.pinned ? "Unpin view options" : wrapOnly ? "View options" : "Diff options"}>
        <TuneIcon
          fontSize="small"
          onClick={bar.togglePinned}
          sx={{ color: bar.pinned ? "primary.main" : "text.secondary", cursor: "pointer" }}
        />
      </Tooltip>
      {/* Kept mounted: an open Select must never be torn down by the bar. */}
      <Box sx={{ display: expanded ? "flex" : "none", alignItems: "center", gap: 1 }}>
        {!wrapOnly && (
          <>
            <Typography variant="caption" color="text.secondary">
              Context
            </Typography>
            <FormControl size="small" sx={{ minWidth: 86 }}>
              <Select
                data-testid="diff-context-select"
                value={options.full ? "full" : String(options.context)}
                onOpen={bar.menuProps.onOpen}
                onClose={bar.menuProps.onClose}
                onChange={(e) => {
                  const v = e.target.value
                  onChange(v === "full" ? { ...options, full: true } : { ...options, full: false, context: Number(v) })
                }}
                sx={{ "& .MuiSelect-select": { py: 0.25, fontSize: 12 } }}
              >
                {CONTEXT_CHOICES.map((c) => (
                  <MenuItem key={c} value={String(c)}>
                    {c} lines
                  </MenuItem>
                ))}
                <MenuItem value="full">Full file</MenuItem>
              </Select>
            </FormControl>
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.25 }}>
              <Checkbox
                size="small"
                checked={options.ws}
                onChange={(e) => onChange({ ...options, ws: e.target.checked })}
                sx={{ py: 0.25 }}
              />
              <Typography variant="caption">Ignore whitespace</Typography>
            </Box>
          </>
        )}
        <ToggleButton
          size="small"
          value="wrap"
          selected={wrap}
          onChange={() => setCodeWrap(!wrap)}
          data-testid="diff-wrap-toggle"
          sx={TOGGLE_SX}
        >
          Wrap lines
        </ToggleButton>
      </Box>
    </Box>
  )
}
