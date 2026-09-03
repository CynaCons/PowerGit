# Shiki syntax highlighting (BlobPane)

## Fine-grained bundle: exact packages and import paths (2026-09-03)
`frontend/src/highlight.ts` highlights the File Tree blob viewer. The
"fine-grained bundle" API (https://shiki.style/guide/bundles#fine-grained-bundle)
is under-documented on the actual npm package layout; confirmed by installing
`shiki@4.4.3` and probing with small `.mjs` scripts:
- `createHighlighterCore` comes from `shiki/core` (re-exported from
  `@shikijs/core`).
- `createJavaScriptRegexEngine` comes from `@shikijs/engine-javascript` (also
  reachable as `shiki/engine/javascript`, but the task wanted the explicit
  package). Use this engine, not `@shikijs/engine-oniguruma` — the oniguruma
  engine needs a `.wasm` file, and loading `.wasm` over Tauri's `tauri://`
  custom scheme is unverified on WebKitGTK (see `webkitgtk-css.md`).
- Individual grammars/themes are NOT under `shiki/langs/*` (that subpath is
  one giant `dist/langs.mjs` barrel with everything). Import
  `@shikijs/langs/<name>` (e.g. `@shikijs/langs/typescript`) and
  `@shikijs/themes/<name>` (e.g. `@shikijs/themes/light-plus`) directly —
  each is its own small `.mjs` file, so per-language `import()` calls code-
  split cleanly under Vite/Rollup.
- A grammar module's default export is `LanguageRegistration[]`; a theme
  module's default export is a single `ThemeRegistration` object (not an
  array).

## Lazy per-language loading pattern that actually works
Create the highlighter ONCE with `langs: []` (no grammars) and only the
theme, then call `await highlighter.loadLanguage(mod.default)` per language
the first time it's needed (check `getLoadedLanguages()` or keep your own
`Set`). `codeToHtml` throws `Language \`x\` not found, you may need to load it
first` for anything not loaded — catch it, don't pre-empt it by loading every
grammar up front. This is what makes the *initial* app bundle unaffected:
confirmed via `npm run build` that all 31 language chunks + core + engine +
theme land in their own separate `dist/assets/*.js` files, none of them
pulled into the main entry chunk (main chunk only grew ~4 KB, for
`highlight.ts`'s own small always-loaded code). Do not switch this to eagerly
loading all languages "for simplicity" — it would add ~2.5 MB across ~31
chunks to app cold-start-reachable code.

## Don't nest a real `<pre>` inside a MUI `Box component="pre"`
`codeToHtml` returns a full `<pre class="shiki ..."><code>...</code></pre>`
string. If you `dangerouslySetInnerHTML` that into an element that is
*itself* `component="pre"`, you get an invalid nested `<pre><pre>`. Use a
plain `<div>` (or any non-`pre` component) as the outer `data-testid`
wrapper and put `whiteSpace: "pre"` etc. on it via `sx` instead — a `div`
with `white-space: pre` behaves identically to a real `<pre>` for layout and
scrolling purposes, since every other `pre`-specific UA default (font-
family, margin) was already being overridden anyway.

## Overriding Shiki's inline styles without killing token colours
Shiki's own `<pre style="background-color:...;color:...">` never sets
`font-family` (confirmed by direct probe of `codeToHtml` output for
`light-plus`), but defend against it anyway (task's own constraint, and
future Shiki versions/themes are not guaranteed to keep it that way): add
`"& pre": { fontFamily: \`${MONO_FONT} !important\`, fontVariantLigatures:
"none !important", ... }` (and the same for `"& code"`) on the *ancestor*
`sx`, scoped to element selectors only — never `"& span"`, which would blow
away Shiki's per-token `color` (that inline `color` **is** the highlighting).
An author-stylesheet rule with `!important` legitimately beats an inline
`style=""` without `!important` per the CSS cascade, so this is safe/correct,
not a hack.

## Round-trip guarantee makes text-integrity e2e assertions easy
Shiki HTML-escapes the source text; reading `.textContent()` off the
container decodes it back to the exact original string (including a
trailing newline, which shows up as an extra empty trailing `<span
class="line">`). `blob-highlight.spec.ts` uses this: it fetches the same
commit+path directly from the engine (`GET /commits/:id/blob?path=...`) as
ground truth and compares it to `blob-pane`'s final `.textContent()` — no
reliance on timing or on-disk file state.

## A brand-new spec can also eat concurrent-worker contention
A first run of `blob-highlight.spec.ts` timed out clicking a File Tree row
right after switching tabs, with the DOM snapshot showing the Commit tab
still selected. Re-running the pre-existing, untouched `file-tree.spec.ts`
(same navigation shape) passed immediately, proving it wasn't a real
regression from this change; re-running the new spec alone then passed too.
See `concurrent-worker-e2e-contention.md` — when a new spec fails on its
first try with no code-level explanation, replay a same-shaped existing spec
first to tell "my bug" from "shared dev-server/engine noise" before
debugging further.
