import { basename } from "node:path"
import { expect, test } from "@playwright/test"
import { ENGINE_URL, engineHeaders } from "../engine"
import { commit, currentRepoPath, makeRepo, openRepoOnEngine, write } from "../repoFixture"

// v0.21.10, owner: "the review panel only shows the review for the currently
// open repository. I want the review panel to hold the review for all the
// repositories. This way I can ask agents to start review and then I don't
// have to bother on which repository it is. I can just go to the review
// panel and open the proper review and it opens the proper repository as
// well."

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${ENGINE_URL}${path}`, {
    ...init,
    headers: engineHeaders({ "Content-Type": "application/json" }),
  })
  if (!res.ok) throw new Error(`${path}: http ${res.status} ${await res.text()}`)
  const text = await res.text()
  return (text ? JSON.parse(text) : null) as T
}

const openOnEngine = (path: string) =>
  api<{ id: string }>("/repos/open", { method: "POST", body: JSON.stringify({ path }) })

test.describe("agent reviews from every repository", () => {
  let previous: string | null = null
  test.beforeAll(async () => {
    previous = await currentRepoPath()
  })
  test.afterAll(async () => {
    await openRepoOnEngine(previous ?? process.cwd())
  })

  test("a review opened in another repository shows in the panel and opens in its repository", async ({ page }) => {
    test.setTimeout(90_000)
    const a = makeRepo("pg-xrepo-a-")
    write(a, "a.txt", "a\n")
    commit(a, "a")
    const b = makeRepo("pg-xrepo-b-")
    write(b, "b.txt", "one\n")
    commit(b, "b")
    write(b, "b.txt", "one\ntwo\n")

    // The window works on A.
    const { id: idA } = await openOnEngine(a)
    await page.goto(`/?repo=${idA}`)
    await expect(page.getByTestId("title-strip")).toContainText(basename(a), { timeout: 30_000 })

    // An agent opens a review in B (the MCP door opens B on the engine, as here).
    const { id: idB } = await openOnEngine(b)
    await api(`/repos/${idB}/agent-reviews`, {
      method: "POST",
      body: JSON.stringify({
        mode: "notify",
        title: "Review in B",
        why: "",
        agent: "xrepo-test",
        worktree: true,
        files: [{ path: "b.txt", status: "M" }],
      }),
    })

    // The badge and the panel count it while the window is still on A.
    await expect(page.getByTestId("agent-reviews-badge")).toHaveText(/[1-9]/, { timeout: 15_000 })
    await page.getByTestId("agent-reviews-button").click()
    const row = page.getByTestId("agent-review-row").filter({ hasText: "Review in B" })
    await expect(row).toBeVisible({ timeout: 15_000 })
    await expect(row.getByTestId("agent-review-repo")).toHaveText(basename(b))
    await expect(page.getByTestId("title-strip")).toContainText(basename(a))

    // Opening it opens B, then the review.
    await row.click()
    await expect(page.getByTestId("title-strip")).toContainText(basename(b), { timeout: 15_000 })
    await expect(page.getByTestId("round-diff")).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText("Review in B").first()).toBeVisible()
  })
})
