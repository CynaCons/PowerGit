// Markdown for the review board (v0.21.11; owner: "right side panel shall
// have a better format, and agents should be encouraged to structure their
// text, maybe with markdown format. Now it's just a blob of text."): the
// agent's posts, the owner's comments and the board's own events rendered
// through react-markdown + remark-gfm with the app's compact type scale.
//
// Deliberately safe by construction (brief, v0.21.11): no rehype-raw, so
// raw HTML is escaped to text; fenced code is highlighted through
// highlight.ts' tokenizeLines as spans (never innerHTML); links exist only
// for http:/https: and open through the shell's openExternal — every other
// scheme renders as plain text.
import { useEffect, useRef, useState } from "react"
import Box from "@mui/material/Box"
import Button from "@mui/material/Button"
import { useTheme } from "@mui/material/styles"
import ReactMarkdown, { type Components } from "react-markdown"
import remarkGfm from "remark-gfm"
import { tokenizeLines, type Token } from "../highlight"
import { openExternal } from "../hooks/useOperationActions"

// Fence language (lower-cased) -> Shiki grammar id (the LANG_LOADERS keys in
// highlight.ts). A fence whose language is not here renders as plain text.
const FENCE_LANG: Record<string, string> = {
  ts: "typescript",
  tsx: "typescriptx",
  typescript: "typescript",
  js: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  javascript: "javascript",
  jsx: "jsx",
  json: "json",
  css: "css",
  html: "html",
  htm: "html",
  xml: "xml",
  md: "markdown",
  markdown: "markdown",
  py: "python",
  python: "python",
  rs: "rust",
  rust: "rust",
  go: "go",
  java: "java",
  c: "c",
  h: "cpp",
  cpp: "cpp",
  cc: "cpp",
  hpp: "cpp",
  cs: "csharp",
  csharp: "csharp",
  sh: "bash",
  bash: "bash",
  shell: "bash",
  zsh: "bash",
  yaml: "yaml",
  yml: "yaml",
  toml: "toml",
  sql: "sql",
  rb: "ruby",
  ruby: "ruby",
  php: "php",
  swift: "swift",
  kt: "kotlin",
  kotlin: "kotlin",
  lua: "lua",
  ini: "ini",
  diff: "diff",
  patch: "diff",
  dockerfile: "dockerfile",
  makefile: "makefile",
}

/** react-markdown hands the fence's code text over with a trailing newline. */
function codeText(children: React.ReactNode): string {
  if (typeof children === "string") return children
  if (Array.isArray(children)) return children.map(codeText).join("")
  return ""
}

/** A fenced code block: tokenized through highlight.ts once the grammar
 *  arrives, plain until then and forever when it fails. No innerHTML. */
function CodeBlock({ code, lang }: { code: string; lang: string }) {
  const mode = useTheme().palette.mode
  const [tokens, setTokens] = useState<Token[][] | null>(null)
  useEffect(() => {
    let cancelled = false
    void tokenizeLines(code, lang, mode).then((lines) => {
      if (!cancelled && lines) setTokens(lines)
    })
    return () => {
      cancelled = true
    }
  }, [code, lang, mode])
  if (!tokens) return <code>{code}</code>
  return (
    <code>
      {tokens.map((line, i) => (
        <span key={i} style={{ display: "block" }}>
          {line.map((t, j) => (
            <span key={j} style={t.color ? { color: t.color } : undefined}>
              {t.content}
            </span>
          ))}
        </span>
      ))}
    </code>
  )
}

