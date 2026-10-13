import CloseIcon from "@mui/icons-material/Close"
import ContentCopyIcon from "@mui/icons-material/ContentCopy"
import StarBorderIcon from "@mui/icons-material/StarBorder"
import StarIcon from "@mui/icons-material/Star"
import TerminalIcon from "@mui/icons-material/Terminal"
import Box from "@mui/material/Box"
import IconButton from "@mui/material/IconButton"
import type { ReactNode } from "react"
import type { RepoPeek, WorktreeInfo } from "../engine"
import { repoInitials, repoPalette, sliceRange } from "./recentsModel"
import { relativeTime } from "./startPaneModel"
import { Branch, Marked } from "./StartPaneMarks"
import type { Card, CardRow } from "./workspaceCards"

// One repository card of the start pane (v0.20.10, option E of
// docs/prototypes/recents-v4.html): the repository on top, its worktrees
// under it. A click on a worktree opens it.

export type RowActions = {
  onOpen: (root: string) => void
  onPin: (tree: WorktreeInfo) => void
  onForget: (tree: WorktreeInfo) => void
  onTerminal: (root: string) => void
  onCopyPath: (root: string) => void
}

type Props = RowActions & {
  card: Card
  /** The index of the card's first row among all rows, for the cursor. */
  offset: number
  cursor: number
  peeks: Map<string, RepoPeek>
  currentRoot: string | null
  /** What every path on the pane starts with, painted fainter. */
  prefix: string
  onUnfold: () => void
}

export function StartPaneCard({ card, offset, cursor, peeks, currentRoot, prefix, onUnfold, ...actions }: Props) {
  const { repo } = card
  const count = repo.worktrees.length
  return (
    <Box
      data-testid="start-card"
      data-repo={repo.name}
      sx={{
        border: 1,
        borderColor: "divider",
        borderRadius: "8px",
        overflow: "hidden",
        bgcolor: "background.paper",
        boxShadow: "var(--pg-card-shadow)",
        alignSelf: "start",
        minWidth: 0,
      }}
    >
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: "30px minmax(0, 1fr) auto",
          columnGap: 1.25,
          alignItems: "center",
          px: 1.5,
          py: 1.25,
          borderBottom: 1,
          borderColor: "divider",
          bgcolor: "var(--pg-surface-sunken, #f6f8fb)",
        }}
      >
        <Box
          component="span"
          className="author-disc"
          data-palette={repoPalette(repo.mainRoot ?? repo.name)}
          sx={{ gridRow: "span 2", width: 30, height: 30, borderRadius: "7px", fontSize: 12 }}
        >
          {repoInitials(repo.name)}
        </Box>
        <Box sx={{ fontWeight: 700, fontSize: 15, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>
          {repo.name}
        </Box>
        <Box sx={{ fontSize: 12, color: "text.secondary", whiteSpace: "nowrap" }} data-testid="start-card-count">
          {count} {count === 1 ? "worktree" : "worktrees"}
        </Box>
        {repo.mainRoot && (
          <Box sx={{ gridColumn: "2 / 4", minWidth: 0 }}>
            <Path root={repo.mainRoot} prefix={prefix} />
          </Box>
        )}
      </Box>
      {card.rows.map((row, i) => (
        <WorktreeRow
          key={row.tree.root}
          row={row}
          index={offset + i}
          cursor={offset + i === cursor}
          peek={peeks.get(row.tree.root)}
          current={row.tree.root === currentRoot}
          prefix={prefix}
          {...actions}
        />
      ))}
      {card.hidden > 0 && (
        <Box
          component="button"
          type="button"
          data-testid="start-card-more"
          onClick={onUnfold}
          sx={{
            all: "unset",
            display: "block",
            width: "100%",
            boxSizing: "border-box",
            px: 1.5,
            py: 0.75,
            fontSize: 12.5,
            color: "primary.main",
            borderTop: 1,
            borderColor: "divider",
            cursor: "pointer",
            "&:hover": { bgcolor: "var(--pg-grid-hover)" },
          }}
        >
          + {card.hidden} more
        </Box>
      )}
    </Box>
  )
}

