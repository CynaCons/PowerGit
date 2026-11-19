// File path -> Shiki language (split from highlight.ts in v0.22.13): the
// extension and basename tables, a shebang fallback, one lazy grammar loader
// per language, and the names the review's language label shows.
import type { LanguageRegistration } from "shiki/core"

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
  // v0.22.13: more of what agents touch at work, all precompiled grammars
  // already in node_modules (owner: "better language support").
  ps1: "powershell",
  psm1: "powershell",
  psd1: "powershell",
  scss: "scss",
  less: "less",
  cshtml: "razor",
  razor: "razor",
  vue: "vue",
  svelte: "svelte",
  astro: "astro",
  tf: "terraform",
  tfvars: "terraform",
  hcl: "hcl",
  graphql: "graphql",
  gql: "graphql",
  proto: "proto",
  cmake: "cmake",
  fs: "fsharp",
  fsx: "fsharp",
  fsi: "fsharp",
  vb: "vb",
  bat: "bat",
  cmd: "bat",
  jsonc: "jsonc",
  json5: "jsonc",
  dart: "dart",
  scala: "scala",
  sc: "scala",
  r: "r",
  pl: "perl",
  pm: "perl",
  groovy: "groovy",
  gradle: "groovy",
  ex: "elixir",
  exs: "elixir",
  hs: "haskell",
  zig: "zig",
  nix: "nix",
  prisma: "prisma",
  properties: "properties",
  m: "objective-c",
  mm: "objective-c",
  hbs: "handlebars",
  handlebars: "handlebars",
  csproj: "xml",
  fsproj: "xml",
  vbproj: "xml",
  props: "xml",
  targets: "xml",
  resx: "xml",
  xaml: "xml",
  svg: "xml",
  plist: "xml",
}

// Basenames that carry the language in the filename rather than an
// extension (Dockerfile, Makefile have no ".ext"); matched case-insensitively.
const BASENAME_LANG: Readonly<Record<string, string>> = {
  dockerfile: "dockerfile",
  makefile: "makefile",
  "cmakelists.txt": "cmake",
  "nginx.conf": "nginx",
  ".env": "dotenv",
  commit_editmsg: "git-commit",
  "tsconfig.json": "jsonc",
  "jsconfig.json": "jsonc",
  ".eslintrc.json": "jsonc",
  "settings.json": "jsonc",
  "launch.json": "jsonc",
  jenkinsfile: "groovy",
  gemfile: "ruby",
  rakefile: "ruby",
}

// One explicit, static `import()` per grammar — no template-string/dynamic
// specifier, so bundlers can analyse and code-split each of these on its
// own. Keyed by the same canonical id EXTENSION_LANG/BASENAME_LANG return.
export const LANG_LOADERS: Readonly<Record<string, () => Promise<{ default: LanguageRegistration[] }>>> = {
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
  powershell: () => import("@shikijs/langs-precompiled/powershell"),
  scss: () => import("@shikijs/langs-precompiled/scss"),
  less: () => import("@shikijs/langs-precompiled/less"),
  razor: () => import("@shikijs/langs-precompiled/razor"),
  vue: () => import("@shikijs/langs-precompiled/vue"),
  svelte: () => import("@shikijs/langs-precompiled/svelte"),
  astro: () => import("@shikijs/langs-precompiled/astro"),
  terraform: () => import("@shikijs/langs-precompiled/terraform"),
  hcl: () => import("@shikijs/langs-precompiled/hcl"),
  graphql: () => import("@shikijs/langs-precompiled/graphql"),
  proto: () => import("@shikijs/langs-precompiled/proto"),
  cmake: () => import("@shikijs/langs-precompiled/cmake"),
  fsharp: () => import("@shikijs/langs-precompiled/fsharp"),
  vb: () => import("@shikijs/langs-precompiled/vb"),
  bat: () => import("@shikijs/langs-precompiled/bat"),
  jsonc: () => import("@shikijs/langs-precompiled/jsonc"),
  dart: () => import("@shikijs/langs-precompiled/dart"),
  scala: () => import("@shikijs/langs-precompiled/scala"),
  r: () => import("@shikijs/langs-precompiled/r"),
  perl: () => import("@shikijs/langs-precompiled/perl"),
  groovy: () => import("@shikijs/langs-precompiled/groovy"),
  elixir: () => import("@shikijs/langs-precompiled/elixir"),
  haskell: () => import("@shikijs/langs-precompiled/haskell"),
  zig: () => import("@shikijs/langs-precompiled/zig"),
  nix: () => import("@shikijs/langs-precompiled/nix"),
  prisma: () => import("@shikijs/langs-precompiled/prisma"),
  properties: () => import("@shikijs/langs-precompiled/properties"),
  "objective-c": () => import("@shikijs/langs-precompiled/objective-c"),
  handlebars: () => import("@shikijs/langs-precompiled/handlebars"),
  nginx: () => import("@shikijs/langs-precompiled/nginx"),
  dotenv: () => import("@shikijs/langs-precompiled/dotenv"),
  "git-commit": () => import("@shikijs/langs-precompiled/git-commit"),
}

