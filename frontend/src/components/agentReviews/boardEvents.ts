// PowerGit's own board posts (round opened/sent, approved, cancelled,
// closed — engine GitHost.AgentReviewBoard.cs) parsed for the event row
// (v0.21.11): the first line becomes the one-line event ("Round 2 sent ·
// 3 accepted · 1 rejected", the engine's " · review <id>" dropped), the
// ✗/~/?/✓ verdict lines keep their marks with the two-space indented
// lines under their parent, "details:" lines are quoted, review_id= is
// dropped, and everything else (the round title, the agent's why/note,
// "cN answered:") is Markdown.

export type VerdictLine = {
  mark: string
  text: string
  children: string[]
}

export type PowerGitEvent = {
  event: string
  markdown: string
  verdicts: VerdictLine[]
  details: string
}

const VERDICT = /^[✗~?✓] /
const INDENTED = /^ {2}\S/
const DETAILS = /^details: /

export function parsePowerGitEvent(text: string): PowerGitEvent {
  const lines = text.split("\n").filter((l) => !l.startsWith("review_id="))
  const markdown: string[] = []
  const verdicts: VerdictLine[] = []
  let details = ""
  for (const line of lines.slice(1)) {
    if (VERDICT.test(line)) {
      verdicts.push({ mark: line[0], text: line.slice(2), children: [] })
    } else if (INDENTED.test(line) && verdicts.length > 0) {
      verdicts[verdicts.length - 1].children.push(line.replace(/^ {2}/, ""))
    } else if (DETAILS.test(line)) {
      details = line
    } else {
      markdown.push(line)
    }
  }
  return {
    event: (lines[0] ?? "").replace(/ · review \w+/, ""),
    markdown: markdown.join("\n").trim(),
    verdicts,
    details,
  }
}
