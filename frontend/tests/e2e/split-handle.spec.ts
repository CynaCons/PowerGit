import { expect, test } from "@playwright/test"

// SplitHandle.tsx backs the resizable file column in the bottom panel's
// Diff and File Tree tabs (BottomPanel.tsx). bottom-split.spec.ts covers the
// happy-path pointerup drag; this file covers the pointer-capture edge
// cases and visual affordances that test does not exercise.

test("split handle has a minimum 8px hit area and a visible hover/active state", async ({ page }) => {
  await page.goto("/")
  await expect(page.getByTestId("grid-row").first()).toBeVisible()
  await page.getByRole("tab", { name: /Diff/ }).click()

  const handle = page.getByTestId("bottom-split-handle")
  await expect(handle).toBeVisible()
  const box = (await handle.boundingBox())!
  expect(box.width).toBeGreaterThanOrEqual(8)

  const rest = await handle.evaluate((el) => getComputedStyle(el).backgroundColor)

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  const hovered = await handle.evaluate((el) => getComputedStyle(el).backgroundColor)
  expect(hovered).not.toBe(rest)

  await page.mouse.down()
  const active = await handle.evaluate((el) => getComputedStyle(el).backgroundColor)
  expect(active).not.toBe(rest)
  expect(active).not.toBe(hovered)
  await page.mouse.up()
})

test("pointercancel releases the handle and persists the width like pointerup", async ({ page }) => {
  await page.goto("/")
  await expect(page.getByTestId("grid-row").first()).toBeVisible()
  await page.getByTestId("grid-row").first().click()
  await page.getByRole("tab", { name: /Diff/ }).click()

  const fileList = page.getByTestId("file-list")
  await expect(fileList).toBeVisible()
  const handle = page.getByTestId("bottom-split-handle")
  await expect(handle).toBeVisible()

  const before = (await fileList.boundingBox())!
  const handleBox = (await handle.boundingBox())!
  const startX = handleBox.x + handleBox.width / 2
  const startY = handleBox.y + handleBox.height / 2

  await page.mouse.move(startX, startY)
  await page.mouse.down()
  await page.mouse.move(startX + 90, startY, { steps: 10 })

  // Simulate a GTK focus steal / touch interruption mid-drag: the browser
  // fires pointercancel (and revokes capture, which also fires
  // lostpointercapture) instead of pointerup. The handle must still commit
  // the in-progress width rather than get stuck mid-drag.
  await handle.dispatchEvent("pointercancel", { pointerId: 1, bubbles: true, cancelable: true })
  await page.mouse.up()

  const after = (await fileList.boundingBox())!
  const grew = after.width - before.width
  expect(grew).toBeGreaterThan(70)
  expect(grew).toBeLessThan(110)

  await page.reload()
  await expect(page.getByTestId("grid-row").first()).toBeVisible()
  await page.getByRole("tab", { name: /Diff/ }).click()
  const persisted = (await page.getByTestId("file-list").boundingBox())!
  expect(Math.abs(persisted.width - after.width)).toBeLessThan(2)
})
