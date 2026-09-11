import { expect, test } from "@playwright/test"

import { currentRepoPath, git, makeRepo, openRepoOnEngine, removeRepo } from "../repoFixture"
import { ENGINE_URL, engineHeaders } from "../engine"

// v0.15.0, owner: "we will enhance the settings menu". Identity is edited
// one scope at a time, the tools git will use are chosen from what the
// machine has, and the confirmations are the user's to switch off. Since
// v0.18.0 Settings is a page and there is no Save: a Git key is written
// when its field is left (blur or Enter), an app preference on change.

async function repoId(): Promise<string> {
  const res = await fetch(`${ENGINE_URL}/repos/current`, { headers: engineHeaders() })
  return ((await res.json()) as { id: string }).id
}

async function localConfig(): Promise<Record<string, string | null>> {
  const res = await fetch(`${ENGINE_URL}/repos/${await repoId()}/config?scope=local`, { headers: engineHeaders() })
  return (await res.json()) as Record<string, string | null>
}

test.describe("settings", () => {
  let repoDir: string
  let previousRepo: string | null = null

  test.beforeAll(async () => {
    previousRepo = await currentRepoPath()
    repoDir = makeRepo("pg-settings-")
    // A local identity that differs from whatever the machine has globally.
    git(repoDir, "config", "--local", "user.name", "Local Only")
    await openRepoOnEngine(repoDir)
  })

  test.afterAll(async () => {
    await openRepoOnEngine(previousRepo ?? process.cwd())
    await removeRepo(repoDir)
  })

  test("the identity scope switches which config file is being edited", async ({ page }) => {
    await page.goto("/")
    await expect(page.getByTestId("grid-row").first()).toBeVisible()
    await page.getByTestId("settings-button").click()

    // Opens on this repository, showing the local value.
    await expect(page.getByTestId("settings-user-name")).toHaveValue("Local Only")

    // The global scope shows the machine's own value, which is not that one.
    await page.getByTestId("settings-scope-global").click()
    await expect(page.getByTestId("settings-user-name")).not.toHaveValue("Local Only")

    // Back to the repository, edit and leave the field: the write lands in
    // the local file, and the section says so.
    await page.getByTestId("settings-scope-local").click()
    await expect(page.getByTestId("settings-user-name")).toHaveValue("Local Only")
    await page.getByTestId("settings-user-name").fill("Renamed Locally")
    await page.getByTestId("settings-user-name").press("Enter")
    await expect(page.getByTestId("settings-status-git")).toHaveText("Saved")
    await expect.poll(async () => (await localConfig()).userName).toBe("Renamed Locally")

    // A key set at this scope is "changed"; Unset removes it from the file.
    await expect(page.getByTestId("settings-row-git.userName")).toHaveAttribute("data-changed", "true")
    await page.getByTestId("settings-reset-git.userName").click()
    await expect.poll(async () => (await localConfig()).userName).toBeFalsy()
    await expect(page.getByTestId("settings-row-git.userName")).toHaveAttribute("data-changed", "false")
    git(repoDir, "config", "--local", "user.name", "Local Only")
  })

  test("the behaviour switches persist and turn a confirmation off", async ({ page }) => {
    await page.goto("/")
    await expect(page.getByTestId("grid-row").first()).toBeVisible()

    await page.getByTestId("settings-button").click()
    const confirmDelete = page.getByTestId("settings-confirm-delete-branch")
    await expect(confirmDelete).toBeChecked()
    await confirmDelete.click()
    await page.getByTestId("settings-autofetch").selectOption({ label: "Every 5 minutes" })
    await page.keyboard.press("Escape")
    await expect(page.getByTestId("settings-page")).toHaveCount(0)

    // Survives a reload: the preference is stored, not just in this render.
    await page.reload()
    await expect(page.getByTestId("grid-row").first()).toBeVisible()
    await page.getByTestId("settings-button").click()
    await expect(page.getByTestId("settings-confirm-delete-branch")).not.toBeChecked()
    await expect(page.getByTestId("settings-autofetch")).toHaveValue("5")

    // With the switch off, deleting a branch no longer asks.
    await page.keyboard.press("Escape")
    git(repoDir, "branch", "doomed")
    await page.reload()
    const doomed = page.locator('[data-testid="tree-row"][data-label="doomed"]')
    await expect(doomed).toBeVisible()
    await doomed.click({ button: "right" })
    // Assert the menu is really open before clicking, so a missed click
    // cannot pass as "no confirmation was shown".
    const remove = page.getByTestId("tree-delete-branch")
    await expect(remove).toBeVisible()
    await remove.click()
    await expect(page.getByTestId("confirm-dialog")).toHaveCount(0)
    // The engine is the source of truth for whether it actually went.
    await expect
      .poll(async () => {
        const res = await fetch(`${ENGINE_URL}/repos/${await repoId()}/refs`, { headers: engineHeaders() })
        const refs = (await res.json()) as { branches: { name: string }[] }
        return refs.branches.map((b) => b.name)
      })
      .not.toContain("doomed")

    // Leave the preferences as they were found: the rows' own Reset.
    await page.getByTestId("settings-button").click()
    await page.getByTestId("settings-reset-behaviour.confirmations").click()
    await expect(page.getByTestId("settings-confirm-delete-branch")).toBeChecked()
    await page.getByTestId("settings-reset-behaviour.autoFetch").click()
    await expect(page.getByTestId("settings-autofetch")).toHaveValue("0")
    await page.keyboard.press("Escape")
    await expect(page.getByTestId("settings-page")).toHaveCount(0)
  })

  test("the tool pickers offer what the machine has and write git's own keys", async ({ page }) => {
    await page.goto("/")
    await expect(page.getByTestId("grid-row").first()).toBeVisible()
    await page.getByTestId("settings-button").click()

    // Every option is a tool git knows by name; the ones this machine does
    // not have are offered but disabled, so the list explains itself.
    const options = page.getByTestId("settings-mergetool").locator("option")
    await expect(options.filter({ hasText: "Not set" })).toHaveCount(1)
    await expect(options.filter({ hasText: "Custom command" })).toHaveCount(1)
    await expect(options.filter({ hasText: "VS Code" })).toHaveCount(1)

    // The editor is written when the field is left, not on every keystroke.
    await expect(page.getByTestId("settings-editor")).toBeEnabled()
    await page.getByTestId("settings-editor").fill("code --wait")
    expect((await localConfig()).editor).toBeFalsy()
    await page.getByTestId("settings-editor").blur()
    await expect(page.getByTestId("settings-status-tools")).toHaveText("Saved")
    await expect.poll(async () => (await localConfig()).editor).toBe("code --wait")
    await expect(page.getByTestId("settings-row-tools.editor")).toHaveAttribute("data-changed", "true")
  })

  // v0.15.6 (Ubuntu freeze taskforce): the recovery ladder the owner drives
  // with Ctrl+Shift+F1..F9 while the picture is frozen is listed under
  // Diagnostics, so its keys and hotkeys can be read before the freeze happens.
  test("the Diagnostics section lists the nine recovery steps with their keys and hotkeys", async ({ page }) => {
    await page.goto("/")
    await expect(page.getByTestId("grid-row").first()).toBeVisible()
    await page.getByTestId("settings-button").click()

    await expect(page.getByTestId("settings-row-diagnostics.recovery")).toContainText("Recovery experiments")
    await expect(page.getByTestId("recovery-experiments")).toBeVisible()
    await expect(page.getByTestId("recovery-experiments-help")).toContainText("Try 3, 6, 8 first")
    await expect(page.getByTestId("recovery-experiments-help")).toContainText("engine.log")

    const keys = [
      "queue_draw",
      "thaw",
      "hide_show",
      "resize",
      "present",
      "frame_sync_off_hide_show",
      "reload",
      "new_window",
      "webview_snapshot",
    ]
    for (let n = 1; n <= 9; n++) {
      const row = page.getByTestId(`recovery-step-${n}`)
      await expect(row).toHaveAttribute("data-key", keys[n - 1])
      await expect(row).toContainText(keys[n - 1])
      await expect(page.getByTestId(`recovery-run-${n}`)).toHaveText(`Ctrl+Shift+F${n}`)
    }
    // In the browser there is no shell to ask, so the buttons say so by being disabled.
    await expect(page.getByTestId("recovery-run-3")).toBeDisabled()
    await page.getByTestId("settings-back").click()
    await expect(page.getByTestId("settings-page")).toHaveCount(0)
  })
})
