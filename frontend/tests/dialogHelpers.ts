import { expect, type Page } from "@playwright/test"

// The operation dialogs' branch picker (v0.18.11, BranchPicker.tsx): a
// button with the chip, a list under it with a filter box. `selectOption`
// no longer applies; this opens the list, filters and clicks the row.
export async function pickBranch(page: Page, testid: string, name: string): Promise<void> {
  const button = page.getByTestId(testid)
  await expect(button).toBeVisible()
  if ((await button.getAttribute("data-value")) === name) return
  await button.click()
  const filter = page.getByTestId(`${testid}-filter`)
  await expect(filter).toBeFocused()
  await filter.fill(name)
  await page.locator(`[data-testid="branch-option"][data-ref="${name}"]`).click()
  await expect(button).toHaveAttribute("data-value", name)
}
