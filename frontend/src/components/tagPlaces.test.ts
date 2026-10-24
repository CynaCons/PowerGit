import { describe, expect, it } from "vitest"
import type { RefTree } from "../engine"
import { placeOf, tagPlaces, tagPushTarget, tagTitle } from "./tagPlaces"

const tag = (name: string, remotes: string[] | null) => ({
  name,
  fullName: `refs/tags/${name}`,
  target: "a",
  current: false,
  remotes,
})
const tree = (tags: ReturnType<typeof tag>[], known: string[] | null): RefTree => ({
  branches: [],
  remotes: [],
  tags,
  submodules: [],
  remoteTagsKnown: known,
})

describe("tagPlaces", () => {
  it("is remote when a remote has the tag, local when the asked remotes lack it", () => {
    const p = tagPlaces(tree([tag("v1", ["origin"]), tag("v2", [])], ["origin"]), ["origin"])
    expect(placeOf("v1", p)).toEqual({ where: "remote", remotes: ["origin"] })
    expect(placeOf("v2", p).where).toBe("local")
    expect(p.pushRemote).toBe("origin")
  })

  it("claims nothing before a remote answered, nor for a name it does not list", () => {
    const p = tagPlaces(tree([tag("v1", null)], null), ["origin"])
    expect(placeOf("v1", p).where).toBe("unknown")
    expect(placeOf("nope", p).where).toBe("unknown")
  })

  it("pushes to origin, else the first remote, and never without one", () => {
    expect(tagPlaces(tree([], null), ["fork", "origin"]).pushRemote).toBe("origin")
    expect(tagPlaces(tree([], ["upstream"]), []).pushRemote).toBe("upstream")
    expect(tagPlaces(tree([], null), []).pushRemote).toBeNull()
    expect(tagPlaces(null, []).pushRemote).toBeNull()
  })
})

describe("tagPushTarget", () => {
  const p = tagPlaces(tree([tag("v1", ["origin"]), tag("v2", []), tag("v3", ["fork"])], ["origin", "fork"]), ["origin"])
  it("offers the push remote unless it already has the tag", () => {
    expect(tagPushTarget("v1", p)).toBeNull()
    expect(tagPushTarget("v2", p)).toBe("origin")
    expect(tagPushTarget("v3", p)).toBe("origin")
    expect(tagPushTarget("v2", tagPlaces(null, []))).toBeNull()
  })
})

describe("tagTitle", () => {
  it("names where the tag is", () => {
    expect(tagTitle("v1", { where: "remote", remotes: ["origin", "fork"] })).toBe("v1 · on origin, fork")
    expect(tagTitle("v2", { where: "local", remotes: [] })).toBe("v2 · local only")
    expect(tagTitle("v3", { where: "unknown", remotes: [] })).toBe("v3")
  })
})
