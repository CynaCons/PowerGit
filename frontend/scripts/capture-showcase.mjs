// Captures showcase screenshots into website/public/assets — the single
// canonical location used by both the Pages site and the README.
//
// Needs an engine the dev server can reach: by default :7733 with the shared
// frontend/.engine-token; set VITE_ENGINE_URL (and VITE_ENGINE_TOKEN) to
// point Vite elsewhere, e.g. a private engine on :7744 whose
// POWERGIT_ENGINE_ORIGINS allows http://127.0.0.1:1420. Starts Vite itself
// and shuts it down after.
//
// Every capture is a real state of the app on the real repository: the
// rail layout (default since v0.13.15), light and dark, the diff tab in
// directory-tree mode, the file tree, the commit dialog and a rail menu.
import { chromium } from "playwright"
import { spawn } from "node:child_process"
import { mkdirSync } from "node:fs"

const root = new URL("../..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")
const assets = `${root}/website/public/assets`
mkdirSync(assets, { recursive: true })

const vite = spawn("npm", ["run", "dev"], { cwd: `${root}/frontend`, shell: true, stdio: "ignore" })
try {
  let up = false
  for (let i = 0; i < 60 && !up; i++) {
    await new Promise((r) => setTimeout(r, 1000))
    up = await fetch("http://127.0.0.1:1420")
      .then(() => true)
      .catch(() => false)
  }
  if (!up) throw new Error("vite did not start")

  const browser = await chromium.launch()
  const shot = (page, name) => page.screenshot({ path: `${assets}/${name}` })

  async function open(theme) {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 2 })
    await page.addInitScript((t) => {
      localStorage.setItem("pg.theme", t)
      localStorage.setItem("pg.zoom", "1")
      localStorage.setItem("pg.bar", "rail")
      localStorage.setItem("pg.rail", "expanded")
      localStorage.setItem("pg.diffTree", "1")
    }, theme)
    await page.goto("http://127.0.0.1:1420")
    await page.waitForSelector('[data-testid="grid-row"]', { timeout: 30000 })
    // Let history settle (eager pages) so the graph is complete.
    await page.waitForTimeout(1500)
    return page
  }

  // 1. Browse, light: the hero. Second row selected so the details show.
  const light = await open("light")
  await light.getByTestId("grid-row").nth(1).click()
  await light.waitForTimeout(700)
  await shot(light, "browse.png")

  // 2. Diff tab in directory-tree mode.
  await light.getByRole("tab", { name: /Diff/ }).click()
  await light.waitForSelector('[data-testid="file-list"][data-mode="tree"]')
  await light.waitForTimeout(600)
  await shot(light, "diff-tree.png")

  // 3. File tree at that revision.
  await light.getByRole("tab", { name: "File Tree" }).click()
  await light.waitForSelector('[data-testid="commit-file-tree"]')
  await light.waitForTimeout(600)
  await shot(light, "file-tree.png")

  // 4. Commit dialog.
  await light.getByTestId("commit-button").click()
  await light.waitForSelector('[data-testid="commit-overlay"]')
  await light.waitForTimeout(500)
  await shot(light, "commit-dialog.png")
  await light.keyboard.press("Escape")
  await light.waitForTimeout(300)

  // 5. A rail menu (Stash options).
  await light.getByTestId("stash-button-menu").click()
  await light.waitForTimeout(300)
  await shot(light, "stash-menu.png")
  await light.keyboard.press("Escape")
  await light.close()

  // 6. Browse, dark.
  const dark = await open("dark")
  await dark.getByTestId("grid-row").nth(1).click()
  await dark.waitForTimeout(700)
  await shot(dark, "browse-dark.png")
  await dark.close()

  await browser.close()
  console.log(`showcase screenshots captured to ${assets}`)
} finally {
  vite.kill()
}
