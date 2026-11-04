// The class and function a change sits in (v0.22.11, owner: "I would like to
// see the class and the function. So if it's before the context that I see, I
// don't see it"). Git's hunk header holds one line, and without a diff driver
// only an unindented one, so it stops at the class. This walks up the file's
// new side from the first change, taking each shallower line that opens a
// class or a function. Python, C and C++; any other file, or a card without
// the file, keeps git's own text.

import type { RoundHunk } from "./roundModel"

type Language = {
  /** A line that says nothing about the nesting: comments, directives, labels. */
  skip: RegExp
  comment: RegExp
  /** What ends a header line and is not worth showing. */
  opener: RegExp
  header: (title: string, opened: boolean, indent: number) => boolean
  /** Python nests functions; C and C++ do not. */
  isFunction?: (title: string) => boolean
}

const PYTHON: Language = {
  skip: /^#/,
  comment: /\s+#.*$/,
  opener: /\s*:$/,
  header: (title) => /^(?:async\s+def|def|class)\b/.test(title),
}

const C_TYPE = /^(?:template\s*<.*>\s*)?(?:class|struct|union|enum|namespace)\b/
const C_KEYWORD =
  /^(?:if|else|for|while|do|switch|case|default|return|catch|try|throw|goto|sizeof|new|delete|using|typedef)\b/

const C_FAMILY: Language = {
  skip: /^(?:#|\/\/|\/\*|\*|\w+(?:\s+\w+)?:$)/,
  comment: /\s*(?:\/\/|\/\*).*$/,
  opener: /\s*\{$/,
  header(title, opened, indent) {
    if (/[;}]$/.test(title)) return false
    const paren = title.indexOf("(")
    const before = paren < 0 ? title : title.slice(0, paren)
    if (before.includes("=") && !before.includes("operator")) return false
    if (C_TYPE.test(title)) return true
    if (paren < 0 || C_KEYWORD.test(title)) return false
    // A call has no type before its name and no body after it. A qualified
    // name can still be a call unless it starts at the margin or closes here.
    if (opened || /\s/.test(before.trim())) return true
    return before.includes("::") && (indent === 0 || !title.endsWith(","))
  },
  isFunction: (title) => !C_TYPE.test(title),
}

function languageOf(path: string): Language | null {
  if (/\.pyw?$|\.pyi$/i.test(path)) return PYTHON
  if (/\.(?:c|cc|cpp|cxx|h|hh|hpp|hxx|ipp|tcc)$/i.test(path)) return C_FAMILY
  return null
}

const indentOf = (line: string) => {
  let width = 0
  for (const ch of line) {
    if (ch === " ") width += 1
    else if (ch === "\t") width += 4
    else break
  }
  return width
}

/** The new side's line above a hunk's first change; a change with no line of its own sits after it. */
function lineAbove(hunk: RoundHunk, first: number): number {
  const row = hunk.rows[first]
  if (row.newNum !== null) return row.newNum - 1
  const before = hunk.rows[first - 1]?.newNum
  if (before !== null && before !== undefined) return before
  // Git gives the line before as the start of an empty side (roundContext.ts).
  return hunk.rows.some((r) => r.newNum !== null) ? hunk.newStart - 1 : hunk.newStart
}

/** The headers enclosing a hunk's first change, outermost first. */
export function scopeOf(path: string, source: string[] | null, hunk: RoundHunk): string[] {
  const language = languageOf(path)
  if (!language || !source) return []
  const changed = hunk.rows.filter((r) => r.kind !== "context")
  const start = changed.find((r) => r.text.trim() !== "")
  if (!start) return []
  const scope: string[] = []
  let current = indentOf(start.text)
  // The last line was a lone `{`: the header sits at its indent, not above it.
  let opened = false
  const above = lineAbove(
    hunk,
    hunk.rows.findIndex((r) => r.kind !== "context"),
  )
  for (let n = Math.min(above, source.length); n >= 1 && current > 0; n--) {
    const text = source[n - 1].trim()
    if (text === "" || language.skip.test(text)) continue
    const indent = indentOf(source[n - 1])
    if (indent >= current) continue
    const code = text.replace(language.comment, "")
    // A line that closes a signature or opens a body belongs to the header at its indent.
    if (/^[{}\])]/.test(code)) {
      current = indent + 1
      opened = code === "{"
      continue
    }
    const title = code.replace(language.opener, "")
    if (language.header(title, opened || code.endsWith("{"), indent)) {
      // C has no function in a function: the inner one was a block, as `list_for_each(pos, head) {`.
      const { isFunction } = language
      if (isFunction && scope.length > 0 && isFunction(scope[0]) && isFunction(title)) scope[0] = title
      else scope.unshift(title)
    }
    current = indent
    opened = false
  }
  return scope
}

/** A card's title: the hunk's line numbers, then its class and function or else git's own text. */
export function hunkTitle(path: string, source: string[] | null, hunk: RoundHunk): { numbers: string; scope: string } {
  const m = /^(@@ .*? @@) ?(.*)$/.exec(hunk.header)
  const scope = scopeOf(path, source, hunk)
  return { numbers: m?.[1] ?? hunk.header, scope: scope.length > 0 ? scope.join(" › ") : (m?.[2] ?? "") }
}
