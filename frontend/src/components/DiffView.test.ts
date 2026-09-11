// @vitest-environment jsdom
import { act, createElement, createRef } from "react"
import { createRoot, type Root } from "react-dom/client"
import { renderToStaticMarkup } from "react-dom/server"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import type { DiffDto } from "../engine"
import { DiffView, VIRTUALIZE_MIN_LINES, type DiffReviewProps, type DiffViewHandle } from "./DiffView"
import { VirtualLines } from "./VirtualLines"

// Review mode (v0.17.0) is an optional prop on DiffView: without it the rows
// are the pre-review ones, to the byte; with it every row gets a mark cell
// in the sticky gutter, changed rows their state, the cursor row its class,
// and the list becomes the focusable "review" hotkey surface.

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

// .txt: no syntax highlighting, so no tokenizer round-trip in the test.
const SHORT: DiffDto = {
  path: "f.txt",
  text: [
    "diff --git a/f.txt b/f.txt",
    "@@ -1,3 +1,4 @@",
    " alpha", // 2: context
    "-beta", // 3: removed, key -2
    "+the brave new world", // 4: added, key +2
    " gamma", // 5: context
    "+delta", // 6: added, key +4
  ].join("\n"),
} as DiffDto

const LONG: DiffDto = {
  path: "g.txt",
  text: [
    "diff --git a/g.txt b/g.txt",
    "@@ -1,300 +1,300 @@",
    ...Array.from({ length: VIRTUALIZE_MIN_LINES + 100 }, (_, i) => `+line ${i}`),
  ].join("\n"),
} as DiffDto

const KEYS: Record<number, string> = { 3: "-2", 4: "+2", 6: "+4" }

function review(over: Partial<DiffReviewProps> = {}): DiffReviewProps {
  return {
    keyOf: (i) => KEYS[i] ?? null,
    stateOf: () => undefined,
    cursor: null,
    onCursor: () => {},
    onMarkClick: () => {},
    ...over,
  }
}

describe("DiffView without the review prop", () => {
  it("renders none of the review DOM, in the plain and the virtual list alike", () => {
    for (const diff of [SHORT, LONG]) {
      const html = renderToStaticMarkup(
        createElement(DiffView, { diff, selection: new Set([4]), onLineClick: () => {} }),
      )
      expect(html).not.toContain("diff-row-mark")
      expect(html).not.toContain("data-review")
      expect(html).not.toContain("diff-row-review")
      expect(html).not.toContain("diff-row-cursor")
      expect(html).not.toContain("data-hotkey-surface")
    }
    // The plain list is not a focus target without review mode (VirtualLines always was).
    const plain = renderToStaticMarkup(createElement(DiffView, { diff: SHORT }))
    expect(plain).not.toContain("tabindex")
  })
})

describe("DiffView with the review prop", () => {
  it("marks changed rows with their state and the cursor row, context rows with neither", () => {
    const states: Record<string, "ok" | "rejected" | undefined> = { "-2": "rejected", "+2": "ok" }
    const html = renderToStaticMarkup(
      createElement(DiffView, { diff: SHORT, review: review({ stateOf: (k) => states[k], cursor: 5 }) }),
    )
    const rows = html.split('<div data-index="').slice(1)
    const row = (i: number) => rows.find((r) => r.startsWith(`${i}"`))!
    expect(row(3)).toMatch(/class="diff-row diff-row-removed diff-row-review-rejected" data-review="rejected"/)
    expect(row(4)).toMatch(/class="diff-row diff-row-added diff-row-review-ok" data-review="ok"/)
    expect(row(6)).toMatch(/class="diff-row diff-row-added diff-row-review-todo" data-review="todo"/)
    expect(row(5)).toMatch(/class="diff-row diff-row-cursor"/)
    expect(row(5)).not.toContain("data-review")
    expect(row(2)).toMatch(/class="diff-row"/)
    // The mark cell sits inside the sticky gutter, after both numbers, on every row.
    for (const r of rows) {
      expect(r).toMatch(
        /diff-row-num-new">[^<]*<\/span><span class="diff-row-mark"><\/span><\/div><span class="diff-row-text"/,
      )
    }
    // The plain list is the focusable review surface.
    expect(html).toMatch(/data-testid="diff-lines" data-hotkey-surface="review" tabindex="0"/)
  })

  it("names the virtual list as the review surface too", () => {
    const html = renderToStaticMarkup(createElement(DiffView, { diff: LONG, review: review() }))
    expect(html).toMatch(/data-testid="diff-lines" data-hotkey-surface="review" tabindex="0"/)
  })
})

describe("DiffView review clicks and ref", () => {
  let host: HTMLDivElement
  let root: Root
  beforeEach(() => {
    host = document.createElement("div")
    document.body.appendChild(host)
    root = createRoot(host)
  })
  afterEach(() => {
    act(() => root.unmount())
    host.remove()
  })

  it("routes a mark click to onMarkClick only, and a text click to onLineClick plus onCursor", () => {
    const calls: string[] = []
    act(() =>
      root.render(
        createElement(DiffView, {
          diff: SHORT,
          onLineClick: (i) => calls.push(`line ${i}`),
          review: review({ onCursor: (i) => calls.push(`cursor ${i}`), onMarkClick: (i) => calls.push(`mark ${i}`) }),
        }),
      ),
    )
    const rowOf = (i: number) => host.querySelector(`[data-index="${i}"] .diff-row`)!
    act(() => rowOf(4).querySelector<HTMLElement>(".diff-row-mark")!.click())
    expect(calls).toEqual(["mark 4"])
    calls.length = 0
    act(() => rowOf(5).querySelector<HTMLElement>(".diff-row-text")!.click())
    expect(calls).toEqual(["line 5", "cursor 5"])
  })

  it("moves the cursor on a text click even when the host has no line selection", () => {
    const calls: number[] = []
    act(() => root.render(createElement(DiffView, { diff: SHORT, review: review({ onCursor: (i) => calls.push(i) }) })))
    act(() => host.querySelector<HTMLElement>('[data-index="2"] .diff-row-text')!.click())
    expect(calls).toEqual([2])
  })

  it("exposes scrollToRow and focus through the ref", () => {
    const ref = createRef<DiffViewHandle>()
    act(() => root.render(createElement(DiffView, { ref, diff: SHORT, review: review() })))
    expect(ref.current).not.toBeNull()
    act(() => ref.current!.focus())
    expect(document.activeElement).toBe(host.querySelector('[data-testid="diff-lines"]'))
    expect(() => ref.current!.scrollToRow(6)).not.toThrow()
  })
})

describe("VirtualLines keys", () => {
  let host: HTMLDivElement
  let root: Root
  beforeEach(() => {
    host = document.createElement("div")
    document.body.appendChild(host)
    root = createRoot(host)
  })
  afterEach(() => {
    act(() => root.unmount())
    host.remove()
  })

  const arrowDown = () => {
    const e = new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true })
    host.querySelector('[data-testid="v"]')!.dispatchEvent(e)
    return e.defaultPrevented
  }

  it("takes ArrowDown for itself by default and leaves it alone with passKeys", () => {
    act(() => root.render(createElement(VirtualLines, { count: 500, renderLine: (i) => String(i), testid: "v" })))
    expect(arrowDown()).toBe(true)
    act(() =>
      root.render(
        createElement(VirtualLines, { count: 500, renderLine: (i) => String(i), testid: "v", passKeys: true }),
      ),
    )
    expect(arrowDown()).toBe(false)
  })
})
