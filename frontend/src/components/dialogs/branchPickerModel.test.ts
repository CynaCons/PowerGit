import { describe, expect, it } from "vitest"
import { cursorFor, filterItems, pickerItems, stepCursor } from "./branchPickerModel"
import { suggestLocalName } from "./refName"

const item = (name: string, target = "0000000") => ({ name, fullName: "", target, current: false })
const REFS = {
  branches: [item("master", "aaaaaaa"), item("powergit", "bbbbbbb"), item("wt/v18-picker", "ccccccc")],
  remotes: [
    item("origin/HEAD", "bbbbbbb"),
    item("origin/powergit", "bbbbbbb"),
    item("origin/wt/v18-picker", "ddddddd"),
  ],
}

describe("pickerItems", () => {
  it("lists branches then remotes, drops the excluded branch and origin/HEAD", () => {
    const items = pickerItems(REFS, ["powergit"])
    expect(items.map((i) => i.name)).toEqual(["master", "wt/v18-picker", "origin/powergit", "origin/wt/v18-picker"])
    expect(items.map((i) => i.kind)).toEqual(["local", "local", "remote", "remote"])
    expect(items[1].target).toBe("ccccccc")
  })

  it("can be limited to one kind and copes with no tree", () => {
    expect(pickerItems(REFS, [], ["local"]).map((i) => i.name)).toEqual(["master", "powergit", "wt/v18-picker"])
    expect(pickerItems(null)).toEqual([])
  })
})

describe("filterItems and the cursor", () => {
  const items = pickerItems(REFS, ["powergit"])
  it("matches a substring case-insensitively", () => {
    expect(filterItems(items, "V18").map((i) => i.name)).toEqual(["wt/v18-picker", "origin/wt/v18-picker"])
    expect(filterItems(items, "  ")).toHaveLength(4)
    expect(filterItems(items, "zzz")).toEqual([])
  })
  it("starts on the value, else on the first row, and wraps", () => {
    expect(cursorFor(items, "origin/powergit")).toBe(2)
    expect(cursorFor(items, "nope")).toBe(0)
    expect(stepCursor(3, 4, 1)).toBe(0)
    expect(stepCursor(0, 4, -1)).toBe(3)
    expect(stepCursor(0, 0, 1)).toBe(0)
  })
})

describe("suggestLocalName", () => {
  it("is the remote's name when free, else the first -n that is", () => {
    expect(suggestLocalName("origin/wt/v18-x", ["origin"], ["master"])).toBe("wt/v18-x")
    expect(suggestLocalName("origin/wt/v18-picker", ["origin"], ["wt/v18-picker"])).toBe("wt/v18-picker-2")
    expect(suggestLocalName("origin/topic", ["origin"], ["topic", "topic-2"])).toBe("topic-3")
  })
})
