import { useTheme } from "@mui/material/styles"
import { useEffect, useMemo, useState } from "react"
import { languageForPath, tokenizeLines, type Token } from "../../highlight"
import type { HunkRow } from "./roundModel"

/**
 * Syntax colours for the rows on screen (DiffView's useDiffTokens): the
 * rows' text as one stream so multi-line constructs keep their state, then
 * mapped back to the rows. Plain until the tokens arrive or when they cannot.
 */
export function useRowTokens(rows: HunkRow[], path: string): Map<HunkRow, Token[]> | null {
  const mode = useTheme().palette.mode
  const code = rows.map((r) => r.text).join("\n")
  // A shebang on line 1 names an extensionless script's language (v0.22.13).
  const firstLine = rows.find((r) => r.newNum === 1 || r.oldNum === 1)?.text
  const key = `${mode}|${path}|${code}`
  const [tokens, setTokens] = useState<{ key: string; lines: Token[][] } | null>(null)
  useEffect(() => {
    const lang = languageForPath(path, firstLine)
    if (!lang || code === "") return
    let cancelled = false
    void tokenizeLines(code, lang, mode).then((lines) => {
      if (!cancelled && lines) setTokens({ key, lines })
    })
    return () => {
      cancelled = true
    }
  }, [key, code, path, mode, firstLine])
  return useMemo(() => {
    if (!tokens || tokens.key !== key) return null
    const map = new Map<HunkRow, Token[]>()
    rows.forEach((row, i) => {
      if (i < tokens.lines.length) map.set(row, tokens.lines[i])
    })
    return map
  }, [tokens, key, rows])
}
