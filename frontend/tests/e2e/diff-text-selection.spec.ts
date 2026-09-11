import { expect, test, type Locator, type Page } from "@playwright/test"

import { ENGINE_URL, engineHeaders } from "../engine"
import { commit, currentRepoPath, makeRepo, openRepoOnEngine, removeRepo, write } from "../repoFixture"

// Owner, 2026-09-11: "The new reset lines in the diff view is amazing, but
// it's missing the ability to select text for copy-paste. Currently I can't
// select a few words in a line to copy paste."
//
// The proof is the browser's own selection after a real mouse drag, and what
// Ctrl+C then puts on the clipboard: clean code, no "+"/"-" markers and no
// line numbers. Line selection for reset must keep working next to it, so
// every drag also asserts that no line got picked, and a plain click after
// the drag still picks one.

async function openInApp(page: Page, dir: string): Promise<void> {
  const res = await fetch(`${ENGINE_URL}/repos/open`, {
    method: "POST",
    headers: engineHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ path: dir }),
  })
  const opened = (await res.json()) as { id: string }
  await page.goto(`/?repo=${opened.id}`)
  await expect(page.getByTestId("status-branch")).toHaveText("main", { timeout: 30_000 })
}

/** A diff row under `scope` matched on its text cell; the row itself starts with gutter numbers. */
function diffRow(page: Page, scope: Locator, text: string) {
  return scope.locator(".diff-row").filter({
    has: page.locator(".diff-row-text").filter({ hasText: new RegExp(`^${text.replace(/[+]/g, "[+]")}$`) }),
  })
}

/** Where `words` sit on screen inside a row's text, from the browser's own layout. */
async function rectOf(row: Locator, words: string): Promise<{ left: number; right: number; y: number }> {
  return row.locator(".diff-row-text").evaluate((el, words) => {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
    const nodes: { node: Text; start: number }[] = []
    let offset = 0
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      nodes.push({ node: n as Text, start: offset })
      offset += (n as Text).data.length
    }
    const full = nodes.map((n) => n.node.data).join("")
    const at = full.indexOf(words)
    if (at < 0) throw new Error(`"${words}" is not in "${full}"`)
    const locate = (pos: number) => {
      const n = [...nodes].reverse().find((n) => n.start <= pos)!
      return { node: n.node, offset: pos - n.start }
    }
    const range = document.createRange()
    const s = locate(at)
    const e = locate(at + words.length)
    range.setStart(s.node, s.offset)
    range.setEnd(e.node, e.offset)
    const r = range.getBoundingClientRect()
    return { left: r.left, right: r.right, y: (r.top + r.bottom) / 2 }
  }, words)
}

/** Press on the left edge of `from`, drag to the right edge of `to`, release. */
async function dragText(page: Page, from: { left: number; y: number }, to: { right: number; y: number }) {
  // Two pixels outside the words: the caret snaps to the nearest character
  // boundary, and half a monospace glyph is wider than that.
  await page.mouse.move(from.left - 2, from.y)
  await page.mouse.down()
  await page.mouse.move(to.right + 2, to.y, { steps: 8 })
  await page.mouse.up()
}

const nativeSelection = (page: Page) => page.evaluate(() => window.getSelection()?.toString() ?? "")
const clipboard = (page: Page) => page.evaluate(() => navigator.clipboard.readText())

