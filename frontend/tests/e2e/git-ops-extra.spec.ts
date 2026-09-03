import { expect, test } from "@playwright/test"

// Audit item A.9: cherry-pick and revert were disabled "(coming soon)"
// placeholders in the revision context menu. Both requests are intercepted
// so these tests never mutate the real repository the dev engine has open.
test("cherry-pick dialog calls the engine and surfaces a conflict error", async ({ page }) => {
  await page.goto("/")
  await expect(page.getByTestId("grid-row").first()).toBeVisible()

  let called = false
  await page.route(
    (url) => url.pathname.endsWith("/cherry-pick"),
    async (route) => {
      called = true
      await route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({ error: "Cherry-pick stopped (conflicts or errors); the cherry-pick was aborted." }),
      })
    },
  )

  await page.getByTestId("grid-row").first().click({ button: "right" })
  await page.getByTestId("ctx-cherry-pick").click()
  await expect(page.getByRole("heading", { name: /Cherry-pick/ })).toBeVisible()

  await page.getByTestId("cherry-pick-confirm").click()
  await expect(page.getByText(/cherry-pick failed/)).toBeVisible()
  expect(called).toBe(true)

  // The dialog stays open on failure so the user sees the error, and can
  // still be dismissed manually.
  await page.getByRole("button", { name: "Cancel" }).click()
  await expect(page.getByRole("heading", { name: /Cherry-pick/ })).toBeHidden()
})

test("revert dialog calls the engine and closes on success", async ({ page }) => {
  await page.goto("/")
  await expect(page.getByTestId("grid-row").first()).toBeVisible()

  let called = false
  await page.route(
    (url) => url.pathname.endsWith("/revert"),
    async (route) => {
      called = true
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ branch: "main", unstagedCount: 0, stagedCount: 0, unstaged: [], staged: [] }),
      })
    },
  )

  await page.getByTestId("grid-row").first().click({ button: "right" })
  await page.getByTestId("ctx-revert").click()
  await expect(page.getByRole("heading", { name: /Revert/ })).toBeVisible()

  await page.getByTestId("revert-confirm").click()
  await expect(page.getByRole("heading", { name: /Revert/ })).toBeHidden()
  expect(called).toBe(true)
})
