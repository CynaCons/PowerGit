import SearchIcon from "@mui/icons-material/Search"
import Box from "@mui/material/Box"
import Dialog from "@mui/material/Dialog"
import InputBase from "@mui/material/InputBase"
import Link from "@mui/material/Link"
import Typography from "@mui/material/Typography"
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from "react"
import type { RepoInfo } from "../engine"
import { useZoom } from "../theme"
import { Kbd } from "./Kbd"
import { RecentTile } from "./RecentTile"
import { matchRecent, sharedRoot, type RecentMatch } from "./recentsModel"

type Props = {
  open: boolean
  onClose: () => void
  recents: RepoInfo[]
  onPick: (path: string) => void
  /** The cross on a tile, or Delete on the cursor tile: drop it from the list for good — after the Undo window. */
  onForget?: (root: string) => void
  /** The repository that is open now; its tile says so instead of pretending it can be reopened. */
  currentRoot?: string | null
  /** "Open folder…" in the footer. */
  onOpenFolder?: () => void
  /** How long "Removed <name> · Undo" stays before the forget goes through (specs shorten it). */
  forgetDelayMs?: number
}

// The Recent repositories picker (v0.18.7, prototype C of
// docs/prototypes/recents.html; owner: "ok for C"). A flat window centred
// by MUI and sized to the screen — width min(1120 px, 100vw − 96 px),
// height min(720 px, 100vh − 96 px) — after the owner (2026-09-16): "the
// scale and size of the overlay is not good. Should be centered, and
// larger so that we can actually read the stuff on the cards" (v0.18.9;
// the 760 px panel pinned 80 px from the top was the command-palette
// anchor of the prototype). A search box with the focus, a hairline grid
// of as many 340 px-or-wider tiles as fit (three at 1120), a footer with
// the count, the key hints and Open folder…. The picker's state lives in
// RecentsPicker, which mounts with the dialog and dies with it: a fresh
// filter and cursor on every open without a reset effect, and the pending
// forget flushes on unmount so a close never loses it.
export function RecentsDialog({ open, onClose, ...picker }: Props) {
  // The theme zooms the paper itself (theme/index.ts), so the viewport
  // lengths divide by the zoom to stay in visual px, as the commit window does.
  const zoom = useZoom()
  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth={false}
      aria-label="Recent repositories"
      slotProps={{
        paper: {
          sx: {
            width: `min(1120px, calc((100vw - 96px) / ${zoom}))`,
            maxHeight: `min(720px, calc((100vh - 96px) / ${zoom}))`,
            display: "flex",
            flexDirection: "column",
          },
        },
      }}
    >
      <RecentsPicker onClose={onClose} {...picker} />
    </Dialog>
  )
}

type Visible = { repo: RepoInfo; match: RecentMatch }