test.describe("text selection in the diff views", () => {
  // Opening a repository moves the engine's "current" one, which is what
  // every spec that just does page.goto("/") boots from. Put it back.
  let previousRepo: string | null = null
  test.beforeAll(async () => {
    previousRepo = await currentRepoPath()
  })
  test.afterAll(async () => {
    await openRepoOnEngine(previousRepo ?? process.cwd())
  })

  /** The same file in every test: one removed line, two added, two context. */
  function makeDiffRepo(prefix: string): string {
    const dir = makeRepo(prefix)
    write(dir, "f.txt", "alpha\nbeta\ngamma\n")
    commit(dir, "start")
    write(dir, "f.txt", "alpha\nthe brave new world\ngamma\ndelta\n")
    return dir
  }

  test("a mouse drag selects words in a Browse diff line without picking the line, and Ctrl+C copies them", async ({
    page,
    context,
  }) => {
    test.setTimeout(90_000)
    const canReadClipboard = test.info().project.name !== "webkit"
    if (canReadClipboard) await context.grantPermissions(["clipboard-read", "clipboard-write"])
    const dir = makeDiffRepo("pg-diff-text-")
    try {
      await openInApp(page, dir)
      const row = page.getByTestId("grid-row").filter({ hasText: "Working directory" })
      await expect(row).toHaveCount(1, { timeout: 20_000 })
      await row.first().click()
      await page.getByRole("tab", { name: /Diff/ }).click()
      await page.getByTestId("file-list-row").filter({ hasText: "f.txt" }).click()
      const pane = page.getByTestId("diff-pane")
      const line = diffRow(page, pane, "+the brave new world")
      await expect(line).toBeVisible({ timeout: 20_000 })

      const words = await rectOf(line, "brave new")
      await dragText(page, words, words)

      // The owner's sentence: a few words in a line are selected...
      await expect.poll(() => nativeSelection(page)).toContain("brave new")
      // ...and the drag did not pick the line for reset.
      await expect(pane.locator(".diff-row-selected")).toHaveCount(0)

      // Ctrl+C: the words, nothing of the "+" marker or the gutter.
      await page.keyboard.press("Control+C")
      if (canReadClipboard) await expect.poll(async () => (await clipboard(page)).trim()).toBe("brave new")

      // A plain click still selects the line, as before.
      await line.locator(".diff-row-text").click()
      await expect(pane.locator(".diff-row-selected")).toHaveCount(1)
      await expect(line).toHaveClass(/diff-row-selected/)
      // And the right-click menu over it still offers the reset.
      await line.click({ button: "right" })
      await expect(page.getByTestId("diff-line-menu")).toBeVisible()
      await expect(page.getByTestId("ctx-diff-reset-lines")).toBeEnabled()
      await page.keyboard.press("Escape")
    } finally {
      await removeRepo(dir)
    }
  })

  test("in the commit dialog a drag across two lines copies clean code, and Shift+click still ranges lines", async ({
    page,
    context,
  }) => {
    test.setTimeout(90_000)
    const canReadClipboard = test.info().project.name !== "webkit"
    if (canReadClipboard) await context.grantPermissions(["clipboard-read", "clipboard-write"])
    const dir = makeDiffRepo("pg-diff-text-commit-")
    try {
      await openInApp(page, dir)
      await page.keyboard.press("Control+Space")
      await expect(page.getByTestId("commit-overlay")).toBeVisible()
      await page.locator('[data-testid="unstaged-list-row"]:has([title="f.txt"])').click()
      const diff = page.getByTestId("commit-diff")
      const added = diffRow(page, diff, "+the brave new world")
      const context1 = diffRow(page, diff, " gamma")
      await expect(context1).toBeVisible({ timeout: 20_000 })

      // From the first word of the added line to the end of the context line below it.
      await dragText(page, await rectOf(added, "the"), await rectOf(context1, "gamma"))
      await expect.poll(() => nativeSelection(page)).toContain("world")
      await expect(diff.locator(".diff-row-selected")).toHaveCount(0)

      await page.keyboard.press("Control+C")
      // Two lines of code: no "+", no leading context space, no line numbers.
      if (canReadClipboard) await expect.poll(() => clipboard(page)).toBe("the brave new world\ngamma")

      // Line selection is intact: click, then Shift+click ranges over the rows between.
      await diffRow(page, diff, "-beta").locator(".diff-row-text").click()
      await expect(diff.locator(".diff-row-selected")).toHaveCount(1)
      await diffRow(page, diff, "+delta")
        .locator(".diff-row-text")
        .click({ modifiers: ["Shift"] })
      await expect(diff.locator(".diff-row-selected")).toHaveCount(4)
      // Shift+click extends lines, not text.
      expect(await nativeSelection(page)).toBe("")
      await page.keyboard.press("Escape")
    } finally {
      await removeRepo(dir)
    }
  })
})
