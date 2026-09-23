import SearchIcon from "@mui/icons-material/Search"
import StarBorderIcon from "@mui/icons-material/StarBorder"
import StarIcon from "@mui/icons-material/Star"
import Box from "@mui/material/Box"
import IconButton from "@mui/material/IconButton"
import InputBase from "@mui/material/InputBase"
import Link from "@mui/material/Link"
import Typography from "@mui/material/Typography"
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react"
import type { RecentInfo, RepoPeek } from "../engine"
import { StartPaneDetail } from "./StartPaneDetail"
import { matchRecent, type RecentMatch } from "./recentsModel"
import { groupRecents, relativeTime } from "./startPaneModel"
import { Branch, Marked } from "./StartPaneMarks"
import { useDelayedForget } from "./useDelayedForget"
import { paneSx } from "../theme/panels"

export type StartPaneProps = {
  recents: RecentInfo[]
  peeks: Map<string, RepoPeek>
  detail: RepoPeek | null
  currentRoot?: string | null
  onSelect: (root: string) => void
  onOpen: (root: string) => void
  onForget: (root: string) => void
  onPin: (root: string, pinned: boolean) => void
  onOpenFolder: () => void
  onTerminal: (root: string) => void
  onCopyPath: (root: string) => void
  onClose: () => void
}

type Visible = { repo: RecentInfo; match: RecentMatch }

export function StartPane(props: StartPaneProps) {
  const [query, setQuery] = useState("")
  const [cursorAt, setCursorAt] = useState(0)
  const input = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const { pending, forget, undo } = useDelayedForget(props.onForget)
  const visible = useMemo<Visible[]>(
    () =>
      props.recents.flatMap((repo) => {
        if (pending?.root === repo.root) return []
        const match = matchRecent(repo, query)
        return match ? [{ repo, match }] : []
      }),
    [pending, props.recents, query],
  )
  const cursor = Math.min(cursorAt, Math.max(0, visible.length - 1))
  const selected = visible[cursor]?.repo ?? null
  useEffect(() => input.current?.focus(), [])
  useEffect(() => {
    if (selected) props.onSelect(selected.root)
    listRef.current?.querySelector('[data-cursor="true"]')?.scrollIntoView({ block: "nearest" })
  }, [selected?.root]) // eslint-disable-line react-hooks/exhaustive-deps

  const move = (event: KeyboardEvent, to: number) => {
    event.preventDefault()
    setCursorAt(Math.max(0, Math.min(visible.length - 1, to)))
  }
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.ctrlKey || event.altKey || event.metaKey) return
    if (event.key === "ArrowDown") return move(event, cursor + 1)
    if (event.key === "ArrowUp") return move(event, cursor - 1)
    if (event.key === "Enter" && selected) {
      event.preventDefault()
      return props.onOpen(selected.root)
    }
    if (event.key === "Delete" && !query && selected) return forget(selected)
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
      const repo = visible[Number(event.key) - 1]?.repo
      if (repo) props.onOpen(repo.root)
    }
  }
  const groups = groupRecents(visible.map((hit) => hit.repo))
  const total = props.recents.length - (pending ? 1 : 0)
  const count =
    visible.length === total
      ? `${total} ${total === 1 ? "repository" : "repositories"}`
      : `${visible.length} of ${total}`

  return (
    <Box
      data-testid="start-pane"
      onKeyDown={onKeyDown}
      sx={{
        ...paneSx,
        display: "grid",
        // The list gives way before the preview does when the content
        // area is narrow — a 150 % zoom leaves about 960 px for both.
        gridTemplateColumns: "minmax(232px, min(330px, 34%)) minmax(0, 1fr)",
        minHeight: 0,
        height: "100%",
        color: "text.primary",
      }}
    >
      <Box
        sx={{
          borderRight: 1,
          borderColor: "divider",
          display: "flex",
          flexDirection: "column",
          minHeight: 0,
          // Paper, like the graph (v0.20.8): on the sunken grey the paper-white
          // cursor row read as the ordinary one and the rest as greyed out.
          bgcolor: "background.paper",
        }}
      >
        <Box
          sx={{
            height: 44,
            px: 1.5,
            display: "flex",
            alignItems: "center",
            gap: 1.25,
            borderBottom: 1,
            borderColor: "divider",
            bgcolor: "background.paper",
          }}
        >
          <SearchIcon sx={{ fontSize: 17, color: "text.secondary" }} />
          <InputBase
            autoFocus
            inputRef={input}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
              setCursorAt(0)
            }}
            placeholder="Filter"
            inputProps={{
              "data-testid": "start-filter",
              "aria-label": "Filter recent repositories",
              autoComplete: "off",
              spellCheck: false,
            }}
            sx={{ flex: 1, fontSize: 13.5 }}
          />
        </Box>
        <Box ref={listRef} role="listbox" sx={{ flex: 1, minHeight: 0, overflow: "auto" }}>
          {groups.map((group) => (
            <Box key={group.label}>
              <Box
                data-testid="start-group"
                sx={{
                  position: "sticky",
                  top: 0,
                  zIndex: 1,
                  height: 26,
                  mt: 0.75,
                  px: 1.5,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  bgcolor: "var(--pg-surface-sunken, #f6f8fb)",
                  color: "text.secondary",
                  fontSize: 11,
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: ".05em",
                }}
              >
                <span>{group.label}</span>
                <span>{group.items.length}</span>
              </Box>
              {group.items.map((repo) => {
                const index = visible.findIndex((hit) => hit.repo.root === repo.root)
                return (
                  <StartRow
                    key={repo.root}
                    repo={repo}
                    match={visible[index].match}
                    peek={props.peeks.get(repo.root)}
                    current={repo.root === props.currentRoot}
                    cursor={index === cursor}
                    onChoose={() => setCursorAt(index)}
                    onOpen={() => props.onOpen(repo.root)}
                    onPin={() => props.onPin(repo.root, !repo.pinned)}
                  />
                )
              })}
            </Box>
          ))}
          {visible.length === 0 && (
            <Box data-testid="start-empty" sx={{ p: 2.25, color: "text.secondary" }}>
              <Typography sx={{ fontSize: 13.5, fontWeight: 600, color: "text.primary" }}>
                {props.recents.length ? `Nothing matches "${query.trim()}"` : "No repositories yet"}
              </Typography>
              {props.recents.length
                ? "Try part of the path or the branch name."
                : "Open a folder and it will be listed here next time."}
            </Box>
          )}
        </Box>
        <Box
          sx={{
            height: 34,
            px: 1.5,
            borderTop: 1,
            borderColor: "divider",
            display: "flex",
            alignItems: "center",
            fontSize: 12.5,
            color: "text.secondary",
          }}
        >
          {pending ? (
            <span>
              Removed {pending.name} ·{" "}
              <Link
                component="button"
                data-testid="start-undo"
                onClick={undo}
                sx={{ font: "inherit", fontWeight: 500 }}
              >
                Undo
              </Link>
            </span>
          ) : (
            <Link
              component="button"
              data-testid="start-open-folder"
              onClick={props.onOpenFolder}
              sx={{ font: "inherit", fontWeight: 500 }}
            >
              Open folder…
            </Link>
          )}
          <Box sx={{ flex: 1 }} />
          <span data-testid="start-count">{count}</span>
        </Box>
      </Box>
      <StartPaneDetail
        repo={selected}
        peek={props.detail ?? (selected ? (props.peeks.get(selected.root) ?? null) : null)}
        current={selected?.root === props.currentRoot}
        onOpen={props.onOpen}
        onForget={forget}
        onTerminal={props.onTerminal}
        onCopyPath={props.onCopyPath}
      />
    </Box>
  )
}

