// Lazy, offline syntax highlighting for the File Tree blob viewer, backed by
// Shiki's fine-grained bundle: the same TextMate grammars + VS Code themes
// VS Code itself uses. Everything Shiki needs (core, the raw JS regex engine,
// every precompiled grammar, the theme) lives in node_modules and is bundled by Vite
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
const TOKEN_CACHE_MAX_CHARS = 8 * 1024 * 1024
const TOKEN_CACHE_MAX_ENTRIES = 64

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
  typescript: () => import("@shikijs/langs-precompiled/typescript"),
  tsx: () => import("@shikijs/langs-precompiled/tsx"),
  javascript: () => import("@shikijs/langs-precompiled/javascript"),
  jsx: () => import("@shikijs/langs-precompiled/jsx"),
  json: () => import("@shikijs/langs-precompiled/json"),
  css: () => import("@shikijs/langs-precompiled/css"),
  html: () => import("@shikijs/langs-precompiled/html"),
  markdown: () => import("@shikijs/langs-precompiled/markdown"),
  python: () => import("@shikijs/langs-precompiled/python"),
  rust: () => import("@shikijs/langs-precompiled/rust"),
  go: () => import("@shikijs/langs-precompiled/go"),
  java: () => import("@shikijs/langs-precompiled/java"),
  c: () => import("@shikijs/langs-precompiled/c"),
  cpp: () => import("@shikijs/langs-precompiled/cpp"),
  csharp: () => import("@shikijs/langs-precompiled/csharp"),
  bash: () => import("@shikijs/langs-precompiled/bash"),
  yaml: () => import("@shikijs/langs-precompiled/yaml"),
  toml: () => import("@shikijs/langs-precompiled/toml"),
  xml: () => import("@shikijs/langs-precompiled/xml"),
  sql: () => import("@shikijs/langs-precompiled/sql"),
  ruby: () => import("@shikijs/langs-precompiled/ruby"),
  php: () => import("@shikijs/langs-precompiled/php"),
  swift: () => import("@shikijs/langs-precompiled/swift"),
  kotlin: () => import("@shikijs/langs-precompiled/kotlin"),
  lua: () => import("@shikijs/langs-precompiled/lua"),
  ini: () => import("@shikijs/langs-precompiled/ini"),
  diff: () => import("@shikijs/langs-precompiled/diff"),
  dockerfile: () => import("@shikijs/langs-precompiled/dockerfile"),
  makefile: () => import("@shikijs/langs-precompiled/makefile"),
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
  const [{ createHighlighterCore }, { createJavaScriptRawEngine }, { default: lightPlus }, { default: darkPlus }] =
    await Promise.all([
      import("shiki/core"),
      import("@shikijs/engine-javascript"),
      import("@shikijs/themes/light-plus"),
      import("@shikijs/themes/dark-plus"),
    ])
  return createHighlighterCore({
    themes: [lightPlus, darkPlus],
    langs: [],
    // The pure-JS raw engine consumes precompiled grammars, so first use of
    // a language skips the main-thread regex compilation cost (v0.18.18)
    // while still avoiding Shiki's Oniguruma .wasm over Tauri's custom
    // `tauri://` scheme, which is unverified on the WebKitGTK target.
    engine: createJavaScriptRawEngine(),
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

export type Token = { content: string; color?: string }

const DARK_THEME = "dark-plus"

type TokenizingHighlighter = Pick<HighlighterCore, "codeToTokensBase">

type TokenCacheEntry = {
  tokens: Token[][]
  chars: number
}

const tokenCache = new Map<string, TokenCacheEntry>()
let tokenCacheChars = 0

function tokenCacheKey(code: string, lang: string, mode: "light" | "dark") {
  return `${lang}|${mode}|${code}`
}

function cachedTokens(key: string): Token[][] | null {
  const hit = tokenCache.get(key)
  if (!hit) return null
  tokenCache.delete(key)
  tokenCache.set(key, hit)
  return hit.tokens
}

function trimTokenCache() {
  while (tokenCache.size > TOKEN_CACHE_MAX_ENTRIES || tokenCacheChars > TOKEN_CACHE_MAX_CHARS) {
    const first = tokenCache.entries().next().value
    if (!first) return
    const [key, entry] = first
    tokenCache.delete(key)
    tokenCacheChars -= entry.chars
  }
}

function putTokens(key: string, tokens: Token[][], chars: number) {
  const replaced = tokenCache.get(key)
  if (replaced) {
    tokenCacheChars -= replaced.chars
    tokenCache.delete(key)
  }
  tokenCache.set(key, { tokens, chars })
  tokenCacheChars += chars
  trimTokenCache()
}

function canHighlight(code: string): boolean {
  if (code.length > MAX_HIGHLIGHT_CHARS) return false
  let lines = 1
  for (let i = 0; i < code.length; i++) {
    if (code.charCodeAt(i) === 10) lines++
    if (lines > MAX_HIGHLIGHT_LINES) return false
  }
  return true
}

function tokensFromHighlighter(
  highlighter: TokenizingHighlighter,
  code: string,
  lang: string,
  mode: "light" | "dark",
): Token[][] {
  const themed = highlighter.codeToTokensBase(code, { lang, theme: mode === "dark" ? DARK_THEME : THEME })
  return themed.map((line) => line.map((t) => ({ content: t.content, color: t.color })))
}

async function tokenizeLinesCached(
  code: string,
  lang: string | null,
  mode: "light" | "dark",
  load: () => Promise<TokenizingHighlighter>,
): Promise<Token[][] | null> {
  if (!lang) return null
  if (!canHighlight(code)) return null
  const key = tokenCacheKey(code, lang, mode)
  const cached = cachedTokens(key)
  if (cached) return cached
  const tokens = tokensFromHighlighter(await load(), code, lang, mode)
  putTokens(key, tokens, code.length)
  return tokens
}

/**
 * Tokenizes `code` as `lang` for the diff view (v0.14.3, owner: "automatic
 * language recognition and syntax highlighting" in the diff and commit
 * views): one token list per line, colours from VS Code's Light+ or Dark+
 * theme. Same limits and same null-means-plain contract as highlightToHtml.
 */
export async function tokenizeLines(
  code: string,
  lang: string | null,
  mode: "light" | "dark",
): Promise<Token[][] | null> {
  if (!lang) return null
  try {
    return await tokenizeLinesCached(code, lang, mode, async () => {
      const highlighter = await getHighlighter()
      await ensureLanguageLoaded(highlighter, lang)
      return highlighter
    })
  } catch {
    return null
  }
}

export const highlightTestHooks = {
  resetTokenCache() {
    tokenCache.clear()
    tokenCacheChars = 0
  },
  tokenizeLinesWithHighlighter(
    highlighter: TokenizingHighlighter,
    code: string,
    lang: string | null,
    mode: "light" | "dark",
  ) {
    return tokenizeLinesCached(code, lang, mode, () => Promise.resolve(highlighter))
  },
}
