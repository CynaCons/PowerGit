import { afterEach, describe, expect, test, vi } from "vitest"
import { withLine } from "./reviewModel"

// The store reads localStorage once at import, so every test gets a fresh
// module over a fresh fake window (the same shape diagnostics.test.ts uses).

type Storage = { getItem: (k: string) => string | null; setItem: (k: string, v: string) => void }

function fakeWindow(storage: Storage) {
  return { localStorage: storage }
}

function memoryStorage(seed: Record<string, string> = {}): Storage & { data: Record<string, string> } {
  const data = { ...seed }
  return {
    data,
    getItem: (k) => data[k] ?? null,
    setItem: (k, v) => {
      data[k] = v
    },
  }
}

async function load(storage: Storage) {
  vi.stubGlobal("window", fakeWindow(storage))
  return await import("./reviewState")
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
})

describe("review mode toggle", () => {
  test("is off until switched on, and the switch is remembered under pg.reviewMode", async () => {
    const storage = memoryStorage()
    const store = await load(storage)
    expect(store.REVIEW_MODE_KEY).toBe("pg.reviewMode")
    expect(store.getReviewMode()).toBe(false)
    store.setReviewMode(true)
    expect(store.getReviewMode()).toBe(true)
    expect(storage.data["pg.reviewMode"]).toBe("true")
    store.setReviewMode(false)
    expect(storage.data["pg.reviewMode"]).toBe("false")
  })

  test("comes back on in the next window", async () => {
    const store = await load(memoryStorage({ "pg.reviewMode": "true" }))
    expect(store.getReviewMode()).toBe(true)
  })

  test("reads anything but the literal true as off", () => {
    return load(memoryStorage()).then(({ parseReviewMode }) => {
      expect(parseReviewMode(null)).toBe(false)
      expect(parseReviewMode("yes")).toBe(false)
      expect(parseReviewMode("1")).toBe(false)
      expect(parseReviewMode("true")).toBe(true)
    })
  })

  test("still switches when storage refuses", async () => {
    const refusing: Storage = {
      getItem: () => {
        throw new Error("blocked")
      },
      setItem: () => {
        throw new Error("blocked")
      },
    }
    const store = await load(refusing)
    expect(store.getReviewMode()).toBe(false)
    store.setReviewMode(true)
    expect(store.getReviewMode()).toBe(true)
  })
})

describe("review documents", () => {
  test("null until something is marked, then the updated document by key", async () => {
    const store = await load(memoryStorage())
    expect(store.getReviewDoc("c1")).toBeNull()
    expect(store.getReviewDoc(null)).toBeNull()
    store.updateReviewDoc("c1", (d) => withLine(d, "a.ts", "+1", "ok"))
    expect(store.getReviewDoc("c1")).toMatchObject({
      version: 1,
      commit: "c1",
      reviewed: 1,
      files: { "a.ts": { lines: { "+1": "ok" } } },
    })
    expect(store.getReviewDoc("c2")).toBeNull()
  })

  test("the updater sees the previous document, and documents keep their identity between updates", async () => {
    const store = await load(memoryStorage())
    store.updateReviewDoc("c1", (d) => withLine(d, "a.ts", "+1", "ok"))
    const first = store.getReviewDoc("c1")
    let seen: unknown = null
    store.updateReviewDoc("c1", (d) => {
      seen = d
      return withLine(d, "a.ts", "+2", "rejected")
    })
    expect(seen).toBe(first)
    const second = store.getReviewDoc("c1")
    expect(second).not.toBe(first)
    expect(second?.files["a.ts"].lines).toEqual({ "+1": "ok", "+2": "rejected" })
    // A no-op updater leaves the same object in place.
    store.updateReviewDoc("c1", (d) => d)
    expect(store.getReviewDoc("c1")).toBe(second)
  })

  test("the first update seeds an empty document even when the updater changes nothing", async () => {
    const store = await load(memoryStorage())
    store.updateReviewDoc("c1", (d) => d)
    expect(store.getReviewDoc("c1")).toEqual({
      version: 1,
      commit: "c1",
      reviewed: 0,
      changed: 0,
      status: "in-progress",
      files: {},
    })
  })

  test("documents are per key and independent of the toggle", async () => {
    const store = await load(memoryStorage())
    store.updateReviewDoc("c1", (d) => withLine(d, "a.ts", "+1", "ok"))
    store.updateReviewDoc("h1-worktree", (d) => withLine(d, "b.ts", "-3", "rejected"))
    store.setReviewMode(false)
    expect(store.getReviewDoc("c1")?.reviewed).toBe(1)
    expect(store.getReviewDoc("h1-worktree")?.files).toEqual({ "b.ts": { lines: { "-3": "rejected" }, comments: [] } })
  })
})
