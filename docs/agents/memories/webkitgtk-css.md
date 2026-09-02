# WebKitGTK CSS/canvas features to avoid

Captured v0.12.1 after the "highlight same-author commits" row-vanishing
report (Linux AppImage, WebKitGTK; fine on Windows WebView2/Chromium). This
repo runs `frontend/src/graph/draw.ts` (canvas) directly behind
`frontend/src/components/RevisionGrid.tsx` DOM rows (`app.css`), so both the
CSS parser and the canvas 2D fillStyle parser are in play — the two are
**separate parsers** in WebKit and can disagree on what's valid.

## CSS features to avoid or use defensively
Any of these can make WebKit drop the **whole declaration** silently (no
console error) — the property then resolves to its inherited/initial value
instead of your intended one:
- `color-mix()`, `oklch()`/`oklab()`, `light-dark()`, CSS Color 5 relative
  colour syntax (`rgb(from ... )`) — stick to `#rrggbb` and comma-syntax
  `rgb()`/`rgba()`.
- The `inset` **shorthand** position property (not to be confused with the
  `inset` *keyword* inside `box-shadow`, which is ancient and fine).
  WebKitGTK builds around the 2.40 era (~2023) have partial/buggy `inset`
  shorthand support; some ship even older webkit2gtk from the host distro.
  Use explicit `top`/`right`/`bottom`/`left` longhand.
- `:has()`, `@container`, native CSS nesting (`&` inside a plain `.css`
  file) — all newer parser features; this repo doesn't use them, keep it
  that way in `app.css`/`tokens.css`.
- CSS custom properties (`var(--x)`) are fine and well supported, but always
  give them a literal fallback (`var(--x, #hex)`) — cheap insurance if a
  property ever fails to resolve for any reason.

## Canvas fillStyle fails differently: it doesn't drop, it *keeps stale state*
Setting `ctx.fillStyle`/`ctx.strokeStyle` to a string the engine can't parse
as a colour is spec'd to be a no-op — the **previous** fillStyle silently
stays in effect. If that previous value was left over from drawing lane
lines/nodes (`draw.ts` reuses one `ctx` across the whole row loop), an
unparsable "fill colour" for a row background can paint the row with
whatever *unrelated* colour was last used — this is what "canvas paints
opaque over the DOM text" looks like in practice. Always keep a hardcoded
hex `|| fallback` after reading a CSS custom property for a fillStyle.

## Real WebKit bug: getComputedStyle() can return "" for custom properties
bugs.webkit.org #14563 (still cited against modern WebKit/Safari via
Playwright's own bug reports): `getComputedStyle(el).getPropertyValue('--x')`
can return an empty string on WebKit for some elements — `<canvas>` among
them — even when the property is set and inherited correctly. `draw.ts` used
to query `getComputedStyle(ctx.canvas)`; it now queries
`getComputedStyle(document.documentElement)` instead (the `:root` element,
where the tokens are declared) — same value on every engine, sidesteps the
per-element quirk entirely. Prefer reading tokens from `documentElement`,
not from whatever element happens to need the colour.

## Set `color` explicitly on any class that's toggled at runtime
`.grid-row.selected` / `.grid-row.author-highlight` only ever set
`background`; text colour relied on multi-level inheritance from `body`.
That's the fragile part on WebKit: a class-only mutation that changes an
ancestor's `background` but not `color` gives the engine no explicit signal
that the text run needs repainting. `app.css` now re-asserts `color`
(literal hex, matching the inherited values exactly — no visual change) on
`.msg-text`/`.author`/`.date`/`.sha` for both highlighted states, plus
`opacity: 1`.

## Paint order: don't rely purely on DOM order for canvas-vs-text stacking
`.graph-canvas` sits before the row divs in source order with
`position: absolute` and no transform; every `.grid-row` is
`position: absolute` **with** a `transform` (from the virtualizer), which
always creates its own stacking context. Per spec, DOM order still decides
paint order here and Chromium/WebKit should agree — but `app.css` now makes
it explicit (`z-index: 0` on `.graph-canvas`, `z-index: 1` on `.grid-row`)
so the row text is guaranteed to paint above the canvas regardless of any
engine-specific stacking edge case. `pointer-events: none` was already set
on the canvas (unchanged); no `mix-blend-mode` is used anywhere in this repo
— checked, not the cause here.

## Verification limits
None of this can be exercised on the Windows dev box (no WebKitGTK
runtime). `npm run test:e2e` now asserts a same-author row keeps
non-transparent, `opacity: 1` text after selecting another row of the same
author (`shell.spec.ts`, "selected rows stay distinct from same-author
rows") — this passes under Chromium locally, which is necessary but not
sufficient proof for WebKitGTK. The real check is the next tagged Linux
release's AppImage smoke path (see `appimage-glib-bundling.md`); worth a
follow-up to add a headless `xvfb` grid-selection check alongside the
existing undefined-symbol scan if this regresses again.
