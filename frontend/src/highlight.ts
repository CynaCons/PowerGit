// Lazy, offline syntax highlighting for the File Tree blob viewer, backed by
// Shiki's fine-grained bundle: the same TextMate grammars + VS Code themes
// VS Code itself uses. Everything Shiki needs (core, the raw JS regex engine,
// every precompiled grammar, the theme) lives in node_modules and is bundled by Vite
// into the app's own dist output; each is behind an explicit, statically
// analysable `import()` so it ships as a local chunk (never a CDN fetch,
// never the WASM/Oniguruma engine — see docs/agents/memories/webkitgtk-css.md
// for why a .wasm load over `tauri://` is unverified on WebKitGTK) and is
// only pulled in once a file of that language is actually opened.
import type { HighlighterCore } from "shiki/core"
import { LANG_LOADERS, RUNTIME_LANG_LOADERS } from "./highlightLanguages"

export { languageForPath, languageName } from "./highlightLanguages"

// TextMate tokenizing is synchronous per line; running it over a huge file
// would stall the UI thread for a visible moment. Plain preformatted text is
// always readable, so files past either threshold just skip highlighting.
// `.length` (UTF-16 code units) is used as a cheap proxy for byte size —
// source files are overwhelmingly ASCII, so this is close enough for a soft
// safety cutoff and avoids a full UTF-8 encode pass on every file opened.
const MAX_HIGHLIGHT_CHARS = 400_000 // ~400 KB
const MAX_HIGHLIGHT_LINES = 20_000

// VS Code's Light+ / Dark+ with PowerGit's comment ink on top (v0.22.13,
// owner: comments in the review "look less like plain text"). Light+ draws
// comments green, the same hue as an added line's tint, so on an added row a
// comment read as plain code. Comments take a slate ink in italics, their
// markers (// /* */ #) a fainter one, and doc tags (@param, <summary>,
// javadoc) their own violet; Python docstrings count as comments.
const THEME = "pg-light-plus"
const DARK_THEME = "pg-dark-plus"

export const COMMENT_INK = {
  light: { text: "#6b7280", mark: "#a3a9b3", tag: "#8250df" },
  dark: { text: "#8b949e", mark: "#6e7681", tag: "#d2a8ff" },
} as const

type ThemeJson = { name?: string; tokenColors?: { scope?: string | string[]; settings: Record<string, string> }[] }

/** A copy of `base` named `name` whose comment rules win (later rules of the same selector override). */
export function withCommentInk<T extends ThemeJson>(base: T, name: string, mode: "light" | "dark"): T {
  const ink = COMMENT_INK[mode]
  return {
    ...base,
    name,
    tokenColors: [
      ...(base.tokenColors ?? []),
      {
        scope: ["comment", "string.quoted.docstring", "string.comment.buffered.block.pug"],
        settings: { foreground: ink.text, fontStyle: "italic" },
      },
      {
        scope: [
          "punctuation.definition.comment",
          "comment.block.documentation punctuation.definition.tag",
          "punctuation.definition.string.begin.docstring",
          "punctuation.definition.string.end.docstring",
        ],
        settings: { foreground: ink.mark, fontStyle: "" },
      },
      {
        scope: [
          "storage.type.class.jsdoc",
          "punctuation.definition.block.tag.jsdoc",
          "keyword.other.documentation",
          "comment.block.documentation entity.name.tag",
          "comment.block.javadoc keyword",
        ],
        settings: { foreground: ink.tag, fontStyle: "" },
      },
    ],
  }
}

const TOKEN_CACHE_MAX_CHARS = 8 * 1024 * 1024
const TOKEN_CACHE_MAX_ENTRIES = 64

type Kind = "precompiled" | "runtime"

