// Returns focus to the grid so arrow keys work immediately, after a dialog
// closes or a busy action finishes. The double rAF runs after MUI's own
// FocusTrap restores focus to whatever was focused before the dialog
// opened: that restore fires from an effect cleanup tied to the dialog's
// `open` prop, not to the exit transition, so a same-tick focus() call
// here could otherwise be undone a moment later by MUI's own restore.
export function focusGrid() {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      ;(document.querySelector('[data-testid="grid-body"]') as HTMLElement | null)?.focus()
    })
  })
}
