import { describe, expect, it } from "vitest"
import { emptyDoc } from "./reviewModel"
import { applyCommand, COMMAND_HINT, parseCommand } from "./reviewCommands"

describe("parseCommand", () => {
  it("parses comments and aliases with surrounding whitespace", () => {
    expect(parseCommand(" /comment needs a guard ")).toEqual({ kind: "comment", text: "needs a guard" })
    expect(parseCommand("/c short")).toEqual({ kind: "comment", text: "short" })
  })

  it("parses marking commands and aliases", () => {
    expect(parseCommand("/ok")).toEqual({ kind: "ok" })
    expect(parseCommand("/reject")).toEqual({ kind: "reject" })
    expect(parseCommand("/rej")).toEqual({ kind: "reject" })
    expect(parseCommand("/x")).toEqual({ kind: "reject" })
    expect(parseCommand("/clear")).toEqual({ kind: "clear" })
  })

  it("returns actionable errors", () => {
    expect(parseCommand("/comment")).toEqual({ error: "missing-text", hint: "Usage: /comment <text>" })
    expect(parseCommand("/bogus")).toEqual({
      error: "unknown",
      hint: "Unknown command: /bogus — try /comment, /ok, /reject, /clear",
    })
    expect(parseCommand("/")).toEqual({ error: "empty", hint: COMMAND_HINT })
    expect(parseCommand("")).toEqual({ error: "empty", hint: COMMAND_HINT })
  })
})

it("applyCommand maps commands to immutable model updates", () => {
  const base = emptyDoc("c")
  const commented = applyCommand(base, "f", "+2", { kind: "comment", text: "guard" })
  expect(commented.files.f.comments).toEqual([{ line: "+2", text: "guard" }])
  const rejected = applyCommand(commented, "f", "+2", { kind: "reject" })
  expect(rejected.files.f.lines["+2"]).toBe("rejected")
  const ok = applyCommand(rejected, "f", "+2", { kind: "ok" })
  expect(ok.files.f.lines["+2"]).toBe("ok")
  expect(applyCommand(ok, "f", "+2", { kind: "clear" }).files.f.lines["+2"]).toBeUndefined()
})
