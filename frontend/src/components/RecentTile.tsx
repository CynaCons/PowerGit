import CallSplitIcon from "@mui/icons-material/CallSplit"
import CloseIcon from "@mui/icons-material/Close"
import Box from "@mui/material/Box"
import IconButton from "@mui/material/IconButton"
import { alpha } from "@mui/material/styles"
import type { RepoInfo } from "../engine"
import { MONO_FONT, light } from "../theme"
import { pathParts, repoInitials, repoPalette, sliceRange, type MatchRange, type RecentMatch } from "./recentsModel"

type Props = {
  repo: RepoInfo
  match: RecentMatch
  /** The prefix every listed root shares (recentsModel.sharedRoot): dimmed. */
  shared: string
  /** Position in the visible list; the first nine carry a key hint. */
  index: number
  cursor: boolean
  openNow: boolean
  onOpen: () => void
  onForget?: () => void
}

// One tile of the Recent repositories picker (v0.18.7, prototype C): the
// disc is the one bold element — initials from the name, colour from a
// stable hash of the path onto the six ref-badge pairs, the author-disc
// device of v0.18.1 — then the name at 500 with the branch chip and "open
// now", the path's tail in the code face with the shared root dimmed, the
// 1–9 hint in the corner that gives way to the cross. Hairlines come from
// the grid's gap, not from borders; the cursor tile wears the selection
// band. Every class toggled at runtime (cursor) sets its colours itself
// (docs/agents/memories/webkitgtk-css.md).
//
// Sizes (v0.18.9, owner: "larger so that we can actually read the stuff on
// the cards"): 96 px tall, 16 px side padding, a 36 px disc with 13 px
// initials, the name at 14 px / 500, the branch chip one size up from the
// grid's (11 px), the path at 12 px; the tile is never narrower than 340 px
// (RecentsDialog's grid), where a 20-character name and the chip fit whole.
export function RecentTile({ repo, match, shared, index, cursor, openNow, onOpen, onForget }: Props) {
  const palette = repoPalette(repo.root)
  const parts = pathParts(repo.root, shared)
  const key = index < 9 ? String(index + 1) : ""
  return (
    <Box
      data-testid="recent-card"
      data-root={repo.root}
      data-cursor={cursor ? "true" : undefined}
      role="option"
      aria-selected={cursor}
      onClick={onOpen}
      sx={{
        position: "relative",
        display: "grid",
        gridTemplateColumns: "36px 1fr auto",
        gridTemplateRows: "auto auto",
        columnGap: "12px",
        rowGap: "3px",
        minHeight: 96,
        px: 2,
        py: 1.75,
        cursor: "default",
        borderLeft: "2px solid transparent",
        bgcolor: cursor ? "var(--pg-grid-sel, #dbeafe)" : "background.paper",
        borderLeftColor: cursor ? "var(--pg-grid-sel-border, #2563eb)" : "transparent",
        color: "text.primary",
        "&:hover": {
          bgcolor: cursor ? "var(--pg-grid-sel, #dbeafe)" : "var(--pg-grid-hover, rgba(37, 99, 235, 0.08))",
        },
        "& .recent-forget": { visibility: cursor ? "visible" : "hidden" },
        "&:hover .recent-forget": { visibility: "visible" },
        "& .recent-key": { visibility: cursor ? "hidden" : "visible" },
        "&:hover .recent-key": { visibility: "hidden" },
      }}
    >
      <Box
        component="span"
        data-testid="recent-disc"
        data-palette={palette}
        aria-hidden
        sx={{
          gridRow: "1 / span 2",
          width: 36,
          height: 36,
          mt: "2px",
          borderRadius: "50%",
          display: "grid",
          placeItems: "center",
          fontSize: 13,
          fontWeight: 700,
          letterSpacing: "0.02em",
          userSelect: "none",
          bgcolor: `var(--pg-ref-${palette}-bg, ${light.ref[palette].bg})`,
          color: `var(--pg-ref-${palette}-fg, ${light.ref[palette].fg})`,
        }}
      >
        {repoInitials(repo.name)}
      </Box>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, minWidth: 0, fontSize: 14, fontWeight: 500 }}>
        <Box
          component="span"
          data-testid="recent-name"
          sx={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flexShrink: 1, minWidth: "12ch" }}
        >
          <Marked text={repo.name} range={match.name} />
        </Box>
        {repo.branch && (
          // The chip gives way before the name does (the shrink factor is
          // the name's many times over): a long branch truncates first, the
          // name only under its 12 ch. One size up from the grid's 10 px
          // `.ref`, as the Commit tab's `.ref.big` is.
          <Box
            component="span"
            className="ref"
            data-testid="recent-branch"
            title={repo.branch}
            sx={{
              minWidth: 0,
              flexShrink: 100,
              height: 18,
              fontSize: 11,
              "& .ref-cloud": { fontSize: "12px !important" },
            }}
          >
            <CallSplitIcon className="ref-cloud" />
            <Box component="span" sx={{ overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }}>
              <Marked text={repo.branch} range={match.branch} />
            </Box>
          </Box>
        )}
      </Box>
      <Box
        component="span"
        className="recent-key"
        aria-hidden
        sx={{
          gridColumn: 3,
          fontFamily: MONO_FONT,
          fontSize: 12,
          lineHeight: "20px",
          color: cursor ? "primary.main" : "text.disabled",
        }}
      >
        {key}
      </Box>
      <Box
        sx={{
          gridColumn: "2 / span 2",
          display: "flex",
          alignItems: "baseline",
          gap: 1,
          minWidth: 0,
          fontFamily: MONO_FONT,
          fontSize: 12,
          fontVariantNumeric: "tabular-nums",
          color: "var(--pg-text-meta, #5b6778)",
          whiteSpace: "nowrap",
        }}
      >
        <Box
          data-testid="recent-path"
          title={repo.root}
          sx={{
            minWidth: 0,
            overflow: "hidden",
            textOverflow: "ellipsis",
            // Ellipsis from the left: the tail is what tells two repositories
            // apart, so it is the part that must survive a narrow tile. The
            // bdi keeps the path's own order inside the rtl box.
            direction: "rtl",
            textAlign: "left",
          }}
        >
          <bdi style={{ unicodeBidi: "plaintext" }}>
            <Box component="span" sx={{ color: "text.disabled" }}>
              <Marked text={parts.shared} range={sliceRange(match.root, 0, parts.shared.length)} />
            </Box>
            <Marked text={parts.mid} range={sliceRange(match.root, parts.shared.length, parts.mid.length)} />
            <Box component="span" sx={{ color: "text.secondary" }}>
              <Marked
                text={parts.tail}
                range={sliceRange(match.root, parts.shared.length + parts.mid.length, parts.tail.length)}
              />
            </Box>
          </bdi>
        </Box>
        {openNow && (
          <Box component="span" data-testid="recent-open-now" sx={{ flex: "none" }}>
            open now
          </Box>
        )}
      </Box>
      {onForget && (
        <IconButton
          className="recent-forget"
          size="small"
          aria-label={`Remove ${repo.name} from recent repositories`}
          title="Remove from recent repositories"
          data-testid="recent-forget"
          tabIndex={-1}
          onClick={(e) => {
            e.stopPropagation()
            onForget()
          }}
          sx={{
            position: "absolute",
            top: 8,
            right: 8,
            width: 22,
            height: 22,
            p: 0,
            color: "text.secondary",
            borderRadius: "4px",
          }}
        >
          <CloseIcon sx={{ fontSize: 15 }} />
        </IconButton>
      )}
    </Box>
  )
}

/** `text` with the match range (recentsModel.findMatch) painted. */
function Marked({ text, range }: { text: string; range: MatchRange | null }) {
  if (!range) return <>{text}</>
  return (
    <>
      {text.slice(0, range.start)}
      <Box
        component="mark"
        data-testid="recent-match"
        sx={{
          bgcolor: (t) => alpha(t.palette.primary.main, t.palette.mode === "dark" ? 0.28 : 0.16),
          color: "inherit",
          borderRadius: "2px",
        }}
      >
        {text.slice(range.start, range.end)}
      </Box>
      {text.slice(range.end)}
    </>
  )
}