// Grammars whose precompiled form is broken (v0.22.13): an end pattern that
// refers back to its begin (Python's """ docstrings, Markdown's ``` fences,
// Rust's r#"..."# strings) was precompiled to "never match", so after the
// first one the rest of the file kept that colour. These load as TextMate
// sources and compile at first use on the JS regex engine (tens of ms; C++
// has the same defect in raw strings but takes over a second, so it stays).
export const RUNTIME_LANG_LOADERS: Readonly<Record<string, () => Promise<{ default: LanguageRegistration[] }>>> = {
  python: () => import("@shikijs/langs/python"),
  markdown: () => import("@shikijs/langs/markdown"),
  rust: () => import("@shikijs/langs/rust"),
}

// Scripts without an extension name their interpreter on line 1.
const SHEBANG_LANG: readonly [RegExp, string][] = [
  [/\b(?:python[0-9.]*)\b/, "python"],
  [/\b(?:node|deno|bun)\b/, "javascript"],
  [/\b(?:bash|sh|zsh|ksh|dash)\b/, "bash"],
  [/\bpwsh\b|\bpowershell\b/, "powershell"],
  [/\bruby\b/, "ruby"],
  [/\bperl\b/, "perl"],
  [/\bphp\b/, "php"],
  [/\blua\b/, "lua"],
]

const LANG_NAMES: Readonly<Record<string, string>> = {
  typescript: "TypeScript",
  tsx: "TSX",
  javascript: "JavaScript",
  jsx: "JSX",
  json: "JSON",
  jsonc: "JSON with comments",
  css: "CSS",
  scss: "SCSS",
  less: "Less",
  html: "HTML",
  markdown: "Markdown",
  python: "Python",
  rust: "Rust",
  go: "Go",
  java: "Java",
  c: "C",
  cpp: "C++",
  csharp: "C#",
  fsharp: "F#",
  vb: "Visual Basic",
  bash: "Shell",
  powershell: "PowerShell",
  bat: "Batch",
  yaml: "YAML",
  toml: "TOML",
  xml: "XML",
  sql: "SQL",
  ruby: "Ruby",
  php: "PHP",
  swift: "Swift",
  kotlin: "Kotlin",
  lua: "Lua",
  ini: "INI",
  diff: "Diff",
  dockerfile: "Dockerfile",
  makefile: "Makefile",
  razor: "Razor",
  vue: "Vue",
  svelte: "Svelte",
  astro: "Astro",
  terraform: "Terraform",
  hcl: "HCL",
  graphql: "GraphQL",
  proto: "Protocol Buffers",
  cmake: "CMake",
  dart: "Dart",
  scala: "Scala",
  r: "R",
  perl: "Perl",
  groovy: "Groovy",
  elixir: "Elixir",
  haskell: "Haskell",
  zig: "Zig",
  nix: "Nix",
  prisma: "Prisma",
  properties: "Properties",
  "objective-c": "Objective-C",
  handlebars: "Handlebars",
  nginx: "nginx",
  dotenv: ".env",
  "git-commit": "Commit message",
}

/** The language's display name for a label ("C#", "PowerShell"). */
export function languageName(lang: string): string {
  return LANG_NAMES[lang] ?? lang
}

/**
 * Maps a repo-relative (or absolute) file path to a Shiki language id, or
 * null when the extension/filename isn't recognised — callers must fall
 * back to plain text in that case.
 */
export function languageForPath(path: string, firstLine?: string): string | null {
  const byName = languageForName(path)
  if (byName || firstLine === undefined || !firstLine.startsWith("#!")) return byName
  return SHEBANG_LANG.find(([re]) => re.test(firstLine))?.[1] ?? null
}

function languageForName(path: string): string | null {
  const slash = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"))
  const base = (slash >= 0 ? path.slice(slash + 1) : path).toLowerCase()
  const dot = base.lastIndexOf(".")
  // dot <= 0 covers both "no extension" and a dotfile like ".gitignore"
  // (its only dot is the leading one), so both fall through to the
  // basename map, which is where Dockerfile/Makefile live anyway.
  // The basename first: tsconfig.json is JSON with comments, not JSON.
  if (dot <= 0) return BASENAME_LANG[base] ?? null
  return BASENAME_LANG[base] ?? EXTENSION_LANG[base.slice(dot + 1)] ?? null
}
