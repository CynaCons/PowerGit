import { basename } from "node:path"
import { expect, test, type Locator, type Page } from "@playwright/test"
import { ENGINE_URL, engineHeaders } from "../engine"
import { commit, currentRepoPath, makeRepo, openRepoOnEngine, write } from "../repoFixture"

// v0.21.11, owner: "in the agent review panel, on the right side, the board
// can be resized, same for the left side panel." Both side panes of the
// review screen are dragged by a handle in the gap, keep their width after a
// reload, go back to their default on a double-click, and move with the
// arrow keys.

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${ENGINE_URL}${path}`, {
    ...init,
    headers: engineHeaders({ "Content-Type": "application/json" }),
  })
  if (!res.ok) throw new Error(`${path}: http ${res.status} ${await res.text()}`)
  const text = await res.text()
  return (text ? JSON.parse(text) : null) as T
}

const width = async (l: Locator) => (await l.boundingBox())!.width

async function drag(page: Page, handle: Locator, dx: number) {
  const box = (await handle.boundingBox())!
  const x = box.x + box.width / 2
  const y = box.y + box.height / 2
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x + dx / 2, y, { steps: 4 })
  await page.mouse.move(x + dx, y, { steps: 4 })
  await page.mouse.up()
}

test.describe("agent review layout", () => {
  let previous: string | null = null
  test.beforeAll(async () => {
    previous = await currentRepoPath()
  })
  test.afterAll(async () => {
    await openRepoOnEngine(previous ?? process.cwd())
  })

  test("the files list and the board are resized by their handles and keep their width", async ({ page }) => {
    test.setTimeout(90_000)
    const dir = makeRepo("pg-review-layout-")
    write(dir, "a.txt", "one\n")
    commit(dir, "start")
    write(dir, "a.txt", "one\ntwo\n")
    const { id } = await api<{ id: string }>("/repos/open", { method: "POST", body: JSON.stringify({ path: dir }) })
    await api(`/repos/${id}/agent-reviews`, {
      method: "POST",
      body: JSON.stringify({
        mode: "notify",
        title: "Layout review",
        why: "",
        agent: "layout-test",
        worktree: true,
        files: [{ path: "a.txt", status: "M" }],
      }),
    })
    const open = async () => {
      await page.goto(`/?repo=${id}`)
      await page.getByTestId("agent-reviews-button").click()
      await page
        .getByTestId("agent-review-row")
        .filter({ hasText: "Layout review" })
        .filter({ hasText: basename(dir) })
        .click()
      await expect(page.getByTestId("agent-review-screen")).toBeVisible()
    }
    await page.addInitScript(() => {
      if (!sessionStorage.getItem("pg-layout-test")) {
        sessionStorage.setItem("pg-layout-test", "1")
        localStorage.removeItem("pg.reviewFilesWidth")
        localStorage.removeItem("pg.reviewBoardWidth")
      }
    })
    await open()

    const files = page.getByTestId("review-files-pane")
    const board = page.getByTestId("review-board-pane")
    const filesHandle = page.getByTestId("review-files-splitter")
    const boardHandle = page.getByTestId("review-board-splitter")
    const f0 = await width(files)
    const b0 = await width(board)

    // The board grows when its handle is dragged left; the files list when its handle goes right.
    await drag(page, boardHandle, -120)
    await expect.poll(() => width(board)).toBeGreaterThan(b0 + 100)
    await drag(page, filesHandle, 80)
    await expect.poll(() => width(files)).toBeGreaterThan(f0 + 60)
    const f1 = await width(files)
    const b1 = await width(board)

    // Kept after a reload.
    await open()
    await expect.poll(() => width(files)).toBeCloseTo(f1, -1)
    await expect.poll(() => width(board)).toBeCloseTo(b1, -1)

    // Arrow keys move a focused handle.
    await filesHandle.focus()
    await expect(filesHandle).toHaveAttribute("role", "separator")
    await page.keyboard.press("ArrowRight")
    await expect.poll(() => width(files)).toBeGreaterThan(f1 + 10)

    // Double-click goes back to the default.
    await boardHandle.dblclick()
    await expect.poll(() => width(board)).toBeCloseTo(b0, -1)
  })
})
