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
  await expect(page.getByTestId("stage-selected")).toBeVisible()
  await expect(page.getByTestId("stage-all")).toBeVisible()
  await expect(page.getByTestId("unstage-selected")).toBeVisible()
  await expect(page.getByTestId("unstage-all")).toBeVisible()
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

test("selected rows stay distinct from same-author rows", async ({ page }) => {
  await page.goto("/")
  const rows = page.getByTestId("grid-row")
  await expect(rows.first()).toBeVisible()

  const duplicate = await rows.evaluateAll((elements) => {
    const seen = new Map<string, number>()
    for (let index = 0; index < elements.length; index++) {
      const author = elements[index].querySelector(".author")?.textContent?.trim()
      if (!author) continue
      const firstIndex = seen.get(author)
      if (firstIndex !== undefined) {
        return { selectedIndex: firstIndex, sameAuthorIndex: index, author }
      }
      seen.set(author, index)
    }
    return null
  })

  if (duplicate === null) {
    throw new Error("Could not find two visible rows with the same author")
  }

  const selectedRow = page.locator(`[data-testid="grid-row"][data-index="${duplicate.selectedIndex}"]`)
  const sameAuthorRow = page.locator(`[data-testid="grid-row"][data-index="${duplicate.sameAuthorIndex}"]`)
  const canvas = page.getByTestId("graph-canvas")

  await selectedRow.click()
  await expect(selectedRow).toHaveClass(/selected/)
  await expect(sameAuthorRow).not.toHaveClass(/selected/)
  await expect(canvas).toBeVisible()

  const selectedBackground = await selectedRow.evaluate((el) => getComputedStyle(el).backgroundColor)
  const sameAuthorBackground = await sameAuthorRow.evaluate((el) => getComputedStyle(el).backgroundColor)
  expect(selectedBackground).not.toBe(sameAuthorBackground)
  await expect(selectedRow).toHaveCSS("border-left-width", "2px")

  const selectedBox = await selectedRow.boundingBox()
  const sameAuthorBox = await sameAuthorRow.boundingBox()
  const canvasBox = await canvas.boundingBox()
  if (!selectedBox || !sameAuthorBox || !canvasBox) {
    throw new Error("Missing row or canvas bounds")
  }

  const dpr = await page.evaluate(() => window.devicePixelRatio || 1)
  const selectedCanvasPixel = await canvas.evaluate(
    (el, { x, y, dpr }: { x: number; y: number; dpr: number }) => {
      const ctx = el.getContext("2d")
      if (!ctx) throw new Error("Canvas context unavailable")
      return Array.from(ctx.getImageData(Math.round(x * dpr), Math.round(y * dpr), 1, 1).data)
    },
    { x: 1, y: selectedBox.y - canvasBox.y + selectedBox.height / 2, dpr },
  )
  const sameAuthorCanvasPixel = await canvas.evaluate(
    (el, { x, y, dpr }: { x: number; y: number; dpr: number }) => {
      const ctx = el.getContext("2d")
      if (!ctx) throw new Error("Canvas context unavailable")
      return Array.from(ctx.getImageData(Math.round(x * dpr), Math.round(y * dpr), 1, 1).data)
    },
    { x: 1, y: sameAuthorBox.y - canvasBox.y + sameAuthorBox.height / 2, dpr },
  )
  expect(selectedCanvasPixel).not.toEqual(sameAuthorCanvasPixel)

  // WebKitGTK regression guard: a same-author row must keep its message and
  // author text visibly painted (non-transparent, fully opaque) once the
  // author-highlight background applies — see
  // docs/agents/memories/webkitgtk-css.md.
  await expect(sameAuthorRow.locator(".msg-text")).toBeVisible()
  const sameAuthorTextStyles = await sameAuthorRow.evaluate((el) => {
    const msg = el.querySelector(".msg-text") as HTMLElement | null
    const author = el.querySelector(".author") as HTMLElement | null
    if (!msg || !author) throw new Error("Missing text elements on same-author row")
    return {
      msgColor: getComputedStyle(msg).color,
      authorColor: getComputedStyle(author).color,
      rowOpacity: getComputedStyle(el).opacity,
    }
  })
  expect(sameAuthorTextStyles.msgColor).not.toBe("rgba(0, 0, 0, 0)")
  expect(sameAuthorTextStyles.authorColor).not.toBe("rgba(0, 0, 0, 0)")
  expect(sameAuthorTextStyles.rowOpacity).toBe("1")
})

