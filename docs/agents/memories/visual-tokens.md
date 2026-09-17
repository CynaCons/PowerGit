# Visual tokens and zoom

The v0.13.13 visual system keeps literal colors in `frontend/src/theme/tokens.ts` and writes semantic `--pg-*` custom properties at runtime for CSS and canvas consumers. Application zoom is applied to `#root`; portal content is zoomed separately so MUI anchor geometry remains in visual pixels. The document root is fixed to prevent absolute virtualized pane children from enlarging document `scrollHeight`; pane-local overflow remains unchanged.

## Pointer drags and canvases under CSS zoom (v0.18.18)

CSS `zoom` on `#root` (and on dialog papers) scales the subtree but changes neither `PointerEvent.clientX/Y` (visual px) nor `window.devicePixelRatio`. Two rules follow, both bitten once (docs/perf/reactivity-review-2026-09-17.md second pass, findings 3 and 8): a drag that writes local px must divide its clientX/Y delta by the zoom (`getZoom()` inside the move closure is enough, no hook needed; `useChromeLayout`, `RevisionGrid.dragStart`, `SplitHandle`, `CommitWindowFrame` all do), and a `<canvas>` shown at local px must size its backing store by `devicePixelRatio * zoom` with the same product in `setTransform`, or the compositor upscales the bitmap by the zoom and the strokes go soft. Do not reach for `ResizeObserver` `devicePixelContentBoxSize` for this: WebKitGTK lacks it.

## Splitter pointerdown: cancel it

A resize handle's `pointerdown` needs `if (e.button !== 0) return; e.preventDefault()` before `setPointerCapture`. Capture retargets events but does not cancel the compat `mousedown`, so Chromium arms text selection and sweeps a highlight across the grid/diff on every move. Cancelling `pointerdown` does not suppress `click`/`dblclick`, so a double-click reset on the same handle keeps working (proved by `grid-columns.spec`).
