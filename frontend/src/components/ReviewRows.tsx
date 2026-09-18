import { useEffect, useRef, useState } from "react"

export function NoteRow({
  label,
  text,
  onChange,
  onDelete,
}: {
  label: string
  text: string
  onChange: (text: string) => void
  onDelete: () => void
}) {
  const [value, setValue] = useState(text)
  const rows = Math.max(1, Math.min(6, value.split("\n").length))
  useEffect(() => setValue(text), [text])
  return (
    <div className="diff-note-row" data-testid="diff-note-row">
      <span className="diff-note-label">{label}</span>
      <textarea
        data-testid="diff-note-text"
        aria-label={`Review comment on ${label}`}
        rows={rows}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => onChange(value)}
        onKeyDown={(e) => {
          e.stopPropagation()
          if (e.key === "Enter" && e.ctrlKey) {
            e.preventDefault()
            onChange(value)
          }
        }}
      />
      <button type="button" data-testid="diff-note-delete" aria-label={`Delete comment on ${label}`} onClick={onDelete}>
        ×
      </button>
    </div>
  )
}

export function CommandRow({
  initial,
  hint,
  error,
  onRun,
  onClose,
}: {
  initial: string
  hint: string
  error: string | null
  onRun: (value: string) => void
  onClose: () => void
}) {
  const [value, setValue] = useState(initial)
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => {
    const el = input.current
    el?.focus()
    el?.setSelectionRange(el.value.length, el.value.length)
  }, [])
  return (
    <div className="diff-cmd-row" data-testid="diff-cmd-row">
      <span className="diff-cmd-prompt">›</span>
      <div className="diff-cmd-body">
        <input
          ref={input}
          data-testid="diff-cmd-input"
          aria-label="Review command"
          spellCheck={false}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation()
            if (e.key === "Enter") {
              e.preventDefault()
              onRun(value)
            } else if (e.key === "Escape") {
              e.preventDefault()
              onClose()
            }
          }}
        />
        <span className={error ? "diff-cmd-hint diff-cmd-error" : "diff-cmd-hint"} data-testid="diff-cmd-hint">
          {error ?? hint}
        </span>
      </div>
    </div>
  )
}
