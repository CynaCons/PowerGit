// Lazy, offline syntax highlighting for the File Tree blob viewer, backed by
// Shiki's fine-grained bundle: the same TextMate grammars + VS Code themes
// VS Code itself uses. Everything Shiki needs (core, the JS regex engine,
// every grammar, the theme) lives in node_modules and is bundled by Vite
// into the app's own dist output; each is behind an explicit, statically
// analysable `import()` so it ships as a local chunk (never a CDN fetch,
// never the WASM/Oniguruma engine — see docs/agents/memories/webkitgtk-css.md
// for why a .wasm load over `tauri://` is unverified on WebKitGTK) and is
// only pulled in once a file of that language is actually opened.
import type { HighlighterCore, LanguageRegistration } from "shiki/core"

// TextMate tokenizing is synchronous per line; running it over a huge file
// would stall the UI thread for a visible moment. Plain preformatted text is
// always readable, so files past either threshold just skip highlighting.
// `.length` (UTF-16 code units) is used as a cheap proxy for byte size —
// source files are overwhelmingly ASCII, so this is close enough for a soft
// safety cutoff and avoids a full UTF-8 encode pass on every file opened.
const MAX_HIGHLIGHT_CHARS = 400_000 // ~400 KB
const MAX_HIGHLIGHT_LINES = 20_000

const THEME = "light-plus"

// Extension (lowercased, no dot) -> Shiki language id. One canonical id per
// language; the id doubles as the key into LANG_LOADERS below, so callers
// never need to know Shiki's own alias list.
const EXTENSION_LANG: Readonly<Record<string, string>> = {
  ts: "typescript",
  mts: "typescript",
  cts: "typescript",
  tsx: "tsx",
  js: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  jsx: "jsx",
  json: "json",
  css: "css",
  html: "html",
  htm: "html",
  md: "markdown",
  markdown: "markdown",
  py: "python",
  rs: "rust",
  go: "go",
  java: "java",
  c: "c",
  h: "cpp",
  cpp: "cpp",
  cc: "cpp",
  hpp: "cpp",
  cs: "csharp",
  sh: "bash",
  bash: "bash",
  yaml: "yaml",
  yml: "yaml",
  toml: "toml",
  xml: "xml",
  sql: "sql",
  rb: "ruby",
  php: "php",
  swift: "swift",
  kt: "kotlin",
  lua: "lua",
  ini: "ini",
  diff: "diff",
  patch: "diff",
}

// Basenames that carry the language in the filename rather than an
// extension (Dockerfile, Makefile have no ".ext"); matched case-insensitively.
const BASENAME_LANG: Readonly<Record<string, string>> = {
  dockerfile: "dockerfile",
  makefile: "makefile",
}

// One explicit, static `import()` per grammar — no template-string/dynamic
// specifier, so bundlers can analyse and code-split each of these on its
// own. Keyed by the same canonical id EXTENSION_LANG/BASENAME_LANG return.
const LANG_LOADERS: Readonly<Record<string, () => Promise<{ default: LanguageRegistration[] }>>> = {
  typescript: () => import("@shikijs/langs/typescript"),
  tsx: () => import("@shikijs/langs/tsx"),
  javascript: () => import("@shikijs/langs/javascript"),
  jsx: () => import("@shikijs/langs/jsx"),
  json: () => import("@shikijs/langs/json"),
  css: () => import("@shikijs/langs/css"),
  html: () => import("@shikijs/langs/html"),
  markdown: () => import("@shikijs/langs/markdown"),
  python: () => import("@shikijs/langs/python"),
  rust: () => import("@shikijs/langs/rust"),
  go: () => import("@shikijs/langs/go"),
  java: () => import("@shikijs/langs/java"),
  c: () => import("@shikijs/langs/c"),
  cpp: () => import("@shikijs/langs/cpp"),
  csharp: () => import("@shikijs/langs/csharp"),
  bash: () => import("@shikijs/langs/bash"),
  yaml: () => import("@shikijs/langs/yaml"),
  toml: () => import("@shikijs/langs/toml"),
  xml: () => import("@shikijs/langs/xml"),
  sql: () => import("@shikijs/langs/sql"),
  ruby: () => import("@shikijs/langs/ruby"),
  php: () => import("@shikijs/langs/php"),
  swift: () => import("@shikijs/langs/swift"),
  kotlin: () => import("@shikijs/langs/kotlin"),
  lua: () => import("@shikijs/langs/lua"),
  ini: () => import("@shikijs/langs/ini"),
  diff: () => import("@shikijs/langs/diff"),
  dockerfile: () => import("@shikijs/langs/dockerfile"),
  makefile: () => import("@shikijs/langs/makefile"),
}

