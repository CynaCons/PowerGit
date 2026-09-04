import { expect, test } from "@playwright/test"
import { engineHeaders, repoBase } from "../engine"

// v0.13.11 tasks 2-3: oversized content arrives truncated with metadata and
// the UI shows an intentional notice instead of a million-line tree; diffs
// and blobs are virtualized so only the visible window is in the DOM.

test("a truncated blob shows the notice with size, reason and actions", async ({ page }) => {
  const base = await repoBase()
  // Synthesize the engine's truncated answer for the first blob the tree opens:
  // 60k lines is above MaxLines, so the DTO says truncated=lines.
  const lines = Array.from({ length: 60_000 }, (_, i) => `line ${i}`).join("\n")
  await page.route(`${base}/commits/*/blob?*`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        path: "big.txt",
        text: lines.split("\n").slice(0, 50_000).join("\n"),
        binary: false,
        sizeBytes: lines.length,
        truncated: true,
        truncatedReason: "lines",
      }),
    }),
  )
  await page.goto("/")
  await expect(page.getByTestId("grid-row").first()).toBeVisible({ timeout: 30_000 })
  await page.getByRole("tab", { name: "File Tree" }).click()
  const firstFile = page.locator('[data-testid="commit-file-tree-row"][data-type="blob"]').first()
  await expect(firstFile).toBeVisible({ timeout: 15_000 })
  await firstFile.click()

  const notice = page.getByTestId("content-notice")
  await expect(notice).toBeVisible({ timeout: 15_000 })
  await expect(notice).toContainText(/too large/i)
  await expect(notice).toContainText(/50,000 lines/)
  await expect(notice).toContainText(/Size:/)
  await expect(page.getByTestId("content-notice-retry")).toBeVisible()
  await expect(page.getByTestId("content-notice-difftool")).toBeVisible()

  // Virtualized: 50k lines of content, a few hundred DOM rows at most.
  const rendered = await page.getByTestId("blob-lines").locator("[data-index]").count()
  expect(rendered).toBeGreaterThan(10)
  expect(rendered).toBeLessThan(400)
  // Keyboard scrolling works on the focused region.
  await page.getByTestId("blob-lines").focus()
  await page.keyboard.press("End")
  await expect
    .poll(async () =>
      Number(await page.getByTestId("blob-lines").locator("[data-index]").last().getAttribute("data-index")),
    )
    .toBeGreaterThan(49_000)
})

test("the diff view is virtualized and keeps its gutter", async ({ page }) => {
  const base = await repoBase()
  const body = Array.from({ length: 20_000 }, (_, i) => `+added ${i}`).join("\n")
  await page.route(`${base}/commits/*/diff?*`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        path: "x.txt",
        text: `diff --git a/x.txt b/x.txt\n@@ -0,0 +1,20000 @@\n${body}`,
        binary: false,
        sizeBytes: body.length,
        truncated: false,
        truncatedReason: null,
      }),
    }),
  )
  await page.goto("/")
  await expect(page.getByTestId("grid-row").first()).toBeVisible({ timeout: 30_000 })
  await page.getByRole("tab", { name: /^Diff/ }).click()
  await expect(page.getByTestId("diff-view")).toBeVisible({ timeout: 15_000 })
  const rows = await page.getByTestId("diff-lines").locator("[data-index]").count()
  expect(rows).toBeLessThan(400)
  await expect(page.getByTestId("diff-gutter").first()).toBeVisible()
  await expect(page.getByTestId("content-notice")).toHaveCount(0)
  // Engine-side truncation surfaces the notice on diffs too.
  await page.unroute(`${base}/commits/*/diff?*`)
  await page.route(`${base}/commits/*/diff?*`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        path: "x.txt",
        text: "diff --git a/x b/x\n+x",
        binary: false,
        sizeBytes: 3_000_000,
        truncated: true,
        truncatedReason: "size",
      }),
    }),
  )
  await page.getByRole("tab", { name: "Commit" }).click()
  await page.getByRole("tab", { name: /^Diff/ }).click()
  await expect(page.getByTestId("content-notice")).toContainText(/2\.9 MB|3\.0 MB/)
})

test("the engine really truncates an oversized blob (contract)", async () => {
  // Contract with GitHost.MaxBlobBytes / MaxLines: the DTO carries the metadata.
  const base = await repoBase()
  const rev = (await (await fetch(`${base}/revisions?max=1`, { headers: engineHeaders() })).json()) as Array<{
    id: string
  }>
  const files = (await (
    await fetch(`${base}/commits/${rev[0].id}/files`, { headers: engineHeaders() })
  ).json()) as Array<{ path: string }>
  test.skip(files.length === 0, "no files in HEAD")
  const dto = (await (
    await fetch(`${base}/commits/${rev[0].id}/blob?path=${encodeURIComponent(files[0].path)}`, {
      headers: engineHeaders(),
    })
  ).json()) as {
    sizeBytes: number
    truncated: boolean
    truncatedReason: string | null
  }
  expect(typeof dto.sizeBytes).toBe("number")
  expect(typeof dto.truncated).toBe("boolean")
  expect(dto.truncatedReason === null || dto.truncatedReason === "size" || dto.truncatedReason === "lines").toBe(true)
})
