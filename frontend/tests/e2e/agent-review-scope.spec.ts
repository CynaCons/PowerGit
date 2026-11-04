import { basename } from "node:path"
import { expect, test } from "@playwright/test"
import { ENGINE_URL, engineHeaders } from "../engine"
import { commit, currentRepoPath, makeRepo, openRepoOnEngine, write } from "../repoFixture"

// v0.22.11, owner: "We're not showing the function. Usually I'm reviewing
// Python or C++ or C, and I don't see the function title ... here it's showing
// me the class, great, but I would like to see the class and the function. So
// if it's before the context that I see, I don't see it. And I would have to
// increase the context size just to see the function."

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${ENGINE_URL}${path}`, {
    ...init,
    headers: engineHeaders({ "Content-Type": "application/json" }),
  })
  if (!res.ok) throw new Error(`${path}: http ${res.status} ${await res.text()}`)
  const text = await res.text()
  return (text ? JSON.parse(text) : null) as T
}

// The function's first line sits further up than the three lines of context.
const body = (indent: string, changed: boolean) =>
  Array.from({ length: 12 }, (_, i) => `${indent}value${i} = ${i === 8 && changed ? 100 : i}`)
const python = (changed: boolean) =>
  ["class Greeter:", "    def greet(self, name):", ...body("        ", changed), ""].join("\n")
const cpp = (changed: boolean) =>
  ["class Greeter {", "  void greet(int count) {", ...body("    ", changed).map((l) => `${l};`), "  }", "};", ""].join(
    "\n",
  )
const c = (changed: boolean) =>
  ["static int", "greet(int count)", "{", ...body("    ", changed).map((l) => `${l};`), "}", ""].join("\n")

test.describe("agent review: the function above a change", () => {
  let previous: string | null = null
  test.beforeAll(async () => {
    previous = await currentRepoPath()
  })
  test.afterAll(async () => {
    await openRepoOnEngine(previous ?? process.cwd())
  })

  test("a card names the class and the function above its context", async ({ page }) => {
    const dir = makeRepo("pg-review-scope-")
    const files: Record<string, (changed: boolean) => string> = { "greet.py": python, "greet.cpp": cpp, "greet.c": c }
    for (const [path, content] of Object.entries(files)) write(dir, path, content(false))
    commit(dir, "greeters")
    for (const [path, content] of Object.entries(files)) write(dir, path, content(true))
    const { id: repoId } = await api<{ id: string }>("/repos/open", {
      method: "POST",
      body: JSON.stringify({ path: dir }),
    })
    await api(`/repos/${repoId}/agent-reviews`, {
      method: "POST",
      body: JSON.stringify({
        mode: "notify",
        title: "Scope review",
        why: "",
        agent: "scope-test",
        worktree: true,
        files: Object.keys(files).map((path) => ({ path, status: "M" })),
      }),
    })
    await page.goto(`/?repo=${repoId}`)
    await expect(page.getByTestId("status-branch")).toHaveText("main", { timeout: 30_000 })
    await page.getByTestId("agent-reviews-button").click()
    await page
      .getByTestId("agent-review-row")
      .filter({ hasText: "Scope review" })
      .filter({ hasText: basename(dir) })
      .click()

    const expected: Record<string, string> = {
      "greet.py": "class Greeter › def greet(self, name)",
      "greet.cpp": "class Greeter › void greet(int count)",
      "greet.c": "greet(int count)",
    }
    for (const [path, title] of Object.entries(expected)) {
      await page.getByText(path, { exact: true }).first().click()
      const diff = page.locator(`[data-testid="round-diff"][data-path="${path}"]`)
      await expect(diff).toHaveAttribute("data-source", "file")
      // Three lines of context: the function's own line is not on the card.
      await expect(diff.getByTestId("round-text").filter({ hasText: "greet(" })).toHaveCount(0)
      await expect(diff.getByTestId("round-change")).toContainText(title)
    }
  })
})
