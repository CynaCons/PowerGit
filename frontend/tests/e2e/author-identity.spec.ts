import { expect, test, type Locator, type Page } from "@playwright/test"
import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { currentRepoPath, git, openRepoOnEngine, removeRepo, write } from "../repoFixture"

// Owner (2026-09-11): "design a better author highlighting for the commits
// of the selected author" — prototype A, "A is perfect" (v0.18.1). Every
// row shows an initials disc; selecting a commit rings that author's discs
// and bolds the name on every loaded row by them, and the pill says who and
// how many. The row background stays the selection's alone (v0.12.3, three
// owner reports). The repository has three authors so the marks have
// something to distinguish, unlike this checkout's one dominant author.

const AUTHORS = {
  cc: { name: "Constantin Chabirand", email: "cc@example.com", initials: "CC" },
  ml: { name: "Mara Lindqvist", email: "ml@example.com", initials: "ML" },
  tw: { name: "Tomasz Wierzba", email: "tw@example.com", initials: "TW" },
}
// Newest first, as the grid lists them.
const HISTORY: (keyof typeof AUTHORS)[] = ["cc", "ml", "cc", "tw", "ml", "cc"]

// A later -c wins over the fixture's default identity.
function commitAs(dir: string, who: keyof typeof AUTHORS, message: string): void {
  const a = AUTHORS[who]
  write(dir, "a.txt", `${message}\n`)
  git(dir, "add", "-A")
  git(dir, "-c", `user.name=${a.name}`, "-c", `user.email=${a.email}`, "commit", "-q", "-m", message)
}

function rowsBy(page: Page, who: keyof typeof AUTHORS): Locator {
  return page.getByTestId("grid-row").filter({ has: page.locator(".author", { hasText: AUTHORS[who].name }) })
}

const boxShadow = (disc: Locator) => disc.evaluate((el) => getComputedStyle(el).boxShadow)
const background = (cell: Locator) => cell.evaluate((el) => getComputedStyle(el).backgroundColor)

