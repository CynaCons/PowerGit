# Linux/Tauri font loading (self-hosted Inter + Fira Code)

Captured v0.12.1 after a second round of owner feedback ("fonts on Ubuntu
look low quality and too light grey", AppImage/WebKitGTK; fine on Windows
WebView2). The first pass (v0.9.0, 2026-08-24) already self-hosted both
fonts and darkened `text.secondary` once — this was a follow-up because
that wasn't enough.

## `/fonts/...` root-absolute URLs already work under `tauri://localhost`
Investigated whether Tauri's Linux origin (`tauri://localhost`, vs.
`http://tauri.localhost` on Windows/Android) fails to resolve root-absolute
CSS `url(/fonts/x.woff2)` — it doesn't. Both schemes route a request's path
portion against `frontendDist` the same way. Proof from this repo, not just
docs: the app's own hashed bundle (`/assets/index-*.js`,
`/assets/index-*.css`, referenced root-absolute in `dist/index.html`)
already relies on this and the owner's report describes a *rendering* app
with wrong-looking fonts, not a blank page — so root-path resolution across
the custom protocol was never the bug. `vite build` also confirms
`public/fonts/*.woff2` copies to `dist/fonts/*.woff2` untouched and the
built CSS keeps the literal `url(/fonts/...)`. Kept the root-absolute
`public/` convention; did not move fonts into `src/assets` or add
`?url` imports — that would only add hashed-filename/preload-href sync
complexity for no proven benefit.

## Real likely cause: Fira Code's variable default instance is weight 300 (Light)
Inspected both self-hosted variable fonts with `fonttools`
(`TTFont(...)['fvar']`): Inter's `wght` axis is 100–900, default **400**.
Fira Code's `wght` axis is 300–700, default **300 (Light)** — not 400. The
old `@font-face` declared `font-weight: 400 600` (a range) for Fira Code;
if a rendering stack doesn't implement CSS Fonts 4 range/interpolation
matching — unverified on the AppImage's bundled WebKitGTK/FreeType, no
Linux runtime available to this worker (see "Verification limits") — it
falls back to the font's *default named instance*, i.e. Light, regardless
of what weight CSS requested. That alone reproduces "too light" independent
of any colour/contrast issue, and would affect every `sha`/code span in the
app (all rendered in Fira Code).

## Fix: static per-weight faces, not a variable-range face
Generated static (non-variable) instances with
`fontTools.varLib.instancer.instantiateVariableFont` at weights
400/500/600/700 for both families (`pip install fonttools brotli`; brotli
is required to read/write `.woff2`). Verified each output has no `fvar`
table and the expected `OS/2.usWeightClass`. Replaced the two range
`@font-face` rules in `tokens.css` with 8 explicit single-weight rules
(`inter-latin-{400,500,600,700}.woff2`, `firacode-latin-{400,500,600,700}.woff2`,
in `frontend/public/fonts/`) and deleted the superseded `*-latin-var.woff2`
files (confirmed via repo-wide grep that nothing else referenced them by
name). This removes all dependency on variable-font interpolation being
supported at all: every requested weight is a distinct, correctly-weighted
file on every engine. 400/500/600/700 covers every `fontWeight`/
`font-weight` value actually used under `frontend/src` (grepped before
picking the set).

## Preload only the weights visible at first paint
Added `<link rel="preload" as="font" type="font/woff2" crossorigin>` in
`index.html` for `inter-latin-400`, `inter-latin-500`, `firacode-latin-400`
only (grid body + sha column = the above-the-fold content), not all 8
static files, to avoid competing with the JS bundle for bandwidth/priority
on first load. `font-display: swap` is unchanged, so a slow/failed font
fetch still shows the Linux-fallback stack below instead of blocking paint.

