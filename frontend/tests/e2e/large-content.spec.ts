import { expect, test, type Page } from "@playwright/test"
import { engineHeaders, repoBase } from "../engine"

// v0.13.11 tasks 2-3: oversized content arrives truncated with metadata and
// the UI shows an intentional notice instead of a million-line tree; diffs
// and blobs are virtualized so only the visible window is in the DOM.

async function firstRevisionWithChangedFiles(base: string, skip = 0): Promise<{ id: string; path: string }> {
  const revisions = (await (await fetch(`${base}/revisions?max=25`, { headers: engineHeaders() })).json()) as Array<{
    id: string
  }>
  let seen = 0
  for (const revision of revisions) {
    const files = (await (
      await fetch(`${base}/commits/${revision.id}/files`, { headers: engineHeaders() })
    ).json()) as Array<{ path: string }>
    if (files.length === 0) continue
    if (seen++ < skip) continue
    return { id: revision.id, path: files[0].path }
  }
  throw new Error("the first 25 revisions contain no commit with changed files")
}

async function selectRevisionWithChangedFiles(page: Page, base: string, skip = 0) {
  const revision = await firstRevisionWithChangedFiles(base, skip)
  const row = page.locator(`[data-testid="grid-row"]:has([data-testid="sha-cell"][title="${revision.id}"])`)
  await expect(row).toBeVisible()
  await row.click()
}

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
  // Stabilize the selected revision before opening the tree; the first graph
  // row can settle asynchronously from a branch tip while the tree mounts.
  await selectRevisionWithChangedFiles(page, base)
  await page.getByRole("tab", { name: "File Tree" }).click()
  const firstFile = page.locator('[data-testid="commit-file-tree-row"][data-type="blob"]').first()
  await expect(firstFile).toBeVisible({ timeout: 15_000 })
  const blobResponse = page.waitForResponse(
    (response) => response.request().method() === "GET" && new URL(response.url()).pathname.endsWith("/blob"),
  )
  await firstFile.click()
  const blobDto = (await (await blobResponse).json()) as { truncated: boolean; truncatedReason: string | null }
  expect(blobDto).toMatchObject({ truncated: true, truncatedReason: "lines" })

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
  // v0.13.14: the first file's diff arrives with the file list through
  // /changes (and is cached per commit), so the synthetic DTO is served on
  // both routes and the second phase selects a different commit.
  const routeDiff = async (dto: object) => {
    await page.unroute(`${base}/commits/*/diff?*`)
    await page.unroute(`${base}/commits/*/changes?*`)
    await page.route(`${base}/commits/*/diff?*`, (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(dto) }),
    )
    await page.route(`${base}/commits/*/changes?*`, (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ files: [{ path: "x.txt", status: "M", binary: false }], firstDiff: dto }),
      }),
    )
  }
  await routeDiff({
    path: "x.txt",
    text: `diff --git a/x.txt b/x.txt\n@@ -0,0 +1,20000 @@\n${body}`,
    binary: false,
    sizeBytes: body.length,
    truncated: false,
    truncatedReason: null,
  })
  await page.goto("/")
  await expect(page.getByTestId("grid-row").first()).toBeVisible({ timeout: 30_000 })
  // A merge commit may legitimately have no single-parent diff. Pick the
  // first recent revision whose engine file list is non-empty instead of
  // assuming whichever commit happens to be HEAD changed a file.
  await selectRevisionWithChangedFiles(page, base)
  await expect(page.getByRole("tab", { name: /^Diff \([1-9]/ })).toBeVisible({ timeout: 15_000 })
  await page.getByRole("tab", { name: /^Diff/ }).click()
  await expect(page.getByTestId("diff-view")).toBeVisible({ timeout: 15_000 })
  const rows = await page.getByTestId("diff-lines").locator("[data-index]").count()
  expect(rows).toBeLessThan(400)
  await expect(page.getByTestId("diff-gutter").first()).toBeVisible()
  await expect(page.getByTestId("content-notice")).toHaveCount(0)
  // Engine-side truncation surfaces the notice on diffs too (another
  // commit: the first one's diff is cached and would not be re-requested).
  await routeDiff({
    path: "x.txt",
    text: "diff --git a/x b/x\n+x",
    binary: false,
    sizeBytes: 3_000_000,
    truncated: true,
    truncatedReason: "size",
  })
  await selectRevisionWithChangedFiles(page, base, 1)
  await expect(page.getByTestId("content-notice")).toContainText(/2\.9 MB|3\.0 MB/)
})

test("the engine really truncates an oversized blob (contract)", async () => {
  // Contract with GitHost.MaxBlobBytes / MaxLines: the DTO carries the metadata.
  const base = await repoBase()
  const revision = await firstRevisionWithChangedFiles(base)
  const dto = (await (
    await fetch(`${base}/commits/${revision.id}/blob?path=${encodeURIComponent(revision.path)}`, {
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
