// How the board reads PowerGit's own posts and the comment references in the
// others (v0.21.11; v0.21.12 lane design).
//
// Round events (engine GitHost.AgentReviewBoard.cs) are recognised by their
// first line, whoever posted them: "Round 2 sent" and "Approved" go out under
// the owner's name so the agent sees them as the owner's. The first line
// splits into a title ("Round 2 sent") and its facts ("0 accepted, 1
// rejected, …", the engine's "review <id>" dropped); the ✗/~/?/✓ verdict
// lines keep their marks with the two-space indented lines under their
// parent; "details:" lines are quoted; review_id= and the agent-facing
// "Reply with `cN: …`" hint are dropped; everything else (the round title,
// the agent's why or note) is Markdown. v0.22.9, owner: the per-file dump
// "is really polluting the chat": the verdict lines, comments listed without
// a verdict above them and the "cN explains / answered" lists are the
// event's extra lines, which the board keeps folded.

export type VerdictLine = {
  mark: string
  text: string
  children: string[]
}

export type EventKind = "opened" | "sent" | "approved" | "cancelled" | "closed"

export type PowerGitEvent = {
  kind: EventKind
  title: string
  facts: string
  markdown: string
  verdicts: VerdictLine[]
  /** Listed comments without a verdict line above them, and "cN explains / answered" lines. */
  extra: string[]
  details: string
}

const EVENT: [RegExp, EventKind][] = [
  [/^Round \d+ opened\b/, "opened"],
  [/^Round \d+ sent\b/, "sent"],
  [/^Approved\b/, "approved"],
  [/^Cancelled\b/, "cancelled"],
  [/^Review closed\b/, "closed"],
]
const VERDICT = /^[✗~?✓] /
const INDENTED = /^ {2}\S/
const DETAILS = /^details: /
const AGENT_HINT = /^Reply with `cN/
const LISTED = /^c\d+ (explains|answered)\b/

export function eventKind(text: string): EventKind | null {
  const first = text.split("\n", 1)[0]
  return EVENT.find(([re]) => re.test(first))?.[1] ?? null
}

export function parsePowerGitEvent(text: string): PowerGitEvent {
  const lines = text.split("\n").filter((l) => !l.startsWith("review_id=") && !AGENT_HINT.test(l))
  const markdown: string[] = []
  const verdicts: VerdictLine[] = []
  const extra: string[] = []
  let details = ""
  for (const line of lines.slice(1)) {
    if (VERDICT.test(line)) {
      verdicts.push({ mark: line[0], text: line.slice(2), children: [] })
    } else if (INDENTED.test(line) && verdicts.length > 0) {
      verdicts[verdicts.length - 1].children.push(line.replace(/^ {2}/, ""))
    } else if (INDENTED.test(line) || LISTED.test(line)) {
      extra.push(line.trim())
    } else if (DETAILS.test(line)) {
      details = line
    } else {
      markdown.push(line)
    }
  }
  const parts = (lines[0] ?? "").split(" · ").filter((p) => !/^review \w+$/.test(p))
  return {
    kind: eventKind(text) ?? "closed",
    title: parts[0] ?? "",
    facts: parts.slice(1).join(", "),
    markdown: markdown.join("\n").trim(),
    verdicts,
    extra,
    details,
  }
}

export type CommentPost = {
  /** The comment the post is about (c3), or null. */
  ref: string | null
  /** Where the comment sits ("src/a.ts:12"), for the owner's asked questions. */
  where: string | null
  /** The text without the reference prefix. */
  body: string
}

/**
 * "c3 · src/a.ts:12\nWhy?" (an asked question) and "c3: because" (the
 * agent's answer) carry their reference up front; the board shows it as a
 * link and the rest as the post.
 */
export function commentPost(text: string): CommentPost {
  const asked = /^(c\d+) · (\S.*)\n/.exec(text)
  if (asked) return { ref: asked[1], where: asked[2], body: text.slice(asked[0].length) }
  const answer = /^\s*(c\d+)\s*:\s*/.exec(text)
  if (answer) return { ref: answer[1], where: null, body: text.slice(answer[0].length) }
  return { ref: null, where: null, body: text }
}

/** "auth-fix" → "AF", "claude" → "CL". */
export function initialsOf(name: string): string {
  const parts = name.split(/[\s._-]+/).filter(Boolean)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return (parts[0] ?? "?").slice(0, 2).toUpperCase()
}
