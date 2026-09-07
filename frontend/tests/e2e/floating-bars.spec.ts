import { expect, test } from "@playwright/test"

// Owner (2026-09-07): "The floating minibars ... when I try to use them,
// they tend to blink or disappear. An example, is in the diff view, if I
// try to change the number of context lines ... when I try to select the
// other options the bar disappears somehow."
// A MUI Select renders its menu outside the bar, so the pointer entering
// the menu used to count as leaving the bar, which collapsed and unmounted
// the open menu. The bar must stay open while its menu is open and the
// chosen value must reach the diff request.

test("the diff options bar stays open while its context menu is open and applies the choice", async ({ page }) => {
  await page.goto("/")
  await page.getByTestId("grid-row").first().waitFor()
  await page.getByRole("tab", { name: /Diff/ }).click()
  await expect(page.getByTestId("diff-pane")).toBeVisible()

  const requests: string[] = []
  page.on("request", (req) => {
    if (req.url().includes("/diff")) requests.push(req.url())
  })

  const bar = page.getByTestId("diff-options-bar")
  await bar.hover()
  await page.getByTestId("diff-context-select").click()
  const option = page.getByRole("option", { name: "10 lines" })
  await expect(option).toBeVisible()
  // Move the pointer onto the option the way a hand does: the menu lives
  // outside the bar, so this is the moment the bar used to collapse and
  // unmount the menu under the pointer.
  const box = (await option.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 4 })
  await expect(option).toBeVisible()
  await expect(page.getByTestId("diff-context-select")).toBeVisible()
  await option.click()

  await expect.poll(() => requests.some((u) => /context=10/.test(u))).toBe(true)
  await expect(page.getByTestId("diff-context-select")).toContainText("10 lines")
  // Leaving the bar now collapses it.
  await page.mouse.move(5, 5)
  await expect(page.getByTestId("diff-context-select")).toBeHidden()
})

test("the graph options bar stays open while its scope menu is open", async ({ page }) => {
  await page.goto("/")
  await page.getByTestId("grid-row").first().waitFor()
  await page.getByTestId("graph-options-bar").hover()
  await page.getByTestId("graph-scope-select").click()
  const option = page.getByRole("option", { name: "First parent only" })
  await expect(option).toBeVisible()
  await expect(page.getByTestId("graph-scope-select")).toBeVisible()
  await option.click()
  await expect(page.getByTestId("graph-scope-select")).toContainText("First parent only")
  // Still expanded after the choice: the pointer never left the bar.
  await expect(page.getByTestId("graph-dim-toggle")).toBeVisible()
  await page.evaluate(() => localStorage.removeItem("pg.graph"))
})
