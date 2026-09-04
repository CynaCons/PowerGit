import { expect, test } from "@playwright/test"
import { ENGINE_URL, engineHeaders, repoBase } from "../engine"

// v0.13.10 task 3: the UI must send network jobs to the session-qualified
// routes and poll the Location the engine answers with. No page.route()
// stubs here on purpose — a broad `**/fetch` glob is exactly how the
// unprefixed "/fetch" regression stayed invisible to the old specs.
test("Fetch posts to /repos/{id}/fetch and polls the session-qualified job", async ({ page }) => {
  const base = await repoBase()
  const sid = base.slice(base.lastIndexOf("/") + 1)

  await page.goto("/")
  await expect(page.getByTestId("grid-row").first()).toBeVisible({ timeout: 30_000 })

  const postPromise = page.waitForRequest(
    (r) => r.method() === "POST" && new URL(r.url()).pathname === `/repos/${sid}/fetch`,
    { timeout: 15_000 },
  )
  await page.getByTestId("fetch-button").click()
  const post = await postPromise
  const response = await post.response()
  expect(response, "the engine must answer the POST").not.toBeNull()
  // 202 with a job, or 400/409 when the checkout has no usable remote —
  // never a 404: that is the unprefixed-route regression.
  expect([202, 400, 409]).toContain(response!.status())

  if (response!.status() === 202) {
    const body = (await response!.json()) as { id: string }
    expect(response!.headers()["location"]).toBe(`/repos/${sid}/jobs/${body.id}`)
    const poll = await page.waitForRequest(
      (r) => r.method() === "GET" && new URL(r.url()).pathname === `/repos/${sid}/jobs/${body.id}`,
      { timeout: 15_000 },
    )
    expect((await poll.response())?.status()).toBe(200)
  }
})

test("job routes exist on the engine exactly where the UI sends them", async () => {
  const base = await repoBase()
  const res = await fetch(`${base}/jobs`, { headers: engineHeaders() })
  expect(res.status).toBe(200)
  // The bare, pre-session routes are gone for good.
  const stale = await fetch(`${ENGINE_URL}/fetch`, {
    method: "POST",
    headers: engineHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ remote: "origin" }),
  })
  expect(stale.status).toBe(404)
})
