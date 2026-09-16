import ExpandMoreIcon from "@mui/icons-material/ExpandMore"
import SearchIcon from "@mui/icons-material/Search"
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react"
import { cursorFor, filterItems, pickerItems, stepCursor, type PickerItem, type PickerKind } from "./branchPickerModel"
import { RefChip } from "./QuotedRef"
import { findRow, useQuote } from "./quoteContext"

export type { PickerKind } from "./branchPickerModel"

// The branch picker (v0.18.11, shared by Checkout and Merge): a button whose
// value is the chip plus the tip's SHA and subject on one line, opening a
// list under the field — the filter box with the focus, Branches then
// Remotes, every row a chip and its tip, the checked-out branch excluded,
// ↑ ↓ Enter Esc. The list lives inside the dialog (no portal): the paper's
// zoom applies and the focus trap has nothing to argue with; the dialog's
// own Enter handler ignores keys from inside `[data-op-menu]`.
export function BranchPicker({
  value,
  onChange,
  exclude = [],
  kinds = ["local", "remote"],
  testid,
  ariaLabel,
}: {
  value: string
  onChange: (name: string) => void
  /** Names left out (the checked-out branch). */
  exclude?: string[]
  kinds?: PickerKind[]
  /** On the button; the list is `${testid}-list`, its rows `branch-option`. */
  testid?: string
  ariaLabel?: string
}) {
  const { refs, rows } = useQuote()
  const [open, setOpen] = useState(false)
  const [filter, setFilter] = useState("")
  const [cursor, setCursor] = useState(0)
  const root = useRef<HTMLDivElement>(null)
  const button = useRef<HTMLButtonElement>(null)
  const input = useRef<HTMLInputElement>(null)

  const items = useMemo(() => pickerItems(refs, exclude, kinds), [refs, exclude, kinds])
  const q = filter.trim().toLowerCase()
  const shown = useMemo(() => filterItems(items, q), [items, q])
  const locals = shown.filter((i) => i.kind === "local")
  const remotes = shown.filter((i) => i.kind === "remote")
  const ordered = [...locals, ...remotes]
  const current = items.find((i) => i.name === value)

  useEffect(() => {
    if (!open) return
    setFilter("")
    setCursor(cursorFor(ordered, value))
    input.current?.focus()
    const onDown = (e: MouseEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", onDown)
    return () => document.removeEventListener("mousedown", onDown)
    // The cursor lands on the value once, when the list opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  useEffect(() => {
    setCursor(0)
  }, [q])

  useEffect(() => {
    if (!open) return
    root.current?.querySelector<HTMLElement>(`[data-index="${cursor}"]`)?.scrollIntoView({ block: "nearest" })
  }, [cursor, open])

  function pick(name: string) {
    onChange(name)
    setOpen(false)
    button.current?.focus()
  }

  function onKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault()
      setCursor((c) => stepCursor(c, ordered.length, e.key === "ArrowDown" ? 1 : -1))
    } else if (e.key === "Enter") {
      e.preventDefault()
      e.stopPropagation()
      const hit = ordered[cursor]
      if (hit) pick(hit.name)
    } else if (e.key === "Escape") {
      e.preventDefault()
      e.stopPropagation()
      setOpen(false)
      button.current?.focus()
    }
  }

  const tipOf = (i: PickerItem) => {
    const row = findRow(rows, i.target)
    return { sha: i.target.slice(0, 7), subject: row?.rev.message ?? null }
  }

  const row = (i: PickerItem, index: number) => {
    const tip = tipOf(i)
    return (
      <div
        key={i.name}
        role="option"
        aria-selected={index === cursor}
        className={`op-it${index === cursor ? " cur" : ""}`}
        data-testid="branch-option"
        data-ref={i.name}
        data-index={index}
        onMouseEnter={() => setCursor(index)}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => pick(i.name)}
      >
        <RefChip name={i.name} kind={i.kind} />
        <span className="op-tip">
          <span className="mono">{tip.sha}</span>
          {tip.subject}
        </span>
      </div>
    )
  }

  const tip = current ? tipOf(current) : null
  return (
    <div ref={root} className="op-field" style={{ gap: 0 }}>
      <button
        ref={button}
        type="button"
        className={`op-picker${open ? " open" : ""}`}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" && !open) {
            e.preventDefault()
            setOpen(true)
          }
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        data-testid={testid}
        data-value={value}
      >
        {current ? (
          <>
            <RefChip name={current.name} kind={current.kind} big />
            <span className="op-tip">
              <span className="mono">{tip?.sha}</span>
              {tip?.subject ? ` · ${tip.subject}` : ""}
            </span>
          </>
        ) : (
          <span className="op-empty">{items.length === 0 ? "No other branch" : "Pick a branch…"}</span>
        )}
        <ExpandMoreIcon className="op-chev" />
      </button>
      {open && (
        <div className="op-menu" data-op-menu role="listbox" data-testid={testid ? `${testid}-list` : undefined}>
          <div className="op-filter">
            <SearchIcon />
            <input
              ref={input}
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              onKeyDown={onKey}
              placeholder="Type to filter…"
              aria-label="Filter branches"
              autoComplete="off"
              spellCheck={false}
              data-testid={testid ? `${testid}-filter` : undefined}
            />
          </div>
          <div className="op-list">
            {locals.length > 0 && <div className="op-mg">Branches</div>}
            {locals.map((i, n) => row(i, n))}
            {remotes.length > 0 && <div className="op-mg">Remotes</div>}
            {remotes.map((i, n) => row(i, locals.length + n))}
            {ordered.length === 0 && <div className="op-none">Nothing matches "{filter}"</div>}
          </div>
        </div>
      )}
    </div>
  )
}
