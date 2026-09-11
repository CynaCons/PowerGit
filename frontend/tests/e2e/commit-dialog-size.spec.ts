import { expect, test, type Locator, type Page } from "@playwright/test"
import { currentRepoPath, makeRepo, openRepoOnEngine, removeRepo, write } from "../repoFixture"

// Owner, 2026-09-11: "The commit window should be resizeable. Ideally an
// external window, but that's not mandatory. Also an x on the top right to
// close it." The dialog opens near-full, so the corner is pulled in first,
// then pushed back out by +200/+150; the paper's own box is measured, the
// size must survive a reload, and the X must close what Escape closes.

/** Layout rounds to sub-pixels; a window that moved a pixel is still where it was. */
const near = (actual: number, expected: number) => expect(Math.abs(actual - expected)).toBeLessThan(1.5)

async function openCommitWindow(page: Page): Promise<Locator> {
  await page.keyboard.press("Control+Space")
  await expect(page.getByTestId("commit-overlay")).toBeVisible()
  const paper = page.locator(".MuiDialog-paper")
  await expect(paper).toBeVisible()
  await paper.evaluate(async (el) => {
    await Promise.all(el.getAnimations({ subtree: true }).map((a) => a.finished))
  })
  return paper
}

async function dragCorner(page: Page, dx: number, dy: number): Promise<void> {
  const grip = page.getByTestId("commit-resize-se")
  const box = (await grip.boundingBox())!
  const x = box.x + box.width / 2
  const y = box.y + box.height / 2
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x + dx, y + dy, { steps: 12 })
  await page.mouse.up()
}

let repoDir: string
let previousRepo: string | null = null

test.beforeEach(async () => {
  previousRepo ??= await currentRepoPath()
  repoDir = makeRepo("pg-commit-size-")
  write(repoDir, "a.txt", "base\nchanged\n")
  await openRepoOnEngine(repoDir)
})

test.afterEach(async () => {
  await openRepoOnEngine(previousRepo ?? process.cwd())
  await removeRepo(repoDir)
})

test("the commit window resizes from its corner, remembers the size, and closes with the X", async ({ page }) => {
  await page.goto("/")
  await expect(page.getByTestId("grid-row").first()).toBeVisible()
  const paper = await openCommitWindow(page)
  // A diff on the right, so the resize happens over the real inner layout.
  await page.locator('[data-testid="unstaged-list-row"]:has([title="a.txt"])').click()
  await expect(page.getByTestId("commit-diff").locator(".diff-row").filter({ hasText: "+changed" })).toBeVisible()
  const before = (await paper.boundingBox())!

  // Pull the bottom-right corner in: the top-left corner does not move.
  await dragCorner(page, -300, -250)
  const shrunk = (await paper.boundingBox())!
  near(shrunk.width, before.width - 300)
  near(shrunk.height, before.height - 250)
  near(shrunk.x, before.x)
  near(shrunk.y, before.y)

  // Push it back out by +200/+150: the corner follows the pointer.
  await dragCorner(page, 200, 150)
  const grown = (await paper.boundingBox())!
  near(grown.width, shrunk.width + 200)
  near(grown.height, shrunk.height + 150)
  near(grown.x, shrunk.x)
  near(grown.y, shrunk.y)
  // The inner split still works inside the new size.
  await expect(page.getByTestId("commit-split-handle")).toBeVisible()
  await expect(page.getByTestId("commit-submit")).toBeVisible()

  // Reload: the size sticks, the window opens centred.
  await page.reload()
  await expect(page.getByTestId("grid-row").first()).toBeVisible()
  const reopened = await openCommitWindow(page)
  const persisted = (await reopened.boundingBox())!
  near(persisted.width, grown.width)
  near(persisted.height, grown.height)
  const viewport = page.viewportSize()!
  near(persisted.x, (viewport.width - persisted.width) / 2)

  const close = page.getByTestId("commit-close")
  await expect(close).toBeEnabled()
  await close.click()
  await expect(page.getByTestId("commit-overlay")).not.toBeVisible()
})
