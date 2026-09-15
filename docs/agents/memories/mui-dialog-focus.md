# MUI Dialog focus

## `autoFocus` inside a Dialog loses in dev (StrictMode + FocusTrap), 2026-09-15
React's `autoFocus` does focus the input when a `Dialog` opens, but under
`StrictMode` (dev builds, so every e2e run) MUI's `FocusTrap` is
double-mounted: its effect cleanup restores focus to the element that
opened the dialog (the rail button), and the remount, finding the focus
outside, lands it on the Paper (`data-mui-focusable`, MUI 9). Seen on
`recents-filter` in v0.18.7: focusin input → focusout to the button →
focusin Paper. Production (no double-mount) is fine, so the specs are the
only place it shows. Fix: a mount `useEffect(() => ref.current?.focus(),
[])` in the dialog's child — child effects rerun on the StrictMode remount
after the trap's cleanup, so the input wins in both builds
(`RecentsDialog.tsx`). The other dialogs' `autoFocus` (CreateRef, Remote,
Ignore, Confirm) have no spec asserting focus and may show the same.
