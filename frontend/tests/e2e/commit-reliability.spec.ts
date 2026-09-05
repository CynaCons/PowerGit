import { expect, test, type Page } from "@playwright/test"
import { execFileSync } from "node:child_process"
import { mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { ENGINE_URL, engineHeaders } from "../engine"

let originalRoot: string | undefined
let sessions: string[] = []
test.beforeEach(async () => {
  sessions = []
  const res = await fetch(`${ENGINE_URL}/repos/current`, { headers: engineHeaders() })
  originalRoot = res.ok ? ((await res.json()) as { root: string }).root : undefined
})
test.afterEach(async ({ page }) => {
  await page.close()
  for (const id of sessions) await fetch(`${ENGINE_URL}/repos/${id}`, { method: "DELETE", headers: engineHeaders() })
  if (originalRoot)
    await fetch(`${ENGINE_URL}/repos/open`, {
      method: "POST",
      headers: engineHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ path: originalRoot }),
    })
})

async function fixture(page: Page, dirty = true) {
  const dir = mkdtempSync(join(tmpdir(), "pg-commit-reliability-"))
  const git = (...args: string[]) =>
    execFileSync("git", ["-C", dir, "-c", "user.name=Test", "-c", "user.email=test@example.com", ...args], {
      encoding: "utf8",
      stdio: "pipe",
    }).trim()
  git("init", "-q", "-b", "main")
  git("config", "user.name", "Test")
  git("config", "user.email", "test@example.com")
  for (let i = 1; i <= 3; i++) {
    writeFileSync(join(dir, "file.txt"), `Revision ${i}\n`)
    git("add", ".")
    git("commit", "-qm", `Commit ${i}`)
  }
  if (dirty) writeFileSync(join(dir, "file.txt"), "Ready to commit\n")
  const res = await fetch(`${ENGINE_URL}/repos/open`, {
    method: "POST",
    headers: engineHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ path: dir }),
  })
  expect(res.ok).toBeTruthy()
  const { id } = (await res.json()) as { id: string }
  sessions.push(id)
  await page.goto(`/?repo=${id}`)
  await expect(page.getByTestId("status-branch")).toHaveText("main")
  return { git, id, dir }
}

async function open(page: Page, amend = false) {
  if (amend) {
    await page.getByRole("button", { name: "Commit options", exact: true }).click()
    await page.getByText("Amend last commit", { exact: false }).click()
  } else await page.keyboard.press("Control+Space")
  await expect(page.getByTestId("commit-message-input")).toBeVisible()
}

// Audit finding, 2026-09-05: "Commit controls fall outside the window at 150% zoom"
for (const zoom of [1, 1.5, 2]) {
  test(`commit actions stay reachable at ${zoom * 100}% zoom`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.addInitScript((z) => localStorage.setItem("pg.zoom", String(z)), zoom)
    await fixture(page)
    await open(page)
    await page.getByTestId("stage-all").click()
    await page.getByTestId("commit-message-input").fill("Visible commit")
    const submit = page.getByTestId("commit-submit")
    await expect(submit).toBeEnabled()
    await page.locator(".MuiDialog-paper").evaluate(async (el) => {
      await Promise.all(el.getAnimations({ subtree: true }).map((a) => a.finished))
    })
    const box = (await submit.boundingBox())!
    expect(box.y).toBeGreaterThanOrEqual(0)
    expect(box.y + box.height).toBeLessThanOrEqual(800)
    expect(box.x + box.width).toBeLessThanOrEqual(1280)
    await submit.click({ trial: true })
    // Read the composited button pixels: both its coloured face and label must paint.
    const png = (await page.screenshot({ clip: box, animations: "disabled" })).toString("base64")
    const colours = await page.evaluate(async (b64) => {
      const image = new Image()
      image.src = `data:image/png;base64,${b64}`
      await image.decode()
      const canvas = document.createElement("canvas")
      canvas.width = image.width
      canvas.height = image.height
      const ctx = canvas.getContext("2d")!
      ctx.drawImage(image, 0, 0)
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data
      let blue = 0
      let white = 0
      for (let i = 0; i < data.length; i += 4) {
        if (data[i + 2] > data[i] + 30) blue++
        if (data[i] > 230 && data[i + 1] > 230 && data[i + 2] > 230) white++
      }
      return { blue, white }
    }, png)
    expect(colours.blue).toBeGreaterThan(100)
    expect(colours.white).toBeGreaterThan(15)
  })
}

test("failed commit explains the rejection and preserves the draft for retry", async ({ page }) => {
  // Audit finding: "A failed commit gives no visible error"
  const errors: string[] = []
  page.on("pageerror", (e) => errors.push(e.message))
  const { git } = await fixture(page)
  await open(page)
  await page.getByTestId("stage-all").click()
  await page.getByTestId("commit-message-input").fill("Retry this draft")
  await page.route("**/repos/*/commit", (route) =>
    route.fulfill({
      status: 400,
      contentType: "application/json",
      body: JSON.stringify({ error: "Pre-commit hook rejected this commit" }),
    }),
  )
  await page.getByTestId("commit-submit").click()
  await expect(page.getByRole("alert")).toContainText("Pre-commit hook rejected this commit")
  await expect(page.getByTestId("commit-message-input")).toHaveValue("Retry this draft")
  expect(git("diff", "--cached", "--name-only")).toBe("file.txt")
  await page.unroute("**/repos/*/commit")
  await page.getByTestId("commit-submit").click()
  await expect(page.getByTestId("commit-overlay")).not.toBeVisible()
  expect(git("log", "-1", "--format=%s")).toBe("Retry this draft")
  await open(page)
  await expect(page.getByTestId("commit-message-input")).toHaveValue("")
  expect(errors).toEqual([])
})

