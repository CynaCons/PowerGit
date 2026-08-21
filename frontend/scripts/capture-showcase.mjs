// Captures showcase screenshots for the GitHub Pages site into docs/site/assets.
// Requires the engine on :7733. Starts Vite itself and shuts it down after.
import { chromium } from "playwright"
import { spawn } from "node:child_process"
import { mkdirSync } from "node:fs"

const root = new URL("../..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")
const assets = `${root}/docs/site/assets`
mkdirSync(assets, { recursive: true })

const vite = spawn("npm", ["run", "dev"], { cwd: `${root}/frontend`, shell: true, stdio: "ignore" })
try {
  // wait for vite
  let up = false
  for (let i = 0; i < 60 && !up; i++) {
    await new Promise((r) => setTimeout(r, 1000))
    up = await fetch("http://127.0.0.1:1420").then(() => true).catch(() => false)
  }
  if (!up) throw new Error("vite did not start")

  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 2 })
  await page.goto("http://127.0.0.1:1420")
  await page.waitForSelector('[data-testid="grid-row"]', { timeout: 20000 })
  await page.waitForTimeout(800)

  await page.screenshot({ path: `${assets}/browse.png` })

  await page.getByRole("tab", { name: /Diff/ }).click()
  await page.waitForTimeout(600)
  const bar = page.getByTestId("diff-options-bar")
  await bar.hover()
  await page.waitForTimeout(300)
  await page.screenshot({ path: `${assets}/diff-options.png` })

  await page.getByRole("tab", { name: "File Tree" }).click()
  await page.waitForTimeout(600)
  await page.screenshot({ path: `${assets}/file-tree.png` })

  await page.getByTestId("commit-button").click()
  await page.waitForSelector('[data-testid="commit-overlay"]')
  await page.waitForTimeout(400)
  await page.screenshot({ path: `${assets}/commit-dialog.png` })
  await page.keyboard.press("Escape")

  await page.getByTestId("stash-button").click()
  await page.waitForTimeout(300)
  await page.screenshot({ path: `${assets}/stash-menu.png` })
  await page.keyboard.press("Escape")

  await browser.close()
  console.log("showcase screenshots captured to docs/site/assets")
} finally {
  vite.kill()
}
