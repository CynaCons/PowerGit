import { expect, test } from "@playwright/test"
import { ENGINE_URL, engineHeaders } from "../engine"

async function realCurrentRepo() {
  const response = await fetch(`${ENGINE_URL}/repos/current`, { headers: engineHeaders() })
  if (!response.ok) throw new Error(`no fixture repository on the engine: http ${response.status}`)
  return (await response.json()) as { id: string; root: string; name: string }
}

test("cold start reopens the most recent repository", async ({ page }) => {
  const fixture = await realCurrentRepo()
  let firstCurrent = true
  await page.route("**/repos/current", async (route) => {
    if (firstCurrent) {
      firstCurrent = false
      await route.fulfill({ status: 404 })
    } else await route.continue()
  })
  await page.route("**/repos/recents", (route) => route.fulfill({ json: [fixture] }))

  await page.goto("/")
  await expect(page.getByTestId("grid-row").first()).toBeVisible({ timeout: 30_000 })
  await expect(page.getByTestId("rail-repo")).toContainText(fixture.name)
})

test("cold start stays on empty Browse when reopening the last repository is off", async ({ page }) => {
  const fixture = await realCurrentRepo()
  await page.addInitScript(() => localStorage.setItem("pg.behaviour", JSON.stringify({ openLastOnStart: false })))
  let firstCurrent = true
  await page.route("**/repos/current", async (route) => {
    if (firstCurrent) {
      firstCurrent = false
      await route.fulfill({ status: 404 })
    } else await route.continue()
  })
  await page.route("**/repos/recents", (route) => route.fulfill({ json: [fixture] }))

  await page.goto("/")
  await expect(page.getByTestId("grid-open-repo")).toBeVisible()
})