test("pending commit prevents duplicate submission and dismissal", async ({ page }) => {
  const { git } = await fixture(page)
  await open(page)
  await page.getByTestId("stage-all").click()
  await page.getByTestId("commit-message-input").fill("Only once")
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  let requests = 0
  await page.route("**/repos/*/commit", async (route) => {
    requests++
    await gate
    await route.continue()
  })
  try {
    await page.getByTestId("commit-submit").dblclick()
    await expect(page.getByTestId("commit-submit")).toHaveText("Committing…")
    await expect(page.getByTestId("commit-submit")).toBeDisabled()
    await expect(page.getByTestId("commit-message-input")).toBeDisabled()
    await page.keyboard.press("Escape")
    await expect(page.getByTestId("commit-overlay")).toBeVisible()
    await expect.poll(() => requests).toBe(1)
  } finally {
    release()
  }
  await expect(page.getByTestId("commit-overlay")).not.toBeVisible()
  expect(git("rev-list", "--count", "HEAD")).toBe("4")
})

test("drafts follow the repository when switching in the same window", async ({ page }) => {
  const first = await fixture(page)
  const second = await fixture(page)
  async function switchTo(dir: string) {
    page.once("dialog", (dialog) => dialog.accept(dir))
    await page.getByTestId("open-repo-button").click()
    await expect(page.getByTestId("status-branch")).toHaveText("main")
    await expect(page.getByTestId("grid-row").nth(2)).toBeVisible()
  }
  await open(page)
  await page.getByTestId("commit-message-input").fill("Second repository draft")
  await page.keyboard.press("Escape")
  await switchTo(first.dir)
  await open(page)
  await expect(page.getByTestId("commit-message-input")).toHaveValue("")
  await page.getByTestId("commit-message-input").fill("First repository draft")
  await page.keyboard.press("Escape")
  await switchTo(second.dir)
  await open(page)
  await expect(page.getByTestId("commit-message-input")).toHaveValue("Second repository draft")
})

test("ordinary commit still requires staged files and a nonempty message", async ({ page }) => {
  await fixture(page, false)
  await open(page)
  await page.getByTestId("commit-message-input").fill("Cannot commit an empty index")
  await expect(page.getByTestId("commit-submit")).toBeDisabled()
  await page.keyboard.press("Escape")
  await open(page, true)
  await page.getByTestId("commit-message-input").fill("   ")
  await expect(page.getByTestId("commit-submit")).toBeDisabled()
})

test("message-only amend works with nothing staged", async ({ page }) => {
  // Audit finding: "Message-only amend is blocked"
  const { git } = await fixture(page, false)
  const before = git("rev-parse", "HEAD")
  const tree = git("rev-parse", "HEAD^{tree}")
  await open(page, true)
  await page.getByTestId("commit-message-input").fill("Reworded commit")
  await expect(page.getByTestId("commit-submit")).toBeEnabled()
  await page.getByTestId("commit-submit").click()
  await expect(page.getByTestId("commit-overlay")).not.toBeVisible()
  expect(git("rev-parse", "HEAD")).not.toBe(before)
  expect(git("rev-parse", "HEAD^{tree}")).toBe(tree)
  expect(git("log", "-1", "--format=%s")).toBe("Reworded commit")
})

test("dismissed commit drafts survive Escape, backdrop and Cancel separately from amend", async ({ page }) => {
  // Audit finding: "Escape silently discards the commit draft"
  await fixture(page)
  for (const dismiss of ["Escape", "backdrop", "Cancel"]) {
    await open(page)
    await page.getByTestId("commit-message-input").fill("Keep my draft")
    if (dismiss === "Escape") await page.keyboard.press("Escape")
    else if (dismiss === "Cancel") await page.getByRole("button", { name: "Cancel", exact: true }).click()
    else await page.getByTestId("commit-overlay").click({ position: { x: 5, y: 5 } })
    await expect(page.getByTestId("commit-overlay")).not.toBeVisible()
    await open(page)
    await expect(page.getByTestId("commit-message-input")).toHaveValue("Keep my draft")
    await page.keyboard.press("Escape")
  }
  await open(page, true)
  await expect(page.getByTestId("commit-message-input")).toHaveValue("Commit 3")
  await page.getByTestId("commit-message-input").fill("Amend draft")
  await page.keyboard.press("Escape")
  await open(page)
  await expect(page.getByTestId("commit-message-input")).toHaveValue("Keep my draft")
  await page.keyboard.press("Escape")
  await open(page, true)
  await expect(page.getByTestId("commit-message-input")).toHaveValue("Amend draft")
})