function StartRow({
  repo,
  match,
  peek,
  current,
  cursor,
  onChoose,
  onOpen,
  onPin,
}: {
  repo: RecentInfo
  match: RecentMatch
  peek?: RepoPeek
  current: boolean
  cursor: boolean
  onChoose: () => void
  onOpen: () => void
  onPin: () => void
}) {
  return (
    <Box
      data-testid="start-row"
      data-root={repo.root}
      data-cursor={cursor ? "true" : undefined}
      role="option"
      aria-selected={cursor}
      onClick={onChoose}
      onDoubleClick={onOpen}
      sx={{
        // Four cells and a star: the name and when it was last opened on the
        // first line, the branch and the repository's state on the second.
        // Owner on v0.20.3: "The 'xx min ago' is on the same line as the
        // branch name. They overlap. Better split" — a long branch used to
        // run under the time, because a `.ref` chip does not clip its text.
        display: "grid",
        gridTemplateColumns: "minmax(0, 1fr) auto 22px",
        gridTemplateRows: "auto auto",
        alignItems: "center",
        columnGap: 1,
        rowGap: "2px",
        py: 0.875,
        pr: 1.25,
        pl: 1.5,
        // The cursor row wears the graph's selection (owner on v0.20.7: "the
        // colors are swapped between selection and non-selection"), and a
        // hairline parts every row from the next.
        borderLeft: "2px solid",
        borderLeftColor: cursor ? "var(--pg-grid-sel-border, #2563eb)" : "transparent",
        borderBottom: "1px solid var(--pg-border-soft, #e6eaf0)",
        bgcolor: cursor ? "var(--pg-grid-sel, #dbeafe)" : "transparent",
        color: "text.primary",
        cursor: "default",
        "&:hover": {
          bgcolor: cursor ? "var(--pg-grid-sel, #dbeafe)" : "var(--pg-grid-hover, rgba(37, 99, 235, 0.08))",
        },
      }}
    >
      <Box
        sx={{
          gridArea: "1 / 1",
          fontSize: 13.5,
          fontWeight: 600,
          minWidth: 0,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        <Marked text={repo.name} range={match.name} />
      </Box>
      <Box
        data-testid="start-when"
        sx={{ gridArea: "1 / 2", fontSize: 11.5, color: "text.secondary", whiteSpace: "nowrap", justifySelf: "end" }}
      >
        {relativeTime(repo.lastOpened)}
      </Box>
      <Box sx={{ gridArea: "2 / 1", display: "flex", minWidth: 0 }}>
        <Branch text={peek?.branch ?? repo.branch} range={match.branch} />
      </Box>
      <Box sx={{ gridArea: "2 / 2", fontSize: 11, color: "text.secondary", whiteSpace: "nowrap", justifySelf: "end" }}>
        {current ? "open now" : stateText(peek)}
      </Box>
      <IconButton
        data-testid="start-pin"
        aria-label={repo.pinned ? `Unpin ${repo.name}` : `Pin ${repo.name}`}
        size="small"
        onClick={(event) => {
          event.stopPropagation()
          onPin()
        }}
        sx={{
          gridArea: "1 / 3 / span 2",
          alignSelf: "center",
          width: 22,
          height: 22,
          color: repo.pinned ? "primary.main" : "text.secondary",
        }}
      >
        {repo.pinned ? <StarIcon sx={{ fontSize: 16 }} /> : <StarBorderIcon sx={{ fontSize: 16 }} />}
      </IconButton>
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