## Linux-friendly fallback stacks (`theme.ts`)
Sans: `"Inter", "Noto Sans", "Cantarell", "Ubuntu", "DejaVu Sans", system-ui, sans-serif`.
Mono: `"Fira Code", "JetBrains Mono", "DejaVu Sans Mono", ui-monospace, Consolas, monospace`.
Noto Sans/Cantarell/Ubuntu/DejaVu Sans(+Mono) are commonly preinstalled on
mainstream Linux desktops (GNOME/Ubuntu defaults) and render at their own
normal weight/darkness even if the self-hosted face never loads at all.
Previously the sans fallback was just `system-ui, -apple-system,
sans-serif`, which on a GTK/Linux desktop can resolve to a thin generic
default with no better-looking named alternative in between.

## Contrast + rendering hints (`theme.ts`)
Darkened `palette.text` again: `primary #0f172a` (was `#111827`),
`secondary #334155` (was `#4b5563`), added `disabled #64748b` (previously
unset, so it fell back to MUI's default `rgba(0,0,0,0.38)`). Added
`-webkit-font-smoothing: antialiased`, `-moz-osx-font-smoothing: grayscale`,
`text-rendering: optimizeLegibility` to the `MuiCssBaseline` `body`
override — all no-ops on Windows/macOS, but the first two specifically
target WebKit/Linux's default grayscale (non-ClearType) antialiasing, which
reads visibly lighter than Windows at the same declared colour/weight.
Also added a `.grid-row .msg-text, .grid-row .author, .grid-row .date,
.grid-row .sha` rule (`font-weight: 500`) in the same `MuiCssBaseline`
block: grid rows are plain divs styled by `app.css` (owned by a different
worker this iteration), so only the weight bump lives here; `app.css`
still owns colour for those same selectors and the two coexist without
conflict (checked: `app.css` never sets `font-weight` on those classes, so
there's no cascade fight).

## Verification limits
No Linux/WebKitGTK runtime available to this worker (Windows dev box only
— same limitation noted in `webkitgtk-css.md`). Verified: `npx tsc --noEmit`
clean; `npx vite build` emits `dist/fonts/*.woff2` (all 8 static files),
and the built CSS/`index.html` reference the correct filename per weight
(diffed each `@font-face` rule and each `<link rel=preload>` href against
the source). Not verified: actual rendered appearance on Ubuntu/AppImage —
needs the next tagged Linux release's AppImage smoke pass
(`appimage-glib-bundling.md`) or `scripts/ubuntu-check.ps1`, ideally with an
owner-triggered `npm run test:visual` pixel diff. Neither was run here.

## `-webkit-font-smoothing: antialiased` makes Linux text LIGHTER, not darker

Captured 2026-09-03 (v0.12.3), correcting the 2026-09-02 entry above.

That declaration was added to `theme.ts` to answer the owner's "fonts look
low quality and too light grey" on Ubuntu. It does the opposite of what was
intended: it turns OFF subpixel rendering and forces grayscale antialiasing,
which lays down roughly a third less coverage per stem. It is a standard
macOS trick for *thinning* text that looks too heavy under Quartz — using it
to darken text is backwards. The owner reported the same symptom again on the
next build, which is the expected outcome.

The value is now `auto`, and `textRendering: optimizeLegibility` is gone too
(it buys nothing for UI text and perturbs metrics). If Linux text still reads
light, the levers that actually work are: a heavier requested weight (the
theme now asks for 500 as the body weight), darker `palette.text.*`, and
letting the platform's own hinted UI font render instead of a webfont.

## The UI font stack now leads with the platform font, like VS Code

`SANS_FONT` is `system-ui, "Segoe WPC", "Segoe UI", "Ubuntu", "Droid Sans",
"Cantarell", "Noto Sans", "Inter", "DejaVu Sans", sans-serif`. Segoe UI and
Ubuntu ship with hinting instructions and fontconfig rules tuned to their
platform's rasterizer; a webfont delivered to WebKitGTK gets none of that,
which is the real reason Inter read as "low quality" on Ubuntu and fine on
Windows. Inter is still self-hosted as the fallback, but it is no longer
preloaded in `index.html` — on both shipping platforms it now usually never
loads at all.