function RecentsPicker({
  onClose,
  recents,
  onPick,
  onForget,
  currentRoot,
  onOpenFolder,
  forgetDelayMs = 5000,
}: Omit<Props, "open">) {
  const [query, setQuery] = useState("")
  const [cursorAt, setCursorAt] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const gridRef = useRef<HTMLDivElement>(null)
  const { pending, forget, undo } = useDelayedForget(onForget, forgetDelayMs)

  const shared = useMemo(() => sharedRoot(recents.map((r) => r.root)), [recents])
  const list = useMemo<Visible[]>(
    () =>
      recents.flatMap((repo) => {
        if (pending && pending.root === repo.root) return []
        const match = matchRecent(repo, query)
        return match ? [{ repo, match }] : []
      }),
    [recents, query, pending],
  )
  const cursor = Math.min(cursorAt, Math.max(0, list.length - 1))
  const trimmed = query.trim()

  // `autoFocus` alone loses in dev: StrictMode double-mounts MUI's FocusTrap,
  // whose cleanup hands the focus back to the rail button, and the remount
  // then lands on the paper. An effect of our own runs on the remount too.
  useEffect(() => {
    inputRef.current?.focus()
  }, [])
  useEffect(() => {
    gridRef.current?.querySelector('[data-cursor="true"]')?.scrollIntoView({ block: "nearest" })
  }, [cursor])

  const openAt = (i: number) => {
    const hit = list[i]
    if (!hit) return
    onPick(hit.repo.root)
    onClose()
  }
  const forgetAt = (i: number) => {
    const hit = list[i]
    if (hit && onForget) forget(hit.repo)
  }
  const moveTo = (e: KeyboardEvent, to: number) => {
    e.preventDefault()
    setCursorAt(Math.max(0, Math.min(list.length - 1, to)))
  }

  // The dialog owns the keys while open (the browse layer is silent under
  // a blocking dialog, hotkeys.md). Arrows walk the grid — a row is as many
  // tiles as the CSS puts on it — Left/Right only from the caret's edge so
  // the filter stays editable; digits jump unless they would be typed.
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.ctrlKey || e.altKey || e.metaKey) return
    const input = inputRef.current
    const inInput = e.target === input
    const caretAtStart = !inInput || (input?.selectionStart === 0 && input.selectionEnd === 0)
    const caretAtEnd =
      !inInput || (input?.selectionStart === input?.value.length && input?.selectionEnd === input?.value.length)
    switch (e.key) {
      case "ArrowDown":
        return moveTo(e, cursor + columnsOf(gridRef.current))
      case "ArrowUp":
        return moveTo(e, cursor - columnsOf(gridRef.current))
      case "ArrowRight":
        if (caretAtEnd) moveTo(e, cursor + 1)
        return
      case "ArrowLeft":
        if (caretAtStart) moveTo(e, cursor - 1)
        return
      case "Enter":
        e.preventDefault()
        return openAt(cursor)
      case "Escape":
        // Ours, not the Modal's: with text in the filter it clears instead of closing.
        e.preventDefault()
        e.stopPropagation()
        if (query) {
          setQuery("")
          setCursorAt(0)
        } else onClose()
        return
      case "Delete":
        if (!query) forgetAt(cursor)
        return
      default:
        if (/^[1-9]$/.test(e.key) && !(inInput && query)) {
          e.preventDefault()
          openAt(Number(e.key) - 1)
        }
    }
  }
  // Clicks anywhere but the input leave the focus where the keys are read.
  const keepFocus = (e: MouseEvent) => {
    if (e.target !== inputRef.current) e.preventDefault()
  }

  const total = recents.length - (pending && recents.some((r) => r.root === pending.root) ? 1 : 0)
  const count =
    list.length === total ? `${total} ${total === 1 ? "repository" : "repositories"}` : `${list.length} of ${total}`

  return (
    <Box
      data-testid="recents-picker"
      onKeyDown={onKeyDown}
      onMouseDown={keepFocus}
      sx={{ display: "flex", flexDirection: "column", minHeight: 0 }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1.25,
          height: 48,
          px: 2,
          borderBottom: 1,
          borderColor: "divider",
          flex: "none",
        }}
      >
        <SearchIcon sx={{ fontSize: 18, color: "text.secondary" }} />
        <InputBase
          autoFocus
          inputRef={inputRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setCursorAt(0)
          }}
          placeholder="Type to filter by name, path or branch"
          inputProps={{
            "data-testid": "recents-filter",
            "aria-label": "Filter recent repositories",
            autoComplete: "off",
            spellCheck: false,
          }}
          sx={{ flex: 1, fontSize: 15, "& input": { p: 0 } }}
        />
        <Kbd>Esc</Kbd>
      </Box>
      <Box
        ref={gridRef}
        role="listbox"
        aria-label="Recent repositories"
        sx={{
          overflow: "auto",
          flex: 1,
          minHeight: 0,
          display: list.length > 0 ? "grid" : "block",
          alignContent: "start",
          // As many tiles as fit at 340 px or more (three at the 1120 px
          // width); columnsOf reads the resolved count back for the keys.
          gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))",
          gap: "1px",
          // The hairlines are the gap showing the soft border through.
          bgcolor: "var(--pg-border-soft, #e6eaf0)",
        }}
      >
        {list.map((hit, i) => (
          <RecentTile
            key={hit.repo.root}
            repo={hit.repo}
            match={hit.match}
            shared={shared}
            index={i}
            cursor={i === cursor}
            openNow={!!currentRoot && hit.repo.root === currentRoot}
            onOpen={() => openAt(i)}
            onForget={onForget ? () => forgetAt(i) : undefined}
          />
        ))}
        {list.length === 0 && (
          <Box
            data-testid="recents-empty"
            sx={{ bgcolor: "background.paper", color: "text.secondary", px: 2, py: 3.5, fontSize: 13 }}
          >
            <Typography sx={{ fontSize: 13, fontWeight: 600, color: "text.primary", mb: 0.5 }}>
              {recents.length === 0 ? "No repositories yet" : `Nothing matches "${trimmed}"`}
            </Typography>
            {recents.length === 0
              ? "Open a folder and it will be listed here next time."
              : "Try part of the path or the branch name."}
          </Box>
        )}
      </Box>
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 2,
          height: 38,
          px: 2,
          borderTop: 1,
          borderColor: "divider",
          bgcolor: "var(--pg-surface-sunken, #f6f8fb)",
          fontSize: 12.5,
          color: "text.secondary",
          flex: "none",
          whiteSpace: "nowrap",
        }}
      >
        {pending ? (
          <Box component="span" data-testid="recents-removed">
            Removed {pending.name}
            <Box component="span" sx={{ mx: 0.75, color: "text.disabled" }}>
              ·
            </Box>
            <Link
              component="button"
              data-testid="recents-undo"
              onClick={undo}
              sx={{ font: "inherit", fontWeight: 500, verticalAlign: "baseline" }}
            >
              Undo
            </Link>
          </Box>
        ) : (
          <span data-testid="recents-count">{count}</span>
        )}
        <Box sx={{ flex: 1 }} />
        <Hint label="move">
          <Kbd>↑</Kbd>
          <Kbd>↓</Kbd>
        </Hint>
        <Hint label="open">
          <Kbd>Enter</Kbd>
        </Hint>
        <Hint label="jump">
          <Kbd>1</Kbd>–<Kbd>9</Kbd>
        </Hint>
        {onOpenFolder && (
          <Link
            component="button"
            data-testid="recents-open-folder"
            onClick={() => {
              onClose()
              onOpenFolder()
            }}
            sx={{ font: "inherit", fontWeight: 500 }}
          >
            Open folder…
          </Link>
        )}
      </Box>
    </Box>
  )
}

