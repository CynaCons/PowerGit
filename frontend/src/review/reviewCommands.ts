import { withComment, withLine, type LineKey, type ReviewDoc } from "./reviewModel"

export const COMMAND_HINT = "/comment <text> · /ok · /reject · /clear"

export type ReviewCommand = { kind: "comment"; text: string } | { kind: "ok" } | { kind: "reject" } | { kind: "clear" }

export type CommandError = { error: "missing-text" | "unknown" | "empty"; hint: string }

export function parseCommand(input: string): ReviewCommand | CommandError {
  const value = input.trim()
  if (!value || value === "/") return { error: "empty", hint: COMMAND_HINT }
  const match = value.match(/^\/(\S+)(?:\s+([\s\S]*))?$/)
  if (!match) return { error: "unknown", hint: `Unknown command: ${value} — try /comment, /ok, /reject, /clear` }
  const name = `/${match[1]}`
  const text = match[2]?.trim() ?? ""
  if (name === "/comment" || name === "/c") {
    return text ? { kind: "comment", text } : { error: "missing-text", hint: "Usage: /comment <text>" }
  }
  if (name === "/ok") return { kind: "ok" }
  if (name === "/reject" || name === "/rej" || name === "/x") return { kind: "reject" }
  if (name === "/clear") return { kind: "clear" }
  return { error: "unknown", hint: `Unknown command: ${name} — try /comment, /ok, /reject, /clear` }
}

export function applyCommand(doc: ReviewDoc, path: string, key: LineKey, command: ReviewCommand): ReviewDoc {
  if (command.kind === "comment") return withComment(doc, path, key, command.text)
  if (command.kind === "ok") return withLine(doc, path, key, "ok")
  if (command.kind === "reject") return withLine(doc, path, key, "rejected")
  return withLine(doc, path, key, undefined)
}