function WorktreeRow({
  row,
  index,
  cursor,
  peek,
  current,
  prefix,
  onOpen,
  onPin,
  onForget,
  onTerminal,
  onCopyPath,
}: RowActions & {
  row: CardRow
  index: number
  cursor: boolean
  peek?: RepoPeek
  current: boolean
  prefix: string
}) {
  const { tree, match } = row
  const opened = tree.lastOpened !== null
  const stop = (fn: () => void) => (event: React.MouseEvent) => {
    event.stopPropagation()
    fn()
  }
  return (
    <Box
      data-testid="start-row"
      data-root={tree.root}
      data-index={index}
      data-cursor={cursor ? "true" : undefined}
      data-never={opened ? undefined : "true"}
      role="option"
      aria-selected={cursor}
      onClick={() => onOpen(tree.root)}
      sx={{
        display: "grid",
        gridTemplateColumns: "minmax(0, 1fr) auto",
        gridTemplateRows: "auto auto auto",
        columnGap: 1.25,
        rowGap: "2px",
        px: 1.5,
        py: 0.875,
        borderLeft: "3px solid",
        borderLeftColor: cursor ? "var(--pg-grid-sel-border, #2563eb)" : "transparent",
        borderTop: "1px solid var(--pg-border-soft, #e6eaf0)",
        bgcolor: cursor ? "var(--pg-grid-sel, #dbeafe)" : "transparent",
        cursor: "pointer",
        "&:hover": { bgcolor: cursor ? "var(--pg-grid-sel, #dbeafe)" : "var(--pg-grid-hover)" },
        "&:hover .start-actions, & .start-actions:focus-within": { visibility: "visible" },
        "& > :not(.start-actions)": { opacity: opened ? 1 : 0.62 },
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, minWidth: 0 }}>
        <Box
          component="span"
          sx={{ fontWeight: 600, fontSize: 13.5, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}
        >
          <Marked text={tree.name} range={match.name} />
        </Box>
        {tree.main && <Tag>main</Tag>}
        {tree.pinned && <StarIcon sx={{ fontSize: 14, color: "primary.main" }} aria-label="pinned" />}
      </Box>
      <Box
        data-testid="start-when"
        sx={{
          fontSize: 11.5,
          color: "text.secondary",
          whiteSpace: "nowrap",
          justifySelf: "end",
          fontStyle: opened ? "normal" : "italic",
        }}
      >
        {opened ? relativeTime(tree.lastOpened ?? undefined) : "never opened"}
      </Box>
      <Box sx={{ display: "flex", minWidth: 0 }}>
        {tree.branch ? (
          <Branch text={tree.branch} range={match.branch} />
        ) : (
          <Box component="span" sx={{ fontSize: 11.5, color: "text.secondary" }}>
            detached{tree.head ? ` at ${tree.head.slice(0, 7)}` : ""}
          </Box>
        )}
      </Box>
      <Box sx={{ fontSize: 11.5, color: "text.secondary", whiteSpace: "nowrap", justifySelf: "end" }}>
        {current ? "open now" : stateText(peek)}
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <Path root={tree.root} prefix={prefix} range={match.root} />
      </Box>
      <Box
        className="start-actions"
        sx={{ display: "flex", justifySelf: "end", visibility: cursor ? "visible" : "hidden", gap: 0.25 }}
      >
        <Action
          label={tree.pinned ? `Unpin ${tree.name}` : `Pin ${tree.name}`}
          testid="start-pin"
          onClick={stop(() => onPin(tree))}
        >
          {tree.pinned ? <StarIcon sx={{ fontSize: 15 }} /> : <StarBorderIcon sx={{ fontSize: 15 }} />}
        </Action>
        <Action label={`Copy the path of ${tree.name}`} testid="start-copy" onClick={stop(() => onCopyPath(tree.root))}>
          <ContentCopyIcon sx={{ fontSize: 14 }} />
        </Action>
        <Action label={`Terminal in ${tree.name}`} testid="start-terminal" onClick={stop(() => onTerminal(tree.root))}>
          <TerminalIcon sx={{ fontSize: 15 }} />
        </Action>
        {opened && (
          <Action label={`Remove ${tree.name} from recents`} testid="start-remove" onClick={stop(() => onForget(tree))}>
            <CloseIcon sx={{ fontSize: 15 }} />
          </Action>
        )}
      </Box>
    </Box>
  )
}

function Action({
  label,
  testid,
  onClick,
  children,
}: {
  label: string
  testid: string
  onClick: (event: React.MouseEvent) => void
  children: ReactNode
}) {
  return (
    <IconButton
      size="small"
      aria-label={label}
      title={label}
      data-testid={testid}
      onClick={onClick}
      sx={{ width: 22, height: 22, color: "text.secondary" }}
    >
      {children}
    </IconButton>
  )
}

function Tag({ children }: { children: ReactNode }) {
  return (
    <Box
      component="span"
      data-testid="start-main"
      sx={{
        px: 0.75,
        borderRadius: "4px",
        fontSize: 10.5,
        fontWeight: 600,
        textTransform: "uppercase",
        letterSpacing: ".04em",
        bgcolor: "var(--pg-status-ok-bg, rgba(5, 150, 105, 0.12))",
        color: "var(--pg-status-ok, #047857)",
        flexShrink: 0,
      }}
    >
      {children}
    </Box>
  )
}

/** A path with the part every path on the pane shares painted fainter. */
function Path({
  root,
  prefix,
  range = null,
}: {
  root: string
  prefix: string
  range?: { start: number; end: number } | null
}) {
  const head = prefix && root.toLowerCase().startsWith(prefix.toLowerCase()) ? prefix.length : 0
  return (
    <Box
      component="span"
      data-testid="start-path"
      title={root}
      sx={{
        display: "block",
        font: "11.5px var(--pg-font-mono, monospace)",
        color: "text.secondary",
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
      }}
    >
      {head > 0 && (
        <Box component="span" sx={{ opacity: 0.6 }}>
          <Marked text={root.slice(0, head)} range={sliceRange(range, 0, head)} />
        </Box>
      )}
      <Marked text={root.slice(head)} range={sliceRange(range, head, root.length - head)} />
    </Box>
  )
}

function stateText(peek?: RepoPeek) {
  if (!peek || !peek.exists) return ""
  if (peek.changed) return `● ${peek.changed} changed`
  if (peek.ahead) return `↑ ${peek.ahead} ahead`
  if (peek.behind) return `↓ ${peek.behind} behind`
  return "clean"
}
