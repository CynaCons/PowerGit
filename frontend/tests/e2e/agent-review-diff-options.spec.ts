import { expect, test, type Page } from "@playwright/test"
import { ENGINE_URL, engineHeaders } from "../engine"
import { commit, currentRepoPath, makeRepo, openRepoOnEngine, write } from "../repoFixture"

// v0.21.8, owner: "in the agents review panel, in the diff, we need to
// reintegrate our options to change how many lines of context we see, or if
// you want to see the full file ... the highlighting ... and also line
// wrapping, because at the moment lines are going beyond". The review
// screen gets the bottom diff's options bar: context lines and Full file
// (the extra lines come from the file), Wrap lines, and syntax colours.

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${ENGINE_URL}${path}`, {
    ...init,
    headers: engineHeaders({ "Content-Type": "application/json" }),
  })
  if (!res.ok) throw new Error(`${path}: http ${res.status} ${await res.text()}`)
  const text = await res.text()
  return (text ? JSON.parse(text) : null) as T
}

const LONG = `  const message = "${"a very long string that does not fit on one line of the review ".repeat(4)}"`
const file = (changed: boolean) =>
  Array.from({ length: 40 }, (_, i) => {
    const n = i + 1
    if (changed && n === 5) return `const five = ${n} // changed`
    if (changed && n === 30) return LONG
    return `const line${n} = ${n}`
  }).join("\n") + "\n"

async function choose(page: Page, label: string) {
  await page.getByTestId("diff-options-bar").hover()
  await page.getByTestId("diff-context-select").click()
  await page.getByRole("option", { name: label, exact: true }).click()
}

