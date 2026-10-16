// @vitest-environment jsdom
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { createTheme, ThemeProvider } from "@mui/material/styles"
import { Markdown } from "./Markdown"

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const theme = createTheme()
const longText = Array.from({ length: 30 }, (_, i) => `line ${i + 1}`).join("\n")
const buttons = (host: HTMLDivElement) =>
  [...host.querySelectorAll("button")].map((b) => b.textContent) as string[]

describe("Markdown (review board formatting)", () => {
  let host: HTMLDivElement
  let root: Root
  beforeEach(() => {
    host = document.createElement("div")
    document.body.append(host)
    root = createRoot(host)
  })
  afterEach(() => {
    act(() => root.unmount())
    host.remove()
  })
  const render = (text: string, fold = false) =>
    act(() =>
      root.render(
        <ThemeProvider theme={theme}>
          <Markdown text={text} fold={fold} />
        </ThemeProvider>,
      ),
    )
  const markdown = () => host.querySelector('[data-testid="markdown"]')!

  it("renders a list and a fenced code block", () => {
    render("- one\n- two\n\n```text\nconst x = 1\n```")
    expect(host.querySelectorAll("li")).toHaveLength(2)
    const pre = host.querySelector("pre")
    expect(pre).not.toBeNull()
    expect(pre?.querySelector("code")).not.toBeNull()
    expect(pre?.textContent).toContain("const x = 1")
  })

  it("renders **bold** as strong", () => {
    render("this is **bold** text")
    expect(host.querySelector("strong")?.textContent).toBe("bold")
  })

  it("renders a javascript: link as plain text, never as an anchor", () => {
    render("[x](javascript:alert(1))")
    expect(host.querySelector("a")).toBeNull()
    expect(markdown().textContent).toContain("x")
  })

  it("shows raw HTML as text, with no script element", () => {
    render("<script>alert(1)</script>")
    expect(host.querySelector("script")).toBeNull()
    expect(markdown().textContent).toContain("<script>alert(1)</script>")
  })

  it("renders a GFM table inside a scroll wrapper", () => {
    render("| a | b |\n| - | - |\n| 1 | 2 |")
    const table = host.querySelector("table")
    expect(table).not.toBeNull()
    expect(table?.querySelectorAll("th")).toHaveLength(2)
    // The sideways-scroll wrapper sits between the root and the table.
    expect(table?.parentElement?.isEqualNode(markdown())).toBe(false)
    expect(table?.parentElement?.querySelector("table")).toBe(table)
  })

  it("draws task-list checkboxes read-only", () => {
    render("- [x] done\n- [ ] todo")
    const boxes = [...host.querySelectorAll('input[type="checkbox"]')]
    expect(boxes).toHaveLength(2)
    expect(boxes.every((b) => b.hasAttribute("disabled"))).toBe(true)
    expect(boxes[0]?.hasAttribute("checked")).toBe(true)
  })

  it("highlights a fenced block through tokenizeLines once the grammar loads", async () => {
    render("```ts\nconst x = 1\n```")
    expect(host.querySelector("pre code")).not.toBeNull()
    // The grammar loads through Shiki's dynamic import — plain spans only
    // once tokenizeLines resolves (the first load in a file pays for it).
    await act(async () => {
      await new Promise((r) => setTimeout(r, 2500))
    })
    expect(host.querySelector("pre code span")).not.toBeNull()
    expect(host.querySelector("pre code")?.textContent).toBe("const x = 1")
  }, 30000)

  it("clips tall content at ~14 lines behind Show more / Show less when fold is set", () => {
    render(longText, true)
    expect(buttons(host)).toContain("Show more")
    act(() => host.querySelector("button")!.click())
    expect(buttons(host)).toContain("Show less")
    expect(markdown().querySelector("button")).toBe(host.querySelector("button"))
  })

  it("offers no Show more for short content, and never clips without fold", () => {
    render("hello", true)
    expect(host.querySelector("button")).toBeNull()
    render(longText)
    expect(host.querySelector("button")).toBeNull()
    expect(markdown().textContent).toContain("line 30")
  })
})
