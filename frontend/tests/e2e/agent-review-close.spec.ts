import { basename } from "node:path"
import { expect, test } from "@playwright/test"
import { ENGINE_URL, engineHeaders } from "../engine"
import { currentRepoPath, makeRepo, openRepoOnEngine, removeRepo } from "../repoFixture"

// v0.22.9, owner: "One of my agent tells me that they cannot close an
// approved review. It refuses with not pending. So I think we need a way to
// cancel or dismiss reviews." An agent closes a finished review instead of
// being refused; the owner dismisses reviews from the inbox, and dismissed
// ones have their own list.

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${ENGINE_URL}${path}`, {
    ...init,
    headers: engineHeaders({ "Content-Type": "application/json" }),
  })
  if (!res.ok) throw new Error(`${path}: http ${res.status} ${await res.text()}`)
  const text = await res.text()
  return (text ? JSON.parse(text) : null) as T
}

const patch = "@@ -1 +1 @@\n-base\n+next\n"

test.describe("closing agent reviews", () => {
  let previous: string | null = null
  test.beforeAll(async () => {
    previous = await currentRepoPath()
  })
  test.afterAll(async () => {
    await openRepoOnEngine(previous ?? process.cwd())
  })

  test("an approved review closes, and the inbox dismisses reviews", async ({ page }) => {
    test.setTimeout(60_000)
    const dir = makeRepo("pg-review-close-")
    try {
      const { id: repoId } = await api<{ id: string }>("/repos/open", {
        method: "POST",
        body: JSON.stringify({ path: dir }),
      })
      const open = (title: string) =>
        api<{ id: string }>(`/repos/${repoId}/agent-reviews`, {
          method: "POST",
          body: JSON.stringify({
            mode: "wait",
            title,
            agent: "auth-fix",
            files: [{ path: "a.txt", status: "M", patch }],
          }),
        })
      const resolve = (id: string, action: string) =>
        api<{ status: string; closedAt: string | null }>(`/repos/${repoId}/agent-reviews/${id}/resolve`, {
          method: "POST",
          body: JSON.stringify({ action }),
        })

      // The agent closes the review the owner approved: no more "not pending".
      const done = await open("Approved then closed")
      await resolve(done.id, "approve")
      const closed = await resolve(done.id, "cancel")
      expect(closed.status).toBe("approved")
      expect(closed.closedAt).toBeTruthy()

      const finished = await open("Finished, to dismiss")
      await resolve(finished.id, "approve")
      await open("Still waiting")

      await page.goto(`/?repo=${repoId}`)
      await page.getByTestId("agent-reviews-button").click()
      await page.getByTestId("inbox-filter-all").click()
      const rows = page.getByTestId("agent-review-row").filter({ hasText: basename(dir) })
      const row = (title: string) =>
        page
          .getByTestId("agent-review-row")
          .filter({ hasText: title })
          .filter({ hasText: basename(dir) })
      await expect(row("Still waiting")).toHaveCount(1)
      await expect(row("Finished, to dismiss")).toHaveCount(1)
      await expect(row("Approved then closed")).toHaveCount(0)

      // The owner dismisses the finished one and cancels the waiting one.
      await row("Finished, to dismiss").getByTestId("agent-review-dismiss").click()
      await expect(row("Finished, to dismiss")).toHaveCount(0)
      await row("Still waiting").getByTestId("agent-review-dismiss").click()
      await expect(rows).toHaveCount(0)

      await page.getByTestId("inbox-filter-dismissed").click()
      await expect(rows).toHaveCount(3)
      await expect(row("Finished, to dismiss")).toHaveAttribute("data-status", "approved")
      await expect(row("Still waiting")).toHaveAttribute("data-status", "cancelled")
      await expect(row("Still waiting").getByTestId("agent-review-dismiss")).toHaveCount(0)
    } finally {
      await removeRepo(dir)
    }
  })
})
