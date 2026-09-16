import { describe, expect, it } from "vitest"
import { localNameFor, refNameError } from "./refName"

const EXISTING = ["master", "powergit", "wt/v18-picker"]

describe("refNameError", () => {
  it("accepts a name git accepts", () => {
    expect(refNameError("wt/v18-x", EXISTING)).toBeNull()
    expect(refNameError("feature/a.b-c_d", EXISTING)).toBeNull()
    expect(refNameError("v0.18.11", EXISTING)).toBeNull()
  })

  it("names the rule git would refuse on", () => {
    expect(refNameError("wt/v18 picker")).toBe("no spaces")
    expect(refNameError("a\tb")).toBe("no spaces")
    expect(refNameError("a..b")).toBe('no ".."')
    expect(refNameError("wt/")).toBe('no leading, trailing or double "/"')
    expect(refNameError("/wt")).toBe('no leading, trailing or double "/"')
    expect(refNameError("a//b")).toBe('no leading, trailing or double "/"')
    expect(refNameError("x.lock")).toBe('cannot end in ".lock"')
    expect(refNameError("a.lock/b")).toBe('cannot end in ".lock"')
    expect(refNameError("a@{b")).toBe('no "@{"')
    expect(refNameError("@")).toBe('not "@"')
    expect(refNameError(".hidden")).toBe('no "." at the start or end of a part')
    expect(refNameError("a/.b")).toBe('no "." at the start or end of a part')
    expect(refNameError("a.")).toBe('no "." at the start or end of a part')
    expect(refNameError("ab")).toBe("no ~ ^ : ? * [ \\ or control characters")
    expect(refNameError("ab")).toBe("no ~ ^ : ? * [ \\ or control characters")
    expect(refNameError("a~1")).toBe("no ~ ^ : ? * [ \\ or control characters")
    expect(refNameError("a^b")).toBe("no ~ ^ : ? * [ \\ or control characters")
    expect(refNameError("a:b")).toBe("no ~ ^ : ? * [ \\ or control characters")
    expect(refNameError("a?")).toBe("no ~ ^ : ? * [ \\ or control characters")
    expect(refNameError("a*")).toBe("no ~ ^ : ? * [ \\ or control characters")
    expect(refNameError("a[b")).toBe("no ~ ^ : ? * [ \\ or control characters")
    expect(refNameError("a\\b")).toBe("no ~ ^ : ? * [ \\ or control characters")
    expect(refNameError("-x")).toBe('cannot start with "-"')
  })

  it("refuses a name that exists and an empty one", () => {
    expect(refNameError("powergit", EXISTING)).toBe("already exists")
    expect(refNameError("wt/v18-picker", EXISTING)).toBe("already exists")
    expect(refNameError("", EXISTING)).toBe("a name is required")
  })
})

describe("localNameFor", () => {
  it("strips the remote prefix", () => {
    expect(localNameFor("origin/wt/v18-picker", ["origin", "upstream"])).toBe("wt/v18-picker")
    expect(localNameFor("upstream/master", ["origin", "upstream"])).toBe("master")
    // An unknown remote: the first segment is the remote.
    expect(localNameFor("fork/topic", [])).toBe("topic")
    expect(localNameFor("topic", [])).toBe("topic")
  })
})
