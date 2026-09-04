import { expect, test } from "@playwright/test"

// Audit item B.1: Git Extensions never wraps a diff line mid-token; long
// lines must scroll horizontally inside the diff container instead. The
// left gutter mirrors GE's FileViewer margin, parsed from @@ hunk headers.
test("diff view does not wrap and shows a line-number gutter", async ({ page }) => {
  await page.goto("/")
  await expect(page.getByTestId("grid-row").first()).toBeVisible()
  await page.getByTestId("grid-row").first().click()
  await page.getByRole("tab", { name: /Diff/ }).click()
  await expect(page.getByTestId("diff-pane")).toBeVisible()

  const rows = page.getByTestId("file-list-row")
  if ((await rows.count()) === 0) return
  await rows.first().click()

  const diff = page.getByTestId("diff-view")
  await expect(diff).toBeVisible()
  await expect(diff).toHaveCSS("white-space", "pre")
  await expect(diff).toHaveCSS("overflow-x", "auto")

  // At least one rendered line must carry a gutter number on either side.
  const gutters = diff.locator('[data-testid="diff-gutter"]')
  await expect(gutters.first()).toBeAttached()
  const texts = await gutters.allTextContents()
  expect(texts.some((t) => /\d/.test(t))).toBe(true)
})

test("blob view does not wrap long lines", async ({ page }) => {
  await page.goto("/")
  await expect(page.getByTestId("grid-row").first()).toBeVisible()
  await page.getByTestId("grid-row").first().click()
  await page.getByRole("tab", { name: "File Tree" }).click()
  await expect(page.getByTestId("commit-file-tree")).toBeVisible()

  const fileNodes = page.locator('[data-testid="commit-file-tree-row"][data-type="blob"]')
  if ((await fileNodes.count()) === 0) return
  await fileNodes.first().click()

  const blob = page.getByTestId("blob-pane")
  await expect(blob).toBeVisible()
  await expect(blob).toHaveCSS("white-space", "pre")
})

// Audit item B.6: double-clicking a file in the Files tab must open it in
// the configured external diff tool instead of doing nothing. The request
// is intercepted so this test never actually launches an editor process.
test("double-click a file in the Files tab requests the external diff tool", async ({ page }) => {
  await page.goto("/")
  await expect(page.getByTestId("grid-row").first()).toBeVisible()
  await page.getByTestId("grid-row").first().click()
  await page.getByRole("tab", { name: /Diff/ }).click()

  const rows = page.getByTestId("file-list-row")
  if ((await rows.count()) === 0) return
  const first = rows.first()
  const path = await first.locator("[title]").getAttribute("title")

  let captured: { commit?: string; path?: string } | null = null
  await page.route(
    (url) => url.pathname.endsWith("/difftool"),
    async (route) => {
      captured = route.request().postDataJSON()
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) })
    },
  )

  await first.dblclick()
  await expect.poll(() => captured).not.toBeNull()
  expect(captured?.path).toBe(path)
  expect(captured?.commit).toMatch(/^[0-9a-f]{7,40}$/i)
})