const components: Components = {
  // Only http/https become links, and they open through the shell (Tauri's
  // opener, window.open in a browser) — a plain href would navigate the
  // Tauri webview away from the app. Everything else is plain text.
  a({ href, children }) {
    if (!href || !/^https?:\/\//.test(href)) return <>{children}</>
    return (
      <a
        href={href}
        onClick={(e: React.MouseEvent) => {
          e.preventDefault()
          void openExternal(href)
        }}
      >
        {children}
      </a>
    )
  },
  code({ className, children }) {
    const match = /language-([\w-]+)/.exec(className ?? "")
    if (!match) return <code className={className}>{children}</code>
    const lang = FENCE_LANG[match[1].toLowerCase()]
    const code = codeText(children).replace(/\n$/, "")
    if (!lang) return <code className={className}>{code}</code>
    return <CodeBlock code={code} lang={lang} />
  },
  table({ children }) {
    return (
      <Box sx={{ overflowX: "auto", maxWidth: "100%" }}>
        <Box
          component="table"
          sx={{
            borderCollapse: "collapse",
            fontSize: 13,
            lineHeight: 1.5,
            "& th, & td": {
              border: 1,
              borderColor: "divider",
              px: 0.5,
              py: 0.25,
              textAlign: "left",
              verticalAlign: "top",
            },
            "& th": { fontWeight: 600, bgcolor: "action.hover" },
          }}
        >
          {children}
        </Box>
      </Box>
    )
  },
}

// The fold: ~14 lines of the 13 px / 1.5 body, measured on mount — the
// content div is rendered unclipped once, and only when it is taller than
// the budget does the "Show more" button appear. jsdom has no layout (its
// scrollHeight stays 0), so the browser's real measurement is used when it
// is available and a ~60-column wrap estimate stands in for tests.
const FOLD_LINES = 14
const LINE_PX = 13 * 1.5
const FOLD_HEIGHT = FOLD_LINES * LINE_PX

function estimateHeightPx(text: string): number {
  let lines = 0
  for (const para of text.split("\n")) lines += Math.max(1, Math.ceil(para.length / 60))
  return lines * LINE_PX
}

export function Markdown({ text, fold }: { text: string; fold?: boolean }) {
  const contentRef = useRef<HTMLDivElement | null>(null)
  const [expanded, setExpanded] = useState(false)
  const [clipped, setClipped] = useState(false)
  useEffect(() => {
    setExpanded(false)
    setClipped(false)
    const el = contentRef.current
    if (!fold) return
    const measured = el?.scrollHeight ?? 0
    const height = measured > 0 ? measured : estimateHeightPx(text)
    if (height > FOLD_HEIGHT + 1) setClipped(true)
  }, [text, fold])
  return (
    <Box
      data-testid="markdown"
      sx={{
        fontSize: 13,
        lineHeight: 1.5,
        overflowWrap: "anywhere",
        "& p": { m: "0.5em 0" },
        "& h1, & h2, & h3, & h4, & h5, & h6": { fontWeight: 700, lineHeight: 1.5, m: "0.5em 0" },
        "& h1": { fontSize: 15 },
        "& h2": { fontSize: 14 },
        "& h3, & h4, & h5, & h6": { fontSize: 13 },
        "& ul, & ol": { pl: "18px", m: "0.25em 0" },
        "& .task-list-item": { listStyle: "none" },
        "& .task-list-item input": { mr: 0.5 },
        "& blockquote": {
          m: "0.5em 0",
          pl: 0.75,
          borderLeft: 2,
          borderColor: "divider",
          color: "text.secondary",
        },
        "& a": { color: "primary.main", "&:hover": { textDecoration: "underline" } },
        "& code": {
          fontFamily: "var(--pg-font-mono, monospace)",
          bgcolor: "action.hover",
          borderRadius: 0.5,
          px: 0.25,
          fontSize: "0.92em",
        },
        "& pre": {
          m: "0.5em 0",
          p: 0.75,
          bgcolor: "action.hover",
          borderRadius: 1,
          overflowX: "auto",
          fontFamily: "var(--pg-font-mono, monospace)",
          fontSize: 12,
          lineHeight: 1.5,
        },
        "& pre code": { bgcolor: "transparent", p: 0, fontSize: "inherit" },
      }}
    >
      <Box ref={contentRef} sx={clipped && !expanded ? { maxHeight: FOLD_HEIGHT, overflow: "hidden" } : undefined}>
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
          {text}
        </ReactMarkdown>
      </Box>
      {clipped && (
        <Button size="small" sx={{ textTransform: "none", mt: 0.25 }} onClick={() => setExpanded((v) => !v)}>
          {expanded ? "Show less" : "Show more"}
        </Button>
      )}
    </Box>
  )
}
