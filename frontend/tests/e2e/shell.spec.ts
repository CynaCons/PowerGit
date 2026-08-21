import { expect, test } from "@playwright/test"

test("browse chrome is present", async ({ page }) => {
  await page.goto("/")
  await expect(page.getByTestId("browse-shell")).toBeVisible()
  await expect(page.getByTestId("navrail")).toBeVisible()
  await expect(page.getByTestId("left-panel")).toBeVisible()
  await expect(page.getByTestId("toolbar")).toBeVisible()
  await expect(page.getByTestId("revision-grid")).toBeVisible()
  await expect(page.getByTestId("bottom-panel")).toBeVisible()
  await expect(page.getByTestId("engine-status")).toBeVisible()
})

test("commit overlay opens from the toolbar", async ({ page }) => {
  await page.goto("/")
  await page.getByTestId("commit-button").click()
  await expect(page.getByTestId("commit-overlay")).toBeVisible()
  await page.keyboard.press("Escape")
})

test("selecting a row updates commit details", async ({ page }) => {
  await page.goto("/")
  const rows = page.getByTestId("grid-row")
  await expect(rows.first()).toBeVisible()
  const before = await page.getByTestId("commit-info").innerText()
  await rows.nth(3).click()
  await expect(page.getByTestId("commit-info")).not.toHaveText(before)
  await expect(rows.nth(3)).toHaveClass(/selected/)
})

test("grid virtualizes a large history", async ({ page }) => {
  await page.goto("/")
  const rows = page.getByTestId("grid-row")
  const count = await rows.count()
  expect(count).toBeGreaterThan(8)
  expect(count).toBeLessThan(200)
  await page.getByTestId("grid-body").evaluate((el) => {
    el.scrollTop = el.scrollHeight
  })
  await expect(rows.first()).toBeVisible()
  const after = await rows.count()
  expect(after).toBeLessThan(200)
})

test("sha column is visible", async ({ page }) => {
  await page.goto("/")
  await expect(page.getByTestId("sha-cell").first()).toBeVisible()
  await expect(page.getByTestId("sha-cell").first()).toHaveText(/^[0-9a-f]{7}$/i)
})

test("settings opens from the navrail", async ({ page }) => {
  await page.goto("/")
  await page.getByTestId("settings-button").click()
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible()
  await page.getByRole("button", { name: "Cancel" }).click()
})

test("diff tab splits files and diff side by side", async ({ page }) => {
  await page.goto("/")
  await page.getByRole("tab", { name: /Diff/ }).click()
  await expect(page.getByTestId("file-list")).toBeVisible()
  await expect(page.getByTestId("diff-pane")).toBeVisible()
  await expect(page.getByTestId("diff-options-bar")).toBeVisible()
  const list = page.getByTestId("file-list")
  const pane = page.getByTestId("diff-pane")
  const listBox = await list.boundingBox()
  const paneBox = await pane.boundingBox()
  expect(listBox).not.toBeNull()
  expect(paneBox).not.toBeNull()
  expect(paneBox!.x).toBeGreaterThanOrEqual(listBox!.x + listBox!.width)
})

test("file tree tab shows repo tree at revision", async ({ page }) => {
  await page.goto("/")
  await page.getByRole("tab", { name: "File Tree" }).click()
  await expect(page.getByTestId("commit-file-tree")).toBeVisible()
})

test("revision context menu offers checkout, reset, rebase", async ({ page }) => {
  await page.goto("/")
  await page.getByTestId("grid-row").first().click({ button: "right" })
  await expect(page.getByTestId("ctx-checkout")).toBeVisible()
  await expect(page.getByTestId("ctx-reset")).toBeVisible()
  await expect(page.getByTestId("ctx-rebase")).toBeVisible()
  await page.getByTestId("ctx-rebase").click()
  await expect(page.getByRole("heading", { name: /Rebase/ })).toBeVisible()
  await page.getByRole("button", { name: "Cancel" }).click()

  await page.getByTestId("grid-row").first().click({ button: "right" })
  await page.getByTestId("ctx-reset").click()
  await expect(page.getByRole("heading", { name: /Reset branch/ })).toBeVisible()
  await page.getByRole("button", { name: "Cancel" }).click()
})

test("left tree uses consistent indentation per depth", async ({ page }) => {
  await page.goto("/")
  await expect(page.getByTestId("left-panel")).toBeVisible()
  const rows = page.locator('[data-testid="tree-row"]')
  await expect(rows.first()).toBeVisible()
  const count = await rows.count()

  // Every row at the same depth must carry exactly one padding-left,
  // and it must match the uniform formula 6px + 16px * depth.
  const byDepth = new Map<number, Set<string>>()
  for (let i = 0; i < count; i++) {
    const row = rows.nth(i)
    const depth = Number(await row.getAttribute("data-depth"))
    const pl = await row.evaluate((el) => getComputedStyle(el).paddingLeft)
    const set = byDepth.get(depth) ?? new Set<string>()
    set.add(pl)
    byDepth.set(depth, set)
  }
  expect(byDepth.size).toBeGreaterThan(0)
  for (const [depth, paddings] of byDepth) {
    expect(paddings.size, `depth ${depth} has mixed padding: ${[...paddings].join(", ")}`).toBe(1)
    expect(paddings.values().next().value).toBe(`${6 + depth * 16}px`)
  }

  // Nested rows (e.g. branches under a remote group) indent one level deeper
  // than top-level rows.
  const child = page.locator('[data-testid="tree-row"][data-depth="1"]')
  if ((await child.count()) > 0) {
    const topLevelPl = await page
      .locator('[data-testid="tree-row"][data-depth="0"]')
      .first()
      .evaluate((el) => getComputedStyle(el).paddingLeft)
    const childPl = await child.first().evaluate((el) => getComputedStyle(el).paddingLeft)
    expect(Number.parseFloat(childPl)).toBeGreaterThan(Number.parseFloat(topLevelPl))
  }
})

test("bottom panel splitter resizes", async ({ page }) => {
  await page.goto("/")
  const panel = page.getByTestId("bottom-panel")
  const before = (await panel.boundingBox())!.height
  const splitter = page.getByTestId("panel-splitter")
  const box = (await splitter.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2, box.y - 100, { steps: 5 })
  await page.mouse.up()
  const after = (await panel.boundingBox())!.height
  expect(after).toBeGreaterThan(before + 50)
})
