import { describe, expect, it } from "vitest"
import { explainGitFailure } from "./gitErrors"

describe("explainGitFailure", () => {
  it("classifies credential prompts as auth with a helper hint", () => {
    const f = explainGitFailure("fatal: could not read Username for 'https://github.com': terminal prompts disabled")
    expect(f.kind).toBe("auth")
    expect(f.hint).toMatch(/credential helper/i)
    expect(f.raw).toContain("terminal prompts disabled")
  })

  it("classifies ssh host key failures", () => {
    expect(explainGitFailure("Host key verification failed.\nfatal: Could not read from remote repository.").kind).toBe(
      "ssh",
    )
    expect(explainGitFailure("git@github.com: Permission denied (publickey).").kind).toBe("auth")
  })

  it("classifies network failures", () => {
    expect(explainGitFailure("fatal: unable to access 'https://x/': Could not resolve host: x").kind).toBe("network")
  })

  it("classifies push/pull integration problems", () => {
    expect(explainGitFailure("Push rejected (non-fast-forward). Pull first to integrate remote changes.").kind).toBe(
      "rejected",
    )
    expect(explainGitFailure("Pull failed: local branch and upstream have diverged.").kind).toBe("diverged")
    expect(explainGitFailure("The working tree has uncommitted changes. Commit or stash before pulling.").kind).toBe(
      "dirty",
    )
    expect(explainGitFailure("The current branch has no upstream. Push with -u first").kind).toBe("no-upstream")
    expect(explainGitFailure("fetch was cancelled").kind).toBe("cancelled")
  })

  it("falls back to the first line for unknown failures", () => {
    const f = explainGitFailure("\nsomething odd\nsecond line")
    expect(f.kind).toBe("other")
    expect(f.title).toBe("something odd")
    expect(f.hint).toBeNull()
    expect(explainGitFailure(null).title).toBe("Operation failed")
  })
})
