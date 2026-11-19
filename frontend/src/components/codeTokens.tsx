import type { Token } from "../highlight"

/**
 * Syntax runs as spans, shared by the diff view and the agent review
 * (v0.22.13): the token's colour, comments in italics, and a TODO / FIXME
 * inside a comment as a small label (app.css .code-tag).
 */
export function codeTokens(tokens: Token[]) {
  return tokens.map((t, j) =>
    t.tag ? (
      <span key={j} className="diff-token code-tag">
        {t.content}
      </span>
    ) : (
      <span key={j} className="diff-token" style={{ color: t.color, fontStyle: t.italic ? "italic" : undefined }}>
        {t.content}
      </span>
    ),
  )
}
