import { expect, test, type Page } from "@playwright/test"

// The Shiki-highlighted blob view (BottomPanel.tsx's BlobPane) is a
// progressive enhancement layered on top of the always-working plain-text
// render: highlighting resolves asynchronously (dynamic import + tokenize)
// after the plain text already shows, so waiting for a coloured token span
// is the correct "highlighting actually happened" signal here, not a fixed
// delay (see docs/agents/memories/verify-loop.md — no waitForTimeout in
// specs). Ground truth for the "text didn't change" assertion comes from a
// direct, read-only GET against the same shared engine (see
// docs/agents/memories/e2e-shared-engine-serial.md — the suite runs serially
// against one engine with one open repository; this only reads, never
// switches repositories or mutates state) rather than the on-disk working
// tree, so the assertion can't be broken by an unrelated local edit to the
// same file and never races the UI's own fetch.
const ENGINE_URL = "http://127.0.0.1:7733"

async function openFileTreeForPowergitCommit(page: Page) {
  await page.goto("/")
  await expect(page.getByTestId("grid-row").first()).toBeVisible()
  // The newest graph row may be an upstream GE tip without frontend/; File
  // Tree assertions need the actual checked-out (powergit) commit, same as
  // file-tree.spec.ts.
  await page.locator('[data-testid="tree-row"][data-label="powergit"]').first().click()
  await page.getByRole("tab", { name: "File Tree" }).click()
}

test("blob pane highlights a TypeScript file without altering its text", async ({ page }) => {
  await openFileTreeForPowergitCommit(page)
  const tree = page.getByTestId("commit-file-tree")

  await tree.locator('[data-path="frontend"]').click()
  await expect(tree.locator('[data-path="frontend/src"]')).toBeVisible()
  await tree.locator('[data-path="frontend/src"]').click()
  await expect(tree.locator('[data-path="frontend/src/graph"]')).toBeVisible()
  await tree.locator('[data-path="frontend/src/graph"]').click()
  const fileRow = tree.locator('[data-path="frontend/src/graph/layout.ts"]')
  await expect(fileRow).toBeVisible()
  await fileRow.click()

  const blob = page.getByTestId("blob-pane")
  await expect(blob).toContainText("export")

  // Shiki wraps each token in its own <span style="color:...">; waiting for
  // one is the real "highlighting applied" signal (vs. plain preformatted
  // text, which has no child elements at all).
  const tokenSpans = blob.locator("pre code span[style*='color']")
  await expect(tokenSpans.first()).toBeVisible()

  // Ground truth: ask the engine directly for the exact same commit + path
  // the UI is showing, rather than trusting timing or the working tree.
  const commitId = await page.locator(".grid-row.selected [data-testid='sha-cell']").getAttribute("title")
  expect(commitId).toMatch(/^[0-9a-f]{40}$/)
  const res = await page.request.get(
    `${ENGINE_URL}/commits/${commitId}/blob?path=${encodeURIComponent("frontend/src/graph/layout.ts")}`,
  )
  expect(res.ok()).toBe(true)
  const groundTruth = (await res.json()) as { text: string }

  // The highlighted markup must round-trip to the exact original text: no
  // characters added, removed, or substituted by tokenizing/escaping.
  await expect.poll(() => blob.textContent()).toBe(groundTruth.text)
})

test("blob pane still renders a file with no recognised extension as plain text", async ({ page }) => {
  await openFileTreeForPowergitCommit(page)
  const tree = page.getByTestId("commit-file-tree")

  // ".gitignore" has no extension Shiki maps to a grammar (its only "." is
  // the leading one), so this exercises the plain-text fallback path.
  const fileRow = tree.locator('[data-path=".gitignore"]')
  await expect(fileRow).toBeVisible()
  await fileRow.click()

  const blob = page.getByTestId("blob-pane")
  await expect(blob).toContainText("visual studio")
  // Plain-text fallback renders a single text node — no highlighted spans.
  await expect(blob.locator("[style*='color']")).toHaveCount(0)
})