/**
 * Maps a repo-relative (or absolute) file path to a Shiki language id, or
 * null when the extension/filename isn't recognised — callers must fall
 * back to plain text in that case.
 */
export function languageForPath(path: string): string | null {
  const slash = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"))
  const base = (slash >= 0 ? path.slice(slash + 1) : path).toLowerCase()
  const dot = base.lastIndexOf(".")
  // dot <= 0 covers both "no extension" and a dotfile like ".gitignore"
  // (its only dot is the leading one), so both fall through to the
  // basename map, which is where Dockerfile/Makefile live anyway.
  if (dot <= 0) return BASENAME_LANG[base] ?? null
  return EXTENSION_LANG[base.slice(dot + 1)] ?? BASENAME_LANG[base] ?? null
}

async function createCoreHighlighter(): Promise<HighlighterCore> {
  const [{ createHighlighterCore }, { createJavaScriptRegexEngine }, { default: lightPlus }] = await Promise.all([
    import("shiki/core"),
    import("@shikijs/engine-javascript"),
    import("@shikijs/themes/light-plus"),
  ])
  return createHighlighterCore({
    themes: [lightPlus],
    langs: [],
    // The pure-JS RegExp engine avoids loading Shiki's Oniguruma .wasm over
    // Tauri's custom `tauri://` scheme, which is unverified on the
    // WebKitGTK target and would fail silently there.
    engine: createJavaScriptRegexEngine(),
  })
}

let highlighterPromise: Promise<HighlighterCore> | null = null
const loadedLangs = new Set<string>()

function getHighlighter(): Promise<HighlighterCore> {
  if (!highlighterPromise) {
    highlighterPromise = createCoreHighlighter().catch((e: unknown) => {
      // Don't cache a permanent failure — a transient issue (e.g. a chunk
      // that failed to load) should get a fresh attempt on the next file.
      highlighterPromise = null
      throw e
    })
  }
  return highlighterPromise
}

async function ensureLanguageLoaded(highlighter: HighlighterCore, lang: string): Promise<void> {
  if (loadedLangs.has(lang)) return
  const loader = LANG_LOADERS[lang]
  if (!loader) throw new Error(`no grammar loader registered for "${lang}"`)
  const mod = await loader()
  await highlighter.loadLanguage(mod.default)
  loadedLangs.add(lang)
}

/**
 * Highlights `code` as `lang` (a language id returned by `languageForPath`)
 * and returns Shiki's HTML, or null on any failure: unrecognised language,
 * an oversized file, or anything thrown while loading/tokenizing. Callers
 * must treat null as "render plain text" — highlighting is a progressive
 * enhancement layered on top of the always-working plain view, never a
 * requirement for the pane to render.
 */
export async function highlightToHtml(code: string, lang: string | null): Promise<string | null> {
  if (!lang) return null
  if (code.length > MAX_HIGHLIGHT_CHARS) return null
  let lines = 1
  for (let i = 0; i < code.length; i++) {
    if (code.charCodeAt(i) === 10) lines++
    if (lines > MAX_HIGHLIGHT_LINES) return null
  }
  try {
    const highlighter = await getHighlighter()
    await ensureLanguageLoaded(highlighter, lang)
    return highlighter.codeToHtml(code, { lang, theme: THEME })
  } catch {
    return null
  }
}