test("grid virtualizes a large history", async ({ page }) => {
  await page.goto("/")
  // Large repos load revisions asynchronously; never fall back to counting
  // an empty or synthetic grid.
  await expect(page.getByTestId("engine-status")).toContainText("(", { timeout: 30_000 })
  const rows = page.getByTestId("grid-row")
  await expect(rows.first()).toBeVisible({ timeout: 30_000 })
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
  await expect(page.getByTestId("grid-row").first()).toBeVisible()
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

  // Section titles share the rows' leading geometry: their own content
  // starts at the same 6px indent as row chevrons — never deeper.
  for (const title of ["branches", "remotes", "tags", "submodules"]) {
    const header = page.locator(`[data-testid="tree-section-${title}"]`)
    if ((await header.count()) === 0) continue
    const pl = await header.evaluate((el) => getComputedStyle(el).paddingLeft)
    expect(pl, `section ${title}`).toBe("6px")
  }

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

test("left tree filter finds refs by substring", async ({ page }) => {
  await page.goto("/")
  await expect(page.getByTestId("left-panel")).toBeVisible()
  await expect(page.locator('[data-testid="tree-row"]').first()).toBeVisible()

  // Filter mode lists matches with their FULL ref names — the guaranteed way
  // to find a branch among thousands.
  const filter = page.getByTestId("tree-filter")
  await filter.fill("power")
  await expect(page.locator('[data-testid="tree-row"][data-label*="power"]').first()).toBeVisible()

  await filter.fill("no-such-ref-zzz")
  await expect(page.locator('[data-testid="tree-row"]')).toHaveCount(0)

  await filter.fill("")
  await expect(page.locator('[data-testid="tree-row"]').first()).toBeVisible()
})

test("grid arrow keys move the selection", async ({ page }) => {
  await page.goto("/")
  const rows = page.getByTestId("grid-row")
  await expect(rows.first()).toBeVisible()
  await rows.first().click()
  const before = await page.getByTestId("commit-info").innerText()
  await page.keyboard.press("ArrowDown")
  await expect(page.getByTestId("commit-info")).not.toHaveText(before)
  await expect(rows.nth(1)).toHaveClass(/selected/)
})

test("Ctrl+Space opens the commit overlay", async ({ page }) => {
  await page.goto("/")
  await page.keyboard.press("Control+Space")
  await expect(page.getByTestId("commit-overlay")).toBeVisible()
  await page.keyboard.press("Escape")
})

test("Ctrl+Comma opens settings", async ({ page }) => {
  await page.goto("/")
  await page.keyboard.press("Control+Comma")
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible()
  await page.getByRole("button", { name: "Cancel" }).click()
})

test("F5 does not reload the SPA", async ({ page }) => {
  await page.goto("/")
  await expect(page.getByTestId("browse-shell")).toBeVisible()
  await page.evaluate(() => {
    ;(window as Window & { __pgHotkey?: number }).__pgHotkey = 1
  })
  await page.keyboard.press("F5")
  await expect(page.getByTestId("browse-shell")).toBeVisible()
  expect(await page.evaluate(() => (window as Window & { __pgHotkey?: number }).__pgHotkey)).toBe(1)
})

test("commit overlay S stages selected files and types in the message", async ({ page }) => {
  await page.goto("/")
  await page.keyboard.press("Control+Space")
  await expect(page.getByTestId("commit-overlay")).toBeVisible()

  const message = page.getByTestId("commit-message-input")
  await message.click()
  await page.keyboard.press("s")
  await expect(message).toHaveValue("s")
  await message.fill("")

  const unstaged = page.getByTestId("unstaged-list-row")
  if ((await unstaged.count()) === 0) return
  const first = unstaged.first()
  const path = await first.locator("[title]").getAttribute("title")
  await first.click()
  await page.keyboard.press("s")
  const staged = page.getByTestId("staged-list-row").locator(`[title="${path}"]`)
  await expect(staged).toBeVisible()
  await staged.click()
  await page.keyboard.press("u")
  await expect(page.getByTestId("unstaged-list-row").locator(`[title="${path}"]`)).toBeVisible()
})

test("commit overlay size does not jump when selecting a file", async ({ page }) => {
  await page.goto("/")
  await page.getByTestId("commit-button").click()
  await expect(page.getByTestId("commit-overlay")).toBeVisible()
  const paper = page.locator(".MuiDialog-paper")
  await expect(paper).toBeVisible()
  const before = await paper.boundingBox()
  expect(before).not.toBeNull()
  const row = page.getByTestId("unstaged-list-row").first()
  if ((await row.count()) > 0) {
    await row.click()
    await expect(page.getByTestId("diff-view").or(page.getByTestId("commit-diff"))).toBeVisible()
    await expect(page.getByTestId("diff-view")).toHaveCSS("font-variant-ligatures", "none")
    const after = await paper.boundingBox()
    expect(after).not.toBeNull()
    expect(Math.abs(after!.height - before!.height)).toBeLessThan(2)
    expect(Math.abs(after!.width - before!.width)).toBeLessThan(2)
  }
})

test("Ctrl+3 focuses the Diff tab", async ({ page }) => {
  await page.goto("/")
  await page.keyboard.press("Control+3")
  await expect(page.getByTestId("file-list")).toBeVisible()
  await expect(page.getByTestId("diff-pane")).toBeVisible()
})
