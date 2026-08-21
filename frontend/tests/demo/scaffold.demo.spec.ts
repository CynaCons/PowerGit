import { expect, test } from "@playwright/test"

test("owner design demo — scaffold", async ({ page }) => {
  const wait = Number(process.env.DEMO_PAUSE_MS ?? "900")
  await page.goto("/")
  await expect(page.getByTestId("browse-shell")).toBeVisible()
  await page.waitForTimeout(wait)

  await page.getByTestId("navrail").hover()
  await page.waitForTimeout(wait)

  await page.getByTestId("left-panel").hover()
  await page.waitForTimeout(wait)

  await page.getByTestId("toolbar").hover()
  await page.waitForTimeout(wait)

  const body = page.getByTestId("grid-body")
  await body.hover()
  await page.waitForTimeout(wait)
  await body.evaluate((el) => {
    el.scrollTop = 400
  })
  await page.waitForTimeout(wait)

  await page.getByTestId("grid-row").nth(4).click()
  await expect(page.getByTestId("commit-info")).toBeVisible()
  await page.waitForTimeout(wait)

  await page.getByTestId("commit-button").click()
  await expect(page.getByTestId("commit-overlay")).toBeVisible()
  await page.waitForTimeout(wait)
  await page.getByRole("button", { name: "Cancel" }).click()
  await page.waitForTimeout(wait)
})
