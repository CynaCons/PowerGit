import { expect, test } from "@playwright/test"

// Owner (2026-09-07): "sometimes after a while the app freezes ... I don't
// have a way to bring back the logs" → "Trigger snapshot for diagnostic ...
// an emergency button just above the settings, and when we hit it, we dump
// all the information that we need in a file or package".
// In the browser there is no shell to write a zip, so the dialog shows the
// dump text to copy; the shell path writes snapshot-<time>.zip next to the
// logs (covered by cargo tests and the manual walk).

test("the rail has a snapshot button above Settings and it produces the dump", async ({ page }) => {
  await page.goto("/")
  await page.getByTestId("grid-row").first().waitFor()

  const snapshot = page.getByTestId("snapshot-button")
  const settings = page.getByTestId("settings-button")
  await expect(snapshot).toBeVisible()
  const a = (await snapshot.boundingBox())!
  const b = (await settings.boundingBox())!
  expect(a.y).toBeLessThan(b.y)

  await snapshot.click()
  const dialog = page.getByTestId("snapshot-dialog")
  await expect(dialog).toBeVisible()
  const dump = page.getByTestId("snapshot-dump")
  await expect(dump).toContainText(/"version": "\d+\.\d+\.\d+"/)
  await expect(dump).toContainText('"phase"')
  await expect(dump).toContainText('"rows"')
  await expect(dump).toContainText('"engine"')
  await page.getByRole("button", { name: "Close" }).click()
  await expect(dialog).toBeHidden()
})
