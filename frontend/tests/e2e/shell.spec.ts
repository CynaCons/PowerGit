import { expect, test } from "@playwright/test"

test("browse chrome is present", async ({ page }) => {
  await page.goto("/")
  await expect(page.getByTestId("browse-shell")).toBeVisible()
  await expect(page.getByTestId("navrail")).toBeVisible()
  await expect(page.getByTestId("left-panel")).toBeVisible()
  await expect(page.getByTestId("title-strip")).toBeVisible()
  await expect(page.getByTestId("commit-button")).toBeVisible()
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

test("only the selected row is highlighted", async ({ page }) => {
  await page.goto("/")
  const rows = page.getByTestId("grid-row")
  await expect(rows.first()).toBeVisible()

  // v0.12.3 removed the "highlight every other commit by this author"
  // behaviour outright. It was reported three times: it used the same visual
  // channel as the selection, and on a repo with one dominant author it
  // marked nearly every row, so the selected commit stopped standing out.
  // The contract now is simply that exactly one row looks selected.
  const target = rows.nth(2)
  await target.click()
  await expect(target).toHaveClass(/selected/)
  await expect(target).toHaveCSS("border-left-width", "2px")

  // The tint lives on the text cells, never on the row element itself: a
  // row background would cover the graph canvas underneath (owner report
  // "commits disappear when they are selected", see
  // selected-row-graph.spec.ts). Compare the message cell across rows.
  await expect(target).toHaveCSS("background-color", "rgba(0, 0, 0, 0)")
  const selectedBackground = await target.locator(".msg").evaluate((el) => getComputedStyle(el).backgroundColor)
  const others = await rows.evaluateAll(
    (els, sel: string) =>
      els
        .filter((el) => !el.classList.contains("selected"))
        // The hovered row legitimately differs; the pointer sits on the row we
        // just clicked, so anything else tinted like the selection is a bug.
        .map((el) => getComputedStyle(el.querySelector(".msg")!).backgroundColor)
        .filter((bg) => bg === sel).length,
    selectedBackground,
  )
  expect(others, "rows other than the selected one share its highlight").toBe(0)

  await expect(page.locator(".grid-row.author-highlight")).toHaveCount(0)

  // WebKitGTK regression guard: unselected rows must keep their text painted
  // (non-transparent, fully opaque) — see docs/agents/memories/webkitgtk-css.md.
  const neighbour = rows.nth(4)
  await expect(neighbour.locator(".msg-text")).toBeVisible()
  const styles = await neighbour.evaluate((el) => {
    const msg = el.querySelector(".msg-text") as HTMLElement | null
    const author = el.querySelector(".author") as HTMLElement | null
    if (!msg || !author) throw new Error("Missing text elements on row")
    return {
      msgColor: getComputedStyle(msg).color,
      authorColor: getComputedStyle(author).color,
      rowOpacity: getComputedStyle(el).opacity,
    }
  })
  expect(styles.msgColor).not.toBe("rgba(0, 0, 0, 0)")
  expect(styles.authorColor).not.toBe("rgba(0, 0, 0, 0)")
  expect(styles.rowOpacity).toBe("1")
})

test("the status bar sits at the bottom and is never truncated to stubs", async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 800 })
  await page.goto("/")
  const bar = page.getByTestId("engine-status")
  await expect(bar).toBeVisible()
  await expect(bar).toContainText("(", { timeout: 30_000 })

  const shell = (await page.getByTestId("browse-shell").boundingBox())!
  const barBox = (await bar.boundingBox())!
  // Bottom of the window, below the bottom panel - not crammed into the
  // toolbar's leftover width, which is where it used to be elided into
  // unreadable stubs.
  const panel = (await page.getByTestId("bottom-panel").boundingBox())!
  expect(barBox.y).toBeGreaterThanOrEqual(panel.y + panel.height - 1)
  expect(Math.round(barBox.y + barBox.height)).toBeLessThanOrEqual(Math.round(shell.y + shell.height) + 1)

  // The branch name and dirty count are pinned: only the build info may be
  // elided when space runs out.
  const branch = page.getByTestId("status-branch")
  const clipped = await branch.evaluate((el) => el.scrollWidth > el.clientWidth + 1)
  expect(clipped, "branch name is truncated in the status bar").toBe(false)
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

  // MUI dialogs open with a grow/fade transition, so the paper is still
  // changing size for a few frames after it becomes "visible". Measuring
  // during that window captures a transient height and makes this assertion
  // fail intermittently for a reason that has nothing to do with selecting a
  // file. Wait until two consecutive measurements agree.
  async function settledBox() {
    let previous = (await paper.boundingBox())!
    for (let attempt = 0; attempt < 30; attempt++) {
      await page.waitForTimeout(50)
      const next = (await paper.boundingBox())!
      if (Math.abs(next.height - previous.height) < 0.5 && Math.abs(next.width - previous.width) < 0.5) {
        return next
      }
      previous = next
    }
    return previous
  }

  const before = await settledBox()
  expect(before).not.toBeNull()
  const row = page.getByTestId("unstaged-list-row").first()
  if ((await row.count()) > 0) {
    await row.click()
    // Not `.or(commit-diff)`: diff-view is nested INSIDE commit-diff, so once
    // the diff has actually rendered the or-locator matches two elements and
    // trips strict mode. It only ever passed while the diff was still loading
    // and just one of the two existed — i.e. it was passing for the wrong
    // reason. diff-view is the real "the diff rendered" signal, and the next
    // assertion needs it anyway.
    await expect(page.getByTestId("diff-view")).toBeVisible()
    await expect(page.getByTestId("diff-view")).toHaveCSS("font-variant-ligatures", "none")
    const after = await settledBox()
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

test("auto-scroll does not re-center the viewport on an unrelated re-render", async ({ page }) => {
  await page.goto("/")
  const rows = page.getByTestId("grid-row")
  await expect(rows.first()).toBeVisible()

  // Select a row in the middle, then scroll it out of view - this mirrors
  // the reported bug: a --date-order refresh keeps the same SHA selected
  // but at a different index, and the grid must not yank the viewport
  // back to it (RevisionGrid.tsx auto-scroll effect).
  await rows.nth(5).click()
  await expect(rows.nth(5)).toHaveClass(/selected/)

  const gridBody = page.getByTestId("grid-body")
  await gridBody.evaluate((el) => {
    el.scrollTop = el.scrollHeight
  })
  const scrolledTop = await gridBody.evaluate((el) => el.scrollTop)
  expect(scrolledTop).toBeGreaterThan(0)

  // Resizing forces RevisionGrid's virtualizer to re-render with no user
  // navigation involved; the still-selected row must stay wherever the
  // user scrolled it, not get scrolled back into view.
  const size = page.viewportSize() ?? { width: 1280, height: 720 }
  await page.setViewportSize({ width: size.width - 60, height: size.height - 60 })
  await page.evaluate(
    () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
  )

  expect(await gridBody.evaluate((el) => el.scrollTop)).toBe(scrolledTop)
})

test("grid Home/End/PageUp/PageDown move the selection", async ({ page }) => {
  await page.goto("/")
  const rows = page.getByTestId("grid-row")
  await expect(rows.first()).toBeVisible()
  await rows.first().click()
  const firstInfo = await page.getByTestId("commit-info").innerText()

  const selectedRow = page.locator('[data-testid="grid-row"].selected')

  await page.keyboard.press("End")
  await expect(page.getByTestId("commit-info")).not.toHaveText(firstInfo)
  const lastIndex = Number(await selectedRow.getAttribute("data-index"))
  expect(lastIndex).toBeGreaterThan(1)

  // "data-index" is set synchronously from RevisionGrid's own props, so
  // it is a more robust "back on the same row" signal than re-diffing
  // commit-info's async, multi-paragraph innerText (which can otherwise
  // flake on whitespace during rapid navigation).
  await page.keyboard.press("Home")
  await expect(selectedRow).toHaveAttribute("data-index", "0")

  await page.keyboard.press("PageDown")
  const afterPageDown = Number(await selectedRow.getAttribute("data-index"))
  expect(afterPageDown).toBeGreaterThan(1)
  expect(afterPageDown).toBeLessThan(lastIndex)

  await page.keyboard.press("PageUp")
  await expect(selectedRow).toHaveAttribute("data-index", "0")
})

test("settings labels are never clipped by the dialog content edge", async ({ page }) => {
  await page.goto("/")
  await page.getByTestId("settings-button").click()
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible()

  const content = page.locator(".MuiDialogContent-root")
  await expect(content).toBeVisible()

  // User name, Email (TextFields), core.autocrlf, Appearance and Command bar
  // (Selects) render outlined floating labels subject to the same top-edge clip.
  const labels = content.locator(".MuiFormControl-root .MuiInputLabel-root")
  await expect(labels).toHaveCount(5)

  // A label is clipped when it is cut by the content edge while its own field
  // is on screen. A label that has simply scrolled out of view is not clipped,
  // so only labels that overlap the visible content area are checked.
  async function assertNoLabelIsClipped() {
    const contentBox = (await content.boundingBox())!
    const top = contentBox.y
    const bottom = contentBox.y + contentBox.height
    let checked = 0
    for (const label of await labels.all()) {
      const box = (await label.boundingBox())!
      const visible = box.y + box.height > top && box.y < bottom
      if (!visible) continue
      checked++
      // Measure how much of the label is actually inside the content box
      // rather than demanding exact containment. The defect this guards
      // (v0.4.7) cut a label in half; an outlined MUI label straddles its
      // field's top border by design, and at some dialog positions layout
      // rounding leaves it ~1px outside — 96% visible, indistinguishable to
      // the eye, but a hard containment assertion fails intermittently on it
      // and reports a clipping regression that is not there.
      const insideTop = Math.max(box.y, top)
      const insideBottom = Math.min(box.y + box.height, bottom)
      const visibleFraction = (insideBottom - insideTop) / box.height
      expect(visibleFraction, `label "${await label.textContent()}" is clipped`).toBeGreaterThan(0.9)
    }
    expect(checked).toBeGreaterThan(0)
  }

  // Unscrolled: this is the v0.4.7 regression — the first label sat under the
  // DialogContent top padding and was cut in half. Pin scrollTop to 0 first:
  // the dialog autofocuses its first input, and the browser's scroll-into-view
  // can nudge the container by a pixel, which then reads as a 1px "clip" here.
  // That is scrolling, not clipping — the very distinction this test exists to
  // draw — so it must be removed rather than absorbed into a tolerance.
  await content.evaluate((el) => {
    el.scrollTop = 0
  })
  await assertNoLabelIsClipped()

  // Scrolled to the bottom: the last field must be fully reachable. Labels the
  // user scrolled past sit legitimately above the box (that is scrolling, not
  // clipping), so only the last one is asserted here — asserting all of them
  // made this test pass or fail on whether the dialog happened to scroll.
  await content.evaluate((el) => {
    el.scrollTop = el.scrollHeight
  })
  const contentBox = (await content.boundingBox())!
  const last = (await labels.last().boundingBox())!
  const lastInside =
    (Math.min(last.y + last.height, contentBox.y + contentBox.height) - Math.max(last.y, contentBox.y)) / last.height
  expect(lastInside, "the last label is not fully reachable by scrolling").toBeGreaterThan(0.9)

  await page.getByRole("button", { name: "Cancel" }).click()
})
