import { expect, test } from "@playwright/test"

// Regression: git ls-tree with a pathspec used to emit repo-root-relative
// names, so the UI built child paths like "src/src/components" and blob
// lookups failed with "path does not exist in <sha>". These selectors use
// exact data-paths written against the normalized (directory-relative) DTO.
test("file tree expands nested directories and opens files at depth >= 2", async ({ page }) => {
  await page.goto("/")
  await expect(page.getByTestId("grid-row").first()).toBeVisible()
  await page.getByRole("tab", { name: "File Tree" }).click()
  const tree = page.getByTestId("commit-file-tree")

  await tree.locator('[data-path="frontend"]').click()
  const src = tree.locator('[data-path="frontend/src"]')
  await expect(src).toBeVisible()

  await src.click()
  const graphDir = tree.locator('[data-path="frontend/src/graph"]')
  await expect(graphDir).toBeVisible()

  await graphDir.click()
  const fileRow = tree.locator('[data-path="frontend/src/graph/layout.ts"]')
  await expect(fileRow).toBeVisible()
  await fileRow.click()

  const blob = page.getByTestId("blob-pane")
  await expect(blob).not.toContainText("does not exist")
  await expect(blob).toContainText("export")
})

test("file rows carry full paths and types", async ({ page }) => {
  await page.goto("/")
  await expect(page.getByTestId("grid-row").first()).toBeVisible()
  await page.getByRole("tab", { name: "File Tree" }).click()
  const tree = page.getByTestId("commit-file-tree")
  const frontend = tree.locator('[data-path="frontend"]')
  await expect(frontend).toBeVisible()
  await expect(frontend).toHaveAttribute("data-type", "tree")
})
