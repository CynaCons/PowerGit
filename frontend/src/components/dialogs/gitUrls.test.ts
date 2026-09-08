import { describe, expect, it } from "vitest"
import { commitWebUrl, remoteWebUrl } from "./gitUrls"

const SHA = "1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b"

describe("remoteWebUrl", () => {
  it("maps github ssh and https forms to the same page", () => {
    expect(remoteWebUrl("git@github.com:owner/repo.git")).toEqual({
      host: "github",
      base: "https://github.com/owner/repo",
    })
    expect(remoteWebUrl("https://github.com/owner/repo.git")?.base).toBe("https://github.com/owner/repo")
    expect(remoteWebUrl("ssh://git@ssh.github.com:443/owner/repo.git")?.base).toBe("https://github.com/owner/repo")
  })

  it("maps gitlab (including subgroups and self-hosted) and bitbucket", () => {
    expect(remoteWebUrl("git@gitlab.com:group/sub/repo.git")?.base).toBe("https://gitlab.com/group/sub/repo")
    expect(remoteWebUrl("https://gitlab.example.org/group/repo.git")?.host).toBe("gitlab")
    expect(remoteWebUrl("git@bitbucket.org:team/repo.git")?.base).toBe("https://bitbucket.org/team/repo")
  })

  it("maps both Azure DevOps forms onto dev.azure.com", () => {
    expect(remoteWebUrl("https://user@dev.azure.com/org/project/_git/repo")?.base).toBe(
      "https://dev.azure.com/org/project/_git/repo",
    )
    expect(remoteWebUrl("git@ssh.dev.azure.com:v3/org/project/repo")?.base).toBe(
      "https://dev.azure.com/org/project/_git/repo",
    )
    expect(remoteWebUrl("https://org.visualstudio.com/project/_git/repo")?.base).toBe(
      "https://dev.azure.com/org/project/_git/repo",
    )
  })

  it("returns null for unknown hosts and unparseable input", () => {
    expect(remoteWebUrl("git@git.internal.example:team/repo.git")).toBeNull()
    expect(remoteWebUrl("/srv/git/repo.git")).toBeNull()
    expect(remoteWebUrl("")).toBeNull()
  })
})

describe("commitWebUrl", () => {
  it("uses each host's own commit path", () => {
    expect(commitWebUrl("git@github.com:owner/repo.git", SHA)).toBe(`https://github.com/owner/repo/commit/${SHA}`)
    expect(commitWebUrl("git@gitlab.com:group/repo.git", SHA)).toBe(`https://gitlab.com/group/repo/-/commit/${SHA}`)
    expect(commitWebUrl("https://bitbucket.org/team/repo.git", SHA)).toBe(
      `https://bitbucket.org/team/repo/commits/${SHA}`,
    )
    expect(commitWebUrl("git@ssh.dev.azure.com:v3/org/project/repo", SHA)).toBe(
      `https://dev.azure.com/org/project/_git/repo/commit/${SHA}`,
    )
  })

  it("is null without a known host or a sha", () => {
    expect(commitWebUrl("git@example.com:repo.git", SHA)).toBeNull()
    expect(commitWebUrl("git@github.com:owner/repo.git", "")).toBeNull()
  })
})
