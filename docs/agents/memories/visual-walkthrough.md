# Visual walkthrough (the "look at it" step)

Why this exists: the owner reported "commits disappear when they are
selected" from v0.12.1 on. Three iterations of audits, 58 green e2e specs
and a release review never saw it, because every test asserted DOM classes
and computed styles while the commit node lives on the graph canvas under
the opaque selected-row background. It was found on 2026-09-05 by capturing
the running window and enlarging one row. Tests are the gate; a human or a
vision-capable reviewer looking at the picture is the safety net for what
the tests were never written to see.

## When
- Before closing any UI task, and always in the release preflight.
- After touching `app.css`, `tokens.css`, `theme/`, `graph/draw.ts`,
  `RevisionGrid.tsx`, `BottomPanel.tsx`, dialogs, or layout hooks.

## How
Windows: start the app (`npm run tauri dev` or the packaged zip) and run
`pwsh scripts/capture-window.ps1 -Out captures/<state>.png` per state; add
`-Crop x,y,w,h` for a 2x cut of one row. Linux: the Docker harness and the
Playwright visual subset (`npm run test:visual -- --grep @grid`) stand in.
Give the captures to a reviewer with vision (a fresh agent, not the author)
with this checklist. One capture per state; do not paste the whole session.

## States and what to check
1. Fresh start, real repo: rows fill the grid; HEAD row has its refs;
   every visible row shows a graph node; status bar shows branch and
   ahead/behind, not "connecting".
2. A selected row (click one in the middle): tinted text cells, 2px left
   border, and the graph column of that row still shows its node and lane
   lines. Commit details appear below without the highlight waiting.
3. A hovered row (pointer on a different row): faint tint, graph intact.
4. Dark theme (Settings): text readable on every surface, selection and
   hover visible, graph lanes visible against the dark surface, no white
   flashes in dialogs or the diff view.
5. Zoom 150 % (Ctrl+= twice): grid still has rows (the bottom panel must
   not swallow the area), nothing overflows the window, splitter usable.
6. Narrow window (~800px): command bar collapses to the overflow menu,
   columns still readable, no horizontal scrollbar on the page.
7. Diff tab and File Tree tab for the selected commit: gutter aligned,
   long lines scroll inside the pane, tree rows expand.
8. Commit dialog (Ctrl+Space) and Settings (Ctrl+,): open centred, no
   clipped labels, focus returns to the grid on Escape.

## Recording the result
Put "looked at: states 1-8 on <platform>, <date>" plus anything odd in the
worker report or the PLAN.md task text. A capture that shows an error state,
synthetic data or a half-loaded graph is a finding, not a baseline.
