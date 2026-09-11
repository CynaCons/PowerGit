import { describe, expect, it } from "vitest"
import { DEFAULT_GIT_CONSOLE, parseGitConsoleState } from "./gitConsoleState"

// The stored shape gained a `tab` in v0.15.3. Anyone upgrading has a stored
// value written by v0.15.1 that has no tab at all, and it must not open the
// panel on a log that did not exist yet.

describe("parseGitConsoleState", () => {
  it("falls back to the defaults for nothing, rubbish or the wrong types", () => {
    expect(parseGitConsoleState(null)).toEqual(DEFAULT_GIT_CONSOLE)
    expect(parseGitConsoleState("not json")).toEqual(DEFAULT_GIT_CONSOLE)
    expect(parseGitConsoleState('{"open":"yes","height":"tall","tab":7}')).toEqual(DEFAULT_GIT_CONSOLE)
  })

  it("reads a v0.15.1 value, which has no tab, as the git tab", () => {
    expect(parseGitConsoleState('{"open":true,"height":200}')).toEqual({
      open: true,
      height: 200,
      tab: "git",
      showAll: false,
    })
  })

  it("keeps a stored tab", () => {
    expect(parseGitConsoleState('{"open":true,"height":200,"tab":"app"}').tab).toBe("app")
  })

  it("folds the engine's reads away unless the user chose to see everything (v0.16.0)", () => {
    // A v0.15 value has no showAll: the readable default, not the old flood.
    expect(parseGitConsoleState('{"open":true,"height":200,"tab":"git"}').showAll).toBe(false)
    expect(parseGitConsoleState('{"showAll":true}').showAll).toBe(true)
    expect(parseGitConsoleState('{"showAll":"yes"}').showAll).toBe(false)
  })

  it("refuses a tab it does not know", () => {
    expect(parseGitConsoleState('{"tab":"network"}').tab).toBe("git")
  })

  it("clamps the height into the resizable range", () => {
    expect(parseGitConsoleState('{"height":10}').height).toBe(96)
    expect(parseGitConsoleState('{"height":9000}').height).toBe(480)
  })
})