test.describe("agent review diff options", () => {
  let previous: string | null = null
  test.beforeAll(async () => {
    previous = await currentRepoPath()
  })
  test.afterAll(async () => {
    await openRepoOnEngine(previous ?? process.cwd())
  })

  test("context lines, full file, wrap and colours on the review screen", async ({ page }) => {
    test.setTimeout(90_000)
    const dir = makeRepo("pg-review-options-")
    write(dir, "t.ts", file(false))
    commit(dir, "forty lines")
    write(dir, "t.ts", file(true))
    const { id: repoId } = await api<{ id: string }>("/repos/open", {
      method: "POST",
      body: JSON.stringify({ path: dir }),
    })
    await api(`/repos/${repoId}/agent-reviews`, {
      method: "POST",
      body: JSON.stringify({
        mode: "notify",
        title: "Options review",
        why: "",
        agent: "options-test",
        worktree: true,
        files: [{ path: "t.ts", status: "M" }],
      }),
    })
    await page.goto(`/?repo=${repoId}`)
    await expect(page.getByTestId("status-branch")).toHaveText("main", { timeout: 30_000 })
    await page.getByTestId("agent-reviews-button").click()
    await page.getByTestId("agent-review-row").filter({ hasText: "Options review" }).click()

    const diff = page.getByTestId("round-diff")
    const line = (key: string) => diff.locator(`[data-testid="round-line"][data-key="${key}"]`)
    await expect(diff).toHaveAttribute("data-source", "file")
    // Three lines of context, as captured.
    await expect(line("+8")).toBeVisible()
    await expect(line("+9")).toHaveCount(0)
    // Syntax colours.
    await expect(diff.locator(".diff-token").first()).toBeVisible()

    await choose(page, "10 lines")
    await expect(line("+15")).toBeVisible()
    await expect(line("+16")).toHaveCount(0)
    await expect(line("+20")).toBeVisible()
    await expect(page.getByTestId("round-gap")).toHaveCount(0)

    await choose(page, "0 lines")
    await expect(line("+4")).toHaveCount(0)
    await expect(line("+5")).toHaveCount(1)

    await choose(page, "Full file")
    // Lines 9 to 26 and 34 to 40; line 1 is too short a stretch and joins the first card.
    await expect(page.getByTestId("round-gap")).toHaveCount(2)
    for (const n of [1, 12, 17, 40]) await expect(line(`+${n}`)).toHaveCount(1)
    await expect(diff.locator('[data-testid="round-line"]')).toHaveCount(42)

    // Wrap lines: the long line stays inside the pane.
    const scroll = page.getByTestId("round-diff-scroll")
    const longRow = line("+30").getByTestId("round-text")
    const wrapToggle = page.getByTestId("diff-wrap-toggle")
    await page.getByTestId("diff-options-bar").hover()
    if ((await wrapToggle.getAttribute("aria-pressed")) === "true") await wrapToggle.click()
    await expect(diff).not.toHaveAttribute("data-wrap", "true")
    const paneRight = async () => (await scroll.boundingBox())!.x + (await scroll.boundingBox())!.width
    expect((await longRow.boundingBox())!.x + (await longRow.boundingBox())!.width).toBeGreaterThan(await paneRight())
    await wrapToggle.click()
    await expect(diff).toHaveAttribute("data-wrap", "true")
    await expect
      .poll(async () => (await longRow.boundingBox())!.x + (await longRow.boundingBox())!.width)
      .toBeLessThanOrEqual(await paneRight())
    expect((await longRow.boundingBox())!.height).toBeGreaterThan(18 * 1.5)

    // v0.21.9, owner: "I don't like the fact that the settings for the line
    // wrap is shared with the other view." The review keeps its own switch
    // and context, remembered across a reload; the other views' wrap stays.
    const stored = () =>
      page.evaluate(() => ({
        shared: window.localStorage.getItem("pg.diffWrap"),
        review: JSON.parse(window.localStorage.getItem("pg.reviewDiff") ?? "null"),
      }))
    const sharedBefore = (await stored()).shared
    expect(await stored()).toEqual({ shared: sharedBefore, review: { context: 0, full: true, wrap: true } })
    await page.reload()
    await page.getByTestId("agent-reviews-button").click()
    await page.getByTestId("agent-review-row").filter({ hasText: "Options review" }).click()
    await expect(diff).toHaveAttribute("data-wrap", "true")
    await expect(page.getByTestId("round-gap")).toHaveCount(2)
    await page.getByTestId("diff-options-bar").hover()
    await wrapToggle.click()
    await expect(diff).not.toHaveAttribute("data-wrap", "true")
    expect(await stored()).toEqual({ shared: sharedBefore, review: { context: 0, full: true, wrap: false } })
  })

  test("the review's wrap does not follow the other views' switch", async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem("pg.diffWrap", "1")
      window.localStorage.removeItem("pg.reviewDiff")
    })
    await page.goto("/")
    await expect(page.getByTestId("status-branch")).not.toBeEmpty({ timeout: 30_000 })
    const dir = makeRepo("pg-review-wrap-")
    write(dir, "t.ts", file(false))
    commit(dir, "forty lines")
    write(dir, "t.ts", file(true))
    const { id: repoId } = await api<{ id: string }>("/repos/open", {
      method: "POST",
      body: JSON.stringify({ path: dir }),
    })
    await api(`/repos/${repoId}/agent-reviews`, {
      method: "POST",
      body: JSON.stringify({
        mode: "notify",
        title: "Wrap review",
        why: "",
        agent: "options-test",
        worktree: true,
        files: [{ path: "t.ts", status: "M" }],
      }),
    })
    await page.goto(`/?repo=${repoId}`)
    await page.getByTestId("agent-reviews-button").click()
    await page.getByTestId("agent-review-row").filter({ hasText: "Wrap review" }).click()
    const diff = page.getByTestId("round-diff")
    // On by default here, and turning it off leaves the shared switch on.
    await expect(diff).toHaveAttribute("data-wrap", "true")
    await page.getByTestId("diff-options-bar").hover()
    await page.getByTestId("diff-wrap-toggle").click()
    await expect(diff).not.toHaveAttribute("data-wrap", "true")
    expect(await page.evaluate(() => window.localStorage.getItem("pg.diffWrap"))).toBe("1")

    // v0.21.9, owner: "line by line check marks, either approve or discard,
    // just like the normal human review in the diff". Every changed line
    // shows the human review's mark; a click accepts, rejects, clears.
    const row = diff.locator('[data-testid="round-line"][data-key="+5"]')
    const ring = () =>
      row
        .locator(".diff-row-mark")
        .evaluate((el) => getComputedStyle(el, "::before").borderTopStyle + " " + getComputedStyle(el, "::after").content)
    await expect(row).toHaveClass(/diff-row-review-todo/)
    expect(await ring()).toBe("solid none")
    await expect(diff.locator('[data-testid="round-line"][data-key="+6"]')).not.toHaveClass(/diff-row-review/)
    const mark = row.getByTestId("round-mark")
    await mark.click()
    await expect(row).toHaveAttribute("data-mark", "ok")
    await expect(row).toHaveClass(/diff-row-review-ok/)
    await mark.click()
    await expect(row).toHaveAttribute("data-mark", "rejected")
    expect(await ring()).toBe('solid "×"')
    await mark.click()
    await expect(row).toHaveAttribute("data-mark", "")
    await expect(row).toHaveClass(/diff-row-review-todo/)
  })
})
