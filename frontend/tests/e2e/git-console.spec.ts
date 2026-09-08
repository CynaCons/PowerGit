import { expect, test } from "@playwright/test"

import { commit, currentRepoPath, git, makeRepo, openRepoOnEngine, removeRepo, write } from "../repoFixture"

// v0.15.1, the Git console the owner picked out of the design review ("B + D"):
// a permanent dock line at the very bottom showing the last git command, a
// panel with the rolling log behind it, and — only on failure — a card in the
// bottom-right corner.
//
// The fixture is main and topic diverged from a shared base, so `git merge
// --ff-only topic` is a command git genuinely refuses. That is the failure
// the card has to catch, with the command and git's own words in it.

test.describe("git console", () => {
  let repoDir: string
  let previousRepo: string | null = null

  test.beforeEach(async () => {
    previousRepo ??= await currentRepoPath()
    repoDir = makeRepo("pg-console-")
    git(repoDir, "branch", "topic")
    write(repoDir, "a.txt", "main side\n")
    commit(repoDir, "main change")
    git(repoDir, "checkout", "-q", "topic")
    write(repoDir, "a.txt", "topic side\n")
    commit(repoDir, "topic change")
    git(repoDir, "checkout", "-q", "main")
    await openRepoOnEngine(repoDir)
  })

  test.afterEach(async () => {
    await openRepoOnEngine(previousRepo ?? process.cwd())
    await removeRepo(repoDir)
  })

  test("the dock line names the last git command and the panel stays out of the way", async ({ page }) => {
    await page.goto("/")
    await expect(page.getByTestId("grid-row").first()).toBeVisible()

    // Resting state: the dock line is there, the panel is not, and the graph
    // still has the room it had.
    const dock = page.getByTestId("git-console-dock")
    await expect(dock).toBeVisible()
    await expect(page.getByTestId("git-console-panel")).toHaveCount(0)
    await expect(page.getByTestId("git-console")).toHaveAttribute("data-open", "false")

    // Loading the repository ran git; the dock line says which command last.
    await expect(page.getByTestId("git-console-last")).toHaveText(/^git \S/)
    await expect(page.getByTestId("git-console-count")).toHaveText(/^[1-9]\d*$/)

    // The status bar is above it and still fully visible: the dock line must
    // not cover it.
    const status = await page.getByTestId("engine-status").boundingBox()
    const line = await dock.boundingBox()
    expect(status).not.toBeNull()
    expect(line).not.toBeNull()
    expect(line!.y).toBeGreaterThanOrEqual(status!.y + status!.height - 1)
    expect(line!.height).toBeLessThanOrEqual(28)
  })

  test("the console lists the command that ran, with its output", async ({ page }) => {
    await page.goto("/")
    await expect(page.getByTestId("grid-row").first()).toBeVisible()

    await page.getByTestId("git-console-dock").click()
    const panel = page.getByTestId("git-console-panel")
    await expect(panel).toBeVisible()

    // A refresh is a deterministic burst of reads, so `git log` is fresh in
    // the buffer rather than something the 50-entry cap may have dropped.
    await page.getByTestId("refresh-button").click()

    await page.getByTestId("git-console-filter").fill("log --date-order")
    const entry = page.getByTestId("git-console-entry").last()
    await expect(entry.getByTestId("git-console-command")).toContainText("log --date-order")
    await expect(entry).toHaveAttribute("data-exit", "0")
    // Its output is git's own: the commits this fixture made.
    await expect(entry.getByTestId("git-console-output")).toContainText("topic change")

    // The filter is a filter: a term nothing matches empties the list.
    await page.getByTestId("git-console-filter").fill("zzz-no-such-command")
    await expect(page.getByTestId("git-console-entry")).toHaveCount(0)
    await expect(page.getByTestId("git-console-empty")).toBeVisible()

    // Ctrl+` closes it again, and the choice persists across a reload.
    await page.keyboard.press("Control+`")
    await expect(panel).toHaveCount(0)
    await page.reload()
    await expect(page.getByTestId("grid-row").first()).toBeVisible()
    await expect(page.getByTestId("git-console-panel")).toHaveCount(0)
    await page.keyboard.press("Control+`")
    await expect(page.getByTestId("git-console-panel")).toBeVisible()
  })

  test("a failed git command raises a card in the corner, and only a failure does", async ({ page }) => {
    await page.goto("/")
    await expect(page.getByTestId("grid-row").first()).toBeVisible()

    // Reads succeed, so nothing has popped up.
    await expect(page.getByTestId("git-failure-card")).toHaveCount(0)

    // main and topic diverged: git refuses a fast-forward-only merge.
    await page.getByTestId("merge-button").click()
    await expect(page.getByTestId("merge-branch")).toBeVisible()
    await page.getByTestId("merge-branch").selectOption("topic")
    await page.getByTestId("merge-ff-only").click()
    await page.getByTestId("merge-confirm").click()

    const card = page.getByTestId("git-failure-card")
    await expect(card).toBeVisible()
    await expect(card.getByTestId("git-failure-command")).toContainText("git merge --ff-only")
    await expect(card.getByTestId("git-failure-output")).toContainText(/fast[- ]forward/i)

    // Pinned, it survives the auto-dismiss and is still there once the
    // dialog is out of the way.
    await card.getByTestId("git-failure-pin").click()
    await expect(card).toHaveAttribute("data-pinned", "true")
    await page.getByTestId("merge-dialog").getByRole("button", { name: "Cancel" }).click()
    await expect(page.getByTestId("merge-dialog")).toHaveCount(0)
    await expect(card).toBeVisible()

    // Its link opens the console on the same entry.
    await card.getByTestId("git-failure-open").click()
    await expect(page.getByTestId("git-console-panel")).toBeVisible()
    await expect(card).toHaveCount(0)
    await page.getByTestId("git-console-filter").fill("merge --ff-only")
    const entry = page.getByTestId("git-console-entry").last()
    await expect(entry).toHaveAttribute("data-failed", "true")
    await expect(entry.getByTestId("git-console-output")).toContainText(/fast[- ]forward/i)
    // The dock line's badge counts the failure in its own colour.
    await expect(page.getByTestId("git-console-count")).not.toHaveAttribute("data-failures", "0")
  })

  test("an unpinned failure card takes itself away after about five seconds", async ({ page }) => {
    await page.goto("/")
    await expect(page.getByTestId("grid-row").first()).toBeVisible()

    await page.getByTestId("merge-button").click()
    await expect(page.getByTestId("merge-branch")).toBeVisible()
    await page.getByTestId("merge-branch").selectOption("topic")
    await page.getByTestId("merge-ff-only").click()
    await page.getByTestId("merge-confirm").click()

    const card = page.getByTestId("git-failure-card")
    await expect(card).toBeVisible()
    // Nobody touches it: FAILURE_CARD_MS is 5 s, so it is gone well inside 9.
    await expect(card).toHaveCount(0, { timeout: 9_000 })

    // Gone from the corner, still in the console — successes are silent and
    // failures are never lost. (Hotkeys are muted while a dialog is up, so
    // the merge dialog goes away first.)
    await page.getByTestId("merge-dialog").getByRole("button", { name: "Cancel" }).click()
    await expect(page.getByTestId("merge-dialog")).toHaveCount(0)
    await page.keyboard.press("Control+`")
    await page.getByTestId("git-console-filter").fill("merge --ff-only")
    await expect(page.getByTestId("git-console-entry").last()).toHaveAttribute("data-failed", "true")
  })
})