async function createCoreHighlighter(kind: Kind): Promise<HighlighterCore> {
  const [
    { createHighlighterCore },
    { createJavaScriptRawEngine, createJavaScriptRegexEngine },
    { default: lightPlus },
    { default: darkPlus },
  ] = await Promise.all([
    import("shiki/core"),
    import("@shikijs/engine-javascript"),
    import("@shikijs/themes/light-plus"),
    import("@shikijs/themes/dark-plus"),
  ])
  return createHighlighterCore({
    themes: [withCommentInk(lightPlus, THEME, "light"), withCommentInk(darkPlus, DARK_THEME, "dark")],
    langs: [],
    // The pure-JS raw engine consumes precompiled grammars, so first use of
    // a language skips the main-thread regex compilation cost (v0.18.18)
    // while still avoiding Shiki's Oniguruma .wasm over Tauri's custom
    // `tauri://` scheme, which is unverified on the WebKitGTK target.
    // The few grammars whose precompiled form is broken
    // (highlightLanguages.ts RUNTIME_LANG_LOADERS) compile on the JS regex
    // engine instead, in a highlighter of their own.
    engine: kind === "runtime" ? createJavaScriptRegexEngine() : createJavaScriptRawEngine(),
  })
}

const highlighterPromises: Partial<Record<Kind, Promise<HighlighterCore>>> = {}
const loadedLangs = new Set<string>()

const kindOf = (lang: string): Kind => (lang in RUNTIME_LANG_LOADERS ? "runtime" : "precompiled")

function getHighlighter(lang: string): Promise<HighlighterCore> {
  const kind = kindOf(lang)
  const existing = highlighterPromises[kind]
  if (existing) return existing
  const created = createCoreHighlighter(kind).catch((e: unknown) => {
    // Don't cache a permanent failure — a transient issue (e.g. a chunk
    // that failed to load) should get a fresh attempt on the next file.
    delete highlighterPromises[kind]
    throw e
  })
  highlighterPromises[kind] = created
  return created
}

async function ensureLanguageLoaded(highlighter: HighlighterCore, lang: string): Promise<void> {
  if (loadedLangs.has(lang)) return
  const loader = RUNTIME_LANG_LOADERS[lang] ?? LANG_LOADERS[lang]
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
    const highlighter = await getHighlighter(lang)
    await ensureLanguageLoaded(highlighter, lang)
    return highlighter.codeToHtml(code, { lang, theme: THEME })
  } catch {
    return null
  }
}

/**
 * One coloured run of a line. `italic` comes from the theme (comments);
 * `tag` marks a TODO / FIXME / HACK / XXX / NOTE inside a comment, drawn as
 * a small label (codeTokens.tsx).
 */
export type Token = { content: string; color?: string; italic?: boolean; tag?: boolean }

const HAS_TAG = /\b(?:TODO|FIXME|HACK|XXX|NOTE)\b/
const CODE_TAG = new RegExp(HAS_TAG.source, "g")

/** Splits the comment runs of a line around their TODO-style tags. */
export function markCommentTags(line: Token[], mode: "light" | "dark"): Token[] {
  const ink = COMMENT_INK[mode].text
  // A comment run: the comment ink, or italic (only comments are, in these
  // themes; some grammars give a codetag its own keyword colour).
  const inComment = (t: Token) => t.italic === true || t.color?.toLowerCase() === ink
  if (!line.some((t) => inComment(t) && HAS_TAG.test(t.content))) return line
  const out: Token[] = []
  for (const t of line) {
    if (!inComment(t) || !HAS_TAG.test(t.content)) {
      out.push(t)
      continue
    }
    let at = 0
    for (const m of t.content.matchAll(CODE_TAG)) {
      if (m.index > at) out.push({ ...t, content: t.content.slice(at, m.index) })
      out.push({ content: m[0], color: t.color, tag: true })
      at = m.index + m[0].length
    }
    if (at < t.content.length) out.push({ ...t, content: t.content.slice(at) })
  }
  return out
}

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
  return themed.map((line) =>
    markCommentTags(
      line.map((t) => {
        const token: Token = { content: t.content, color: t.color }
        // Shiki's FontStyle.Italic is bit 1; -1 / undefined mean "not set".
        if (t.fontStyle !== undefined && t.fontStyle > 0 && (t.fontStyle & 1) === 1) token.italic = true
        return token
      }),
      mode,
    ),
  )
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
      const highlighter = await getHighlighter(lang)
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
