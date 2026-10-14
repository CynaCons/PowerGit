import SearchIcon from "@mui/icons-material/Search"
import Box from "@mui/material/Box"
import Button from "@mui/material/Button"
import InputBase from "@mui/material/InputBase"
import Link from "@mui/material/Link"
import ToggleButton from "@mui/material/ToggleButton"
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup"
import Typography from "@mui/material/Typography"
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react"
import type { RepoPeek, WorkspaceInfo, WorktreeInfo } from "../engine"
import { paneSx } from "../theme/panels"
import { sharedRoot } from "./recentsModel"
import { StartPaneCard } from "./StartPaneCard"
import { useDelayedForget } from "./useDelayedForget"
import { buildCards, cardKey, type CardSort } from "./workspaceCards"

// The recent repositories, fourth pass (v0.20.10, option E of
// docs/prototypes/recents-v4.html). Owner (2026-10-13): "would be better able
// to handle work trees … I would like to more easily find my work trees … or
// maybe we can try something that would be based on cards" → "Let's go with
// option E." One card per repository with all its worktrees, opened or not;
// one click opens a worktree's history (owner, 2026-10-12: "When the user has
// gone to the extent that he has selected a project, he wants to read the
// history of that project"). The keys of the earlier passes stay: the filter
// has the focus, the arrows walk, Enter and 1–9 open, Delete removes with
// Undo, Escape clears then closes.

export type StartPaneProps = {
  workspaces: WorkspaceInfo[]
  peeks: Map<string, RepoPeek>
  currentRoot?: string | null
  onOpen: (root: string) => void
  onForget: (root: string) => void
  onPin: (root: string, pinned: boolean) => void
  onOpenFolder: () => void
  onTerminal: (root: string) => void
  onCopyPath: (root: string) => void
  onClose: () => void
}