function Hint({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Box component="span" sx={{ display: "inline-flex", alignItems: "center", gap: 0.5, "& > span": { ml: 0 } }}>
      {children}
      {label}
    </Box>
  )
}

/** How many tiles the CSS puts on a row, read from the grid itself so the keys and the layout never disagree. */
function columnsOf(grid: HTMLDivElement | null): number {
  if (!grid) return 3
  const cols = getComputedStyle(grid).gridTemplateColumns.split(" ").filter(Boolean).length
  return cols > 0 ? cols : 3
}

// The cross and Delete hide the tile at once and offer Undo in the footer;
// the DELETE itself waits `delayMs` (no engine change, no confirm). One
// pending forget at a time: a second one sends the first through. Unmount
// (the dialog closing) flushes too, so nothing is lost.
function useDelayedForget(onForget: ((root: string) => void) | undefined, delayMs: number) {
  const [pending, setPending] = useState<RepoInfo | null>(null)
  const pendingRef = useRef<RepoInfo | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const onForgetRef = useRef(onForget)
  useEffect(() => {
    onForgetRef.current = onForget
  }, [onForget])

  const clear = () => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
  }
  const flush = useCallback(() => {
    clear()
    const p = pendingRef.current
    pendingRef.current = null
    setPending(null)
    if (p) onForgetRef.current?.(p.root)
  }, [])
  const forget = useCallback(
    (repo: RepoInfo) => {
      flush()
      pendingRef.current = repo
      setPending(repo)
      timer.current = setTimeout(flush, delayMs)
    },
    [flush, delayMs],
  )
  const undo = useCallback(() => {
    clear()
    pendingRef.current = null
    setPending(null)
  }, [])
  useEffect(() => flush, [flush])

  return { pending, forget, undo }
}
