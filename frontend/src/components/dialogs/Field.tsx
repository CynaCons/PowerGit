import { useEffect, useRef, type ReactNode, type TextareaHTMLAttributes, type InputHTMLAttributes } from "react"

// A field of the A shell (v0.18.11): the label ABOVE the input — never
// MUI's floating label, which DialogContent clipped ("Merge branch" in the
// owner's report) — an optional right-side slot on the label line (the
// "appears as" chip), an optional caption after the label, the input, and
// an optional 12 px meta line under it (the reason a name is refused).
export function Field({
  label,
  right,
  caption,
  meta,
  metaTone,
  children,
  testid,
}: {
  label: ReactNode
  /** Right end of the label line, e.g. "appears as" + the chip. */
  right?: ReactNode
  /** After the label, 12 px meta: "a message makes an annotated tag". */
  caption?: ReactNode
  /** A line under the input. */
  meta?: ReactNode
  metaTone?: "error" | "amber"
  children: ReactNode
  testid?: string
}) {
  return (
    <div className="op-field" data-testid={testid}>
      <div className="op-label">
        <span>{label}</span>
        {caption && <span className="op-label-cap">{caption}</span>}
        {right && <span className="op-label-right">{right}</span>}
      </div>
      {children}
      {meta && (
        <div className={`op-meta${metaTone ? ` ${metaTone}` : ""}`} data-testid={testid ? `${testid}-meta` : undefined}>
          {meta}
        </div>
      )}
    </div>
  )
}

/** A one-line text input in the shell's box (34 px, 5 px radius). `focus`
 *  focuses on mount and again after StrictMode's remount, which is what
 *  wins over MUI's FocusTrap in dev (docs/agents/memories/mui-dialog-focus.md). */
export function TextInput({ focus, className, ...rest }: InputHTMLAttributes<HTMLInputElement> & { focus?: boolean }) {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (focus) ref.current?.focus()
  }, [focus])
  return (
    <input
      ref={ref}
      type="text"
      autoComplete="off"
      spellCheck={false}
      className={`op-input${className ? ` ${className}` : ""}`}
      {...rest}
    />
  )
}

/** A multi-line input in the same box (56 px, resizable). */
export function TextArea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea spellCheck={false} className={`op-input multi${className ? ` ${className}` : ""}`} {...rest} />
}