export function StartPane(props: StartPaneProps) {
  const [query, setQuery] = useState("")
  const [sort, setSort] = useState<CardSort>("recent")
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set())
  const [cursorAt, setCursorAt] = useState(0)
  const input = useRef<HTMLInputElement>(null)
  const gridRef = useRef<HTMLDivElement>(null)
  const { pending, forget, undo } = useDelayedForget(props.onForget)
  const { cards, rows, total } = useMemo(
    () => buildCards(props.workspaces, query, sort, expanded, pending?.root ?? null),
    [props.workspaces, query, sort, expanded, pending],
  )
  const prefix = useMemo(
    () => sharedRoot(props.workspaces.flatMap((w) => w.worktrees.map((t) => t.root))),
    [props.workspaces],
  )
  const cursor = Math.min(cursorAt, Math.max(0, rows.length - 1))
  const selected = rows[cursor]?.tree ?? null
  useEffect(() => input.current?.focus(), [])
  useEffect(() => {
    gridRef.current?.querySelector('[data-cursor="true"]')?.scrollIntoView({ block: "nearest" })
  }, [selected?.root])

  const remove = (tree: WorktreeInfo) =>
    forget({ name: tree.name, root: tree.root, branch: tree.branch ?? "", id: tree.id ?? "" })
  const move = (event: KeyboardEvent, to: number) => {
    event.preventDefault()
    setCursorAt(Math.max(0, Math.min(rows.length - 1, to)))
  }
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.ctrlKey || event.altKey || event.metaKey) return
    if (event.key === "ArrowDown") return move(event, cursor + 1)
    if (event.key === "ArrowUp") return move(event, cursor - 1)
    if (event.key === "Enter" && selected) {
      event.preventDefault()
      return props.onOpen(selected.root)
    }
    if (event.key === "Delete" && !query && selected?.lastOpened) return remove(selected)
    if (event.key === "Escape") {
      event.preventDefault()
      if (query) {
        setQuery("")
        setCursorAt(0)
      } else props.onClose()
      return
    }
    if (/^[1-9]$/.test(event.key) && !(event.target === input.current && query)) {
      event.preventDefault()
      const tree = rows[Number(event.key) - 1]?.tree
      if (tree) props.onOpen(tree.root)
    }
  }
  const repos = cards.length
  const count =
    rows.length === total && !query
      ? `${total} ${total === 1 ? "worktree" : "worktrees"} in ${props.workspaces.length} ${props.workspaces.length === 1 ? "repository" : "repositories"}`
      : `${rows.length} of ${total} in ${repos} ${repos === 1 ? "repository" : "repositories"}`

  let offset = 0
  return (
    <Box
      data-testid="start-pane"
      onKeyDown={onKeyDown}
      sx={{ ...paneSx, display: "flex", flexDirection: "column", minHeight: 0, height: "100%", color: "text.primary" }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1.25,
          px: 1.75,
          py: 1.25,
          borderBottom: 1,
          borderColor: "divider",
        }}
      >
        <Box
          sx={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            gap: 1,
            height: 32,
            px: 1.25,
            border: 1,
            borderColor: "divider",
            borderRadius: "6px",
          }}
        >
          <SearchIcon sx={{ fontSize: 17, color: "text.secondary" }} />
          <InputBase
            inputRef={input}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
              setCursorAt(0)
            }}
            placeholder="Filter by name, branch or path"
            inputProps={{
              "data-testid": "start-filter",
              "aria-label": "Filter repositories and worktrees",
              autoComplete: "off",
              spellCheck: false,
            }}
            sx={{ flex: 1, fontSize: 13.5 }}
          />
        </Box>
        <ToggleButtonGroup
          size="small"
          exclusive
          value={sort}
          onChange={(_, value: CardSort | null) => value && setSort(value)}
          aria-label="Order of the repositories"
        >
          <ToggleButton value="recent" data-testid="start-sort-recent" sx={{ py: 0.4, px: 1.25, fontSize: 12.5 }}>
            Recent
          </ToggleButton>
          <ToggleButton value="az" data-testid="start-sort-az" sx={{ py: 0.4, px: 1.25, fontSize: 12.5 }}>
            A–Z
          </ToggleButton>
        </ToggleButtonGroup>
        <Button variant="contained" size="small" onClick={props.onOpenFolder} data-testid="start-open-folder">
          Open folder…
        </Button>
      </Box>
      <Box
        ref={gridRef}
        role="listbox"
        aria-label="Repositories and worktrees"
        sx={{
          flex: 1,
          minHeight: 0,
          overflow: "auto",
          p: 1.75,
          // The cards sit on a well a step below them (v0.21.6, owner: "different
          // contrast between the background panel and the cards").
          bgcolor: "var(--pg-well)",
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(360px, 1fr))",
          // Each row of cards as tall as its tallest card: the cards clip
          // their corners (overflow hidden), which lets a fixed-height grid
          // squeeze auto rows below their content and stack the cards over
          // one another. The grid scrolls instead.
          gridAutoRows: "max-content",
          gap: 1.75,
          alignContent: "start",
        }}
      >
        {cards.map((card) => {
          const start = offset
          offset += card.rows.length
          return (
            <StartPaneCard
              key={cardKey(card.repo)}
              card={card}
              offset={start}
              cursor={cursor}
              peeks={props.peeks}
              currentRoot={props.currentRoot ?? null}
              prefix={prefix}
              onUnfold={() => setExpanded(new Set([...expanded, cardKey(card.repo)]))}
              onOpen={props.onOpen}
              onPin={(tree) => props.onPin(tree.root, !tree.pinned)}
              onForget={remove}
              onTerminal={props.onTerminal}
              onCopyPath={props.onCopyPath}
            />
          )
        })}
        {rows.length === 0 && (
          <Box data-testid="start-empty" sx={{ p: 1, color: "text.secondary", gridColumn: "1 / -1" }}>
            <Typography sx={{ fontSize: 13.5, fontWeight: 600, color: "text.primary" }}>
              {total ? `Nothing matches "${query.trim()}"` : "No repositories yet"}
            </Typography>
            {total ? "The filter looks at names, branches and paths." : "Open a folder to list it here."}
          </Box>
        )}
      </Box>
      <Box
        sx={{
          height: 34,
          px: 1.75,
          borderTop: 1,
          borderColor: "divider",
          display: "flex",
          alignItems: "center",
          fontSize: 12.5,
          color: "text.secondary",
        }}
      >
        {pending && (
          <span>
            Removed {pending.name} ·{" "}
            <Link component="button" data-testid="start-undo" onClick={undo} sx={{ font: "inherit", fontWeight: 500 }}>
              Undo
            </Link>
          </span>
        )}
        <Box sx={{ flex: 1 }} />
        <span data-testid="start-count">{count}</span>
      </Box>
    </Box>
  )
}