test.describe("author identity in the graph", () => {
  let repoDir: string
  let previousRepo: string | null = null

  test.beforeAll(async () => {
    previousRepo = await currentRepoPath()
    repoDir = mkdtempSync(join(tmpdir(), "pg-author-"))
    git(repoDir, "init", "-q", "-b", "main")
    for (let i = HISTORY.length - 1; i >= 0; i--)
      commitAs(repoDir, HISTORY[i], `commit ${i} by ${AUTHORS[HISTORY[i]].initials}`)
    await openRepoOnEngine(repoDir)
  })

  test.afterAll(async () => {
    await openRepoOnEngine(previousRepo ?? process.cwd())
    await removeRepo(repoDir)
  })

  test.beforeEach(async ({ page }) => {
    await page.goto("/")
    await expect(page.getByTestId("grid-row")).toHaveCount(HISTORY.length)
  })

  test("every commit shows a disc with the author's initials", async ({ page }) => {
    const rows = page.getByTestId("grid-row")
    await expect(page.locator(".author-disc")).toHaveCount(HISTORY.length)
    for (let i = 0; i < HISTORY.length; i++) {
      const a = AUTHORS[HISTORY[i]]
      await expect(rows.nth(i).locator(".author")).toContainText(a.name)
      await expect(rows.nth(i).locator(".author-disc")).toHaveText(a.initials)
    }
    // One author, one colour: both Mara rows share a palette, and the disc
    // is painted (a background, not the row's transparent).
    const mara = rowsBy(page, "ml").locator(".author-disc")
    await expect(mara).toHaveCount(2)
    expect(await mara.nth(0).getAttribute("data-palette")).toBe(await mara.nth(1).getAttribute("data-palette"))
    expect(await background(mara.first())).not.toBe("rgba(0, 0, 0, 0)")
  })

  test("selecting a commit rings the discs of that author's other commits and the pill says who and how many", async ({
    page,
  }) => {
    await rowsBy(page, "ml").first().click()
    const same = page.locator(".grid-row.author-same")
    await expect(same).toHaveCount(2)
    for (const row of await same.all()) await expect(row.locator(".author")).toContainText(AUTHORS.ml.name)

    // The ring is a box-shadow on the disc, and only on that author's discs.
    const other = rowsBy(page, "ml").nth(1)
    await expect(other).not.toHaveClass(/selected/)
    expect(await boxShadow(other.locator(".author-disc"))).not.toBe("none")
    expect(await boxShadow(rowsBy(page, "cc").first().locator(".author-disc"))).toBe("none")
    expect(await boxShadow(rowsBy(page, "tw").first().locator(".author-disc"))).toBe("none")
    // The name on the other row is bold and in the text colour, set explicitly.
    await expect(other.locator(".author")).toHaveCSS("font-weight", "600")
    expect(await other.locator(".author").evaluate((el) => getComputedStyle(el).color)).not.toBe("rgba(0, 0, 0, 0)")

    await page.getByTestId("graph-options-bar").hover()
    await expect(page.getByTestId("graph-author-name")).toHaveText(AUTHORS.ml.name)
    await expect(page.getByTestId("graph-author-count")).toHaveText(`2 of ${HISTORY.length}`)

    // Another author: the marks and the pill follow.
    await page.mouse.move(5, 5)
    await rowsBy(page, "tw").first().click()
    await expect(same).toHaveCount(1)
    await page.getByTestId("graph-options-bar").hover()
    await expect(page.getByTestId("graph-author-name")).toHaveText(AUTHORS.tw.name)
    await expect(page.getByTestId("graph-author-count")).toHaveText(`1 of ${HISTORY.length}`)
  })

  test("the selected row stays visibly selected while a same-author row does not", async ({ page }) => {
    const selected = rowsBy(page, "cc").first()
    await selected.click()
    await expect(selected).toHaveClass(/selected/)
    await expect(selected).toHaveClass(/author-same/)
    await expect(selected).toHaveCSS("border-left-width", "2px")
    // Same assertions as shell.spec "only the selected row is highlighted":
    // the tint lives on the text cells of the selected row alone; a
    // same-author row keeps a transparent cell and painted, opaque text.
    const selectedBackground = await background(selected.locator(".msg"))
    expect(selectedBackground).not.toBe("rgba(0, 0, 0, 0)")
    const sameAuthor = rowsBy(page, "cc").nth(1)
    await expect(sameAuthor).toHaveClass(/author-same/)
    await expect(sameAuthor).not.toHaveClass(/selected/)
    await page.mouse.move(5, 5)
    expect(await background(sameAuthor.locator(".msg"))).toBe("rgba(0, 0, 0, 0)")
    expect(await background(sameAuthor.locator(".author"))).toBe("rgba(0, 0, 0, 0)")
    expect(await background(sameAuthor)).toBe("rgba(0, 0, 0, 0)")
    const styles = await sameAuthor.evaluate((el) => ({
      msgColor: getComputedStyle(el.querySelector(".msg-text")!).color,
      authorColor: getComputedStyle(el.querySelector(".author")!).color,
      authorOpacity: getComputedStyle(el.querySelector(".author")!).opacity,
      rowOpacity: getComputedStyle(el).opacity,
    }))
    expect(styles.msgColor).not.toBe("rgba(0, 0, 0, 0)")
    expect(styles.authorColor).not.toBe("rgba(0, 0, 0, 0)")
    expect(styles.authorOpacity).toBe("1")
    expect(styles.rowOpacity).toBe("1")
    // No other row shares the selection tint.
    const tinted = await page
      .getByTestId("grid-row")
      .evaluateAll(
        (els, sel: string) =>
          els.filter(
            (el) =>
              !el.classList.contains("selected") && getComputedStyle(el.querySelector(".msg")!).backgroundColor === sel,
          ).length,
        selectedBackground,
      )
    expect(tinted).toBe(0)
  })

  test("Mark off removes the rings and keeps the discs", async ({ page }) => {
    await rowsBy(page, "ml").first().click()
    await expect(page.locator(".grid-row.author-same")).toHaveCount(2)
    await page.getByTestId("graph-options-bar").hover()
    await page.getByTestId("graph-author-mark").click()
    await expect(page.locator(".grid-row.author-same")).toHaveCount(0)
    await expect(page.locator(".author-disc")).toHaveCount(HISTORY.length)
    for (const disc of await page.locator(".author-disc").all()) expect(await boxShadow(disc)).toBe("none")
    // The pill still says who; the choice is remembered.
    await expect(page.getByTestId("graph-author-name")).toHaveText(AUTHORS.ml.name)
    await expect(page.getByTestId("graph-author-mark")).toHaveAttribute("aria-pressed", "false")
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem("pg.graph") ?? "{}").authorMark)).toBe(false)
    await page.getByTestId("graph-author-mark").click()
    await expect(page.locator(".grid-row.author-same")).toHaveCount(2)
  })

  test("Author discs off in Settings removes the discs", async ({ page }) => {
    await rowsBy(page, "ml").first().click()
    await page.getByTestId("settings-button").click()
    const box = page.getByTestId("settings-author-discs")
    await expect(box).toBeChecked()
    await box.click()
    await expect(page.getByTestId("settings-row-appearance.authorDiscs")).toHaveAttribute("data-changed", "true")
    await page.keyboard.press("Escape")
    await expect(page.getByTestId("settings-page")).toHaveCount(0)
    await expect(page.getByTestId("grid-row")).toHaveCount(HISTORY.length)
    await expect(page.locator(".author-disc")).toHaveCount(0)
    // Mark still bolds the name on the author's rows; nothing else marks.
    await rowsBy(page, "ml").first().click()
    await expect(page.locator(".grid-row.author-same")).toHaveCount(2)
    await expect(rowsBy(page, "ml").nth(1).locator(".author")).toHaveCSS("font-weight", "600")
    // Reset in Settings brings the discs back.
    await page.getByTestId("settings-button").click()
    await page.getByTestId("settings-reset-appearance.authorDiscs").click()
    await expect(box).toBeChecked()
    await page.keyboard.press("Escape")
    await expect(page.locator(".author-disc")).toHaveCount(HISTORY.length)
  })
})
