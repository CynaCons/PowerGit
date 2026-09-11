# Commit window (v0.16.0)

## Geometry is visual px; the paper is zoomed, so divide before writing CSS
`frontend/src/components/commit-window/` keeps the resizable commit dialog's
size and position in visual px (pointer `clientX/Y`, `getBoundingClientRect`,
`window.innerWidth`). The theme puts CSS `zoom` on `.MuiDialog-paper`
(theme/index.ts), which multiplies the paper's own `width/height/left/top/
margin`, so `CommitWindowFrame.paintGeometry` divides every length by the
zoom. Writing visual px straight into the paper's style makes the dialog
`zoom` times too large at 150%.

## During a drag the paper is styled inline, not through React state
Each pointer move calls `resizeRect` (dialogSize.ts, pure, unit tested) and
writes the rect onto the paper element directly; the owner's state is
updated once, on release. The frame's `useLayoutEffect` is the single writer
afterwards (it re-paints on geometry and zoom changes, and clears the inline
style when the geometry is null). Do not add a second writer: an sx-based
size and an inline size fight, and a stale inline value survives a zoom
change.

## A positioned paper leaves MUI's flex centring
Dragging an edge anchors the opposite edge, so the paper switches to
`position: absolute; margin: 0` with an explicit `left/top` inside the
fixed `.MuiDialog-root`. Backdrop clicks still close (the container fills
the root and MUI checks `target === currentTarget`), and the position is
deliberately not stored: `pg.commitDialogSize` holds `{width,height}` only,
a reload opens centred.

## A native commit window needs a branch in main.tsx (2026-09-11)
The shell can open a second window on `index.html` today (recovery step 8,
label `recovery-*`), the engine session is shared (`?repo=<id>` pin,
`engine_config` gives every window the URL and token), and the capability
file lists windows by label. What is missing is an entry point: `index.html`
always boots `App`, so `?view=commit` renders the whole shell (history
stream, refresh loops, a second WebKitGTK webview) with a sheet over it.
Plan when it is scheduled: `main.tsx` branches on `?view=commit` to a
`commit-window/CommitWindowApp.tsx` (EngineProvider + `base.withRepo(id)`,
status fetch and `/events` refresh, `CommitDialog` full-screen, close the
native window after the commit), `capabilities/default.json` adds
`commit-*` and `core:webview:allow-create-webview-window`, and the frame's
`children` slot takes the "Open in window" icon. Roughly 200 lines.
