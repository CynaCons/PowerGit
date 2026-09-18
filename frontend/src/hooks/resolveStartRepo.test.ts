import { describe, expect, it, vi } from "vitest"
import type { RepoInfo } from "../engine"
import { resolveStartRepo } from "./resolveStartRepo"

const info = (id: string, root = `/${id}`): RepoInfo => ({ id, root, name: id, branch: "main" })

function deps(overrides: Partial<Parameters<typeof resolveStartRepo>[0]> = {}) {
  return {
    pinned: null,
    openPath: null,
    openLast: true,
    repoInfo: vi.fn(async () => null),
    currentRepo: vi.fn(async () => null),
    recents: vi.fn(async () => []),
    openRepo: vi.fn(async (path: string) => info(path)),
    ...overrides,
  }
}

describe("resolveStartRepo (v0.18.19)", () => {
  it("opens the command-line path before the pin", async () => {
    const d = deps({ openPath: "/from-cli", pinned: "pinned", repoInfo: vi.fn(async () => info("pinned")) })
    expect(await resolveStartRepo(d)).toEqual(info("/from-cli"))
    expect(d.repoInfo).not.toHaveBeenCalled()
  })

  it("uses the pin before the engine current repository", async () => {
    const d = deps({
      pinned: "pinned",
      repoInfo: vi.fn(async () => info("pinned")),
      currentRepo: vi.fn(async () => info("current")),
    })
    expect(await resolveStartRepo(d)).toEqual(info("pinned"))
    expect(d.currentRepo).not.toHaveBeenCalled()
  })

  it("uses the engine current repository before recents", async () => {
    const d = deps({ currentRepo: vi.fn(async () => info("current")), recents: vi.fn(async () => [info("recent")]) })
    expect(await resolveStartRepo(d)).toEqual(info("current"))
    expect(d.recents).not.toHaveBeenCalled()
  })

  it("opens the first recent only when enabled", async () => {
    const recent = info("recent", "/saved/repo")
    const enabled = deps({ recents: vi.fn(async () => [recent]) })
    expect(await resolveStartRepo(enabled)).toEqual(info("/saved/repo"))
    expect(enabled.openRepo).toHaveBeenCalledWith("/saved/repo")

    const disabled = deps({ openLast: false, recents: vi.fn(async () => [recent]) })
    expect(await resolveStartRepo(disabled)).toBeNull()
    expect(disabled.recents).not.toHaveBeenCalled()
  })

  it("falls through after a failed explicit open and after a failed recent open", async () => {
    const warn = vi.fn()
    const current = deps({
      openPath: "/gone",
      currentRepo: vi.fn(async () => info("current")),
      openRepo: vi.fn(async () => Promise.reject(new Error("gone"))),
      onOpenFailure: warn,
    })
    expect(await resolveStartRepo(current)).toEqual(info("current"))
    expect(warn).toHaveBeenCalledWith("/gone", expect.any(Error))

    const recent = deps({
      recents: vi.fn(async () => [info("gone", "/gone")]),
      openRepo: vi.fn(async () => Promise.reject(new Error("gone"))),
      onOpenFailure: warn,
    })
    expect(await resolveStartRepo(recent)).toBeNull()
  })

  it("returns null when there are no recents", async () => {
    expect(await resolveStartRepo(deps())).toBeNull()
  })
})
