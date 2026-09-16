import type { ReactNode } from "react"

// An option row of the A shell (v0.18.11): a 14 px native checkbox or
// radio in the primary accent, the label, the explanation after an em dash
// on the same line (`explain`), an optional inline control (`children`:
// the local branch name inside "Create local branch [ ] tracking …"), and
// an optional note under the row (`note`, 12 px, indented past the
// control; amber or red when it warns). One line per option, never
// inside the control.
export function OptionRow({
  kind,
  checked,
  onChange,
  label,
  explain,
  disabled = false,
  name,
  value,
  testid,
  children,
  note,
  noteTone,
}: {
  kind: "checkbox" | "radio"
  checked: boolean
  onChange: (checked: boolean) => void
  label: ReactNode
  explain?: ReactNode
  disabled?: boolean
  name?: string
  value?: string
  /** On the input, so `getByTestId(...).click()` and `.toBeChecked()` both hold. */
  testid?: string
  children?: ReactNode
  note?: ReactNode
  noteTone?: "amber" | "error"
}) {
  return (
    <>
      <label className={`op-opt${disabled ? " off" : ""}`} data-testid={testid ? `${testid}-row` : undefined}>
        <input
          type={kind}
          name={name}
          value={value}
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
          data-testid={testid}
        />
        <span>{label}</span>
        {children}
        {explain && <span className="op-ex">{explain}</span>}
      </label>
      {note && (
        <div
          className={`op-opt-note${noteTone ? ` ${noteTone}` : ""}`}
          data-testid={testid ? `${testid}-note` : undefined}
        >
          {note}
        </div>
      )}
    </>
  )
}

/** A captioned group of option rows ("Fast forward", "Local changes (1 file)"). */
export function OptionGroup({ label, children, testid }: { label?: ReactNode; children: ReactNode; testid?: string }) {
  return (
    <div className="op-group" data-testid={testid} role={label ? "group" : undefined}>
      {label && <div className="op-group-label">{label}</div>}
      {children}
    </div>
  )
}
