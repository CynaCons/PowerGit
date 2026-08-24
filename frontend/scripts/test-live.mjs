import { chromium } from "playwright"
;(async () => {
  const b = await chromium.launch()
  const p = await b.newPage({ viewport: { width: 1400, height: 900 } })
  await p.goto("https://cynacons.github.io/PowerGit/", { waitUntil: "networkidle" })
  console.log("hero h1:", await p.locator("h1").first().innerText())
  await p.goto("https://cynacons.github.io/PowerGit/demo/", { waitUntil: "networkidle" })
  await p.waitForSelector('[data-testid="grid-row"]', { timeout: 20000 })
  console.log("demo grid rows rendered:", await p.locator('[data-testid="grid-row"]').count())
  console.log("status bar:", await p.locator('[data-testid="engine-status"]').innerText())
  await b.close()
})().catch((e) => {
  console.error("FAIL", e.message)
  process.exit(1)
})
