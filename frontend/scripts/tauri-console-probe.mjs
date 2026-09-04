// Smoke probe for the NATIVE window: run `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9222 npm run tauri dev`,
// then `node scripts/tauri-console-probe.mjs`. Attaches over CDP and reports CSP
// violations, console errors, and whether the grid rendered rows from the sidecar.
// Exit 0 = rows rendered and no CSP violation. (v0.13.7)
import { chromium } from "playwright"
const browser = await chromium.connectOverCDP("http://127.0.0.1:9222")
const pages = browser.contexts().flatMap((c) => c.pages())
const page = pages.find((p) => !p.url().startsWith("devtools")) ?? pages[0]
if (!page) {
  console.log("NO PAGE")
  process.exit(2)
}
console.log("url:", page.url())
const errors = []
page.on("console", (m) => {
  if (m.type() === "error" || /Content Security Policy/i.test(m.text())) errors.push(m.text())
})
page.on("pageerror", (e) => errors.push("pageerror: " + e.message))
await page.waitForTimeout(8000)
const rows = await page
  .locator('[data-testid="grid-row"]')
  .count()
  .catch(() => -1)
const status = await page
  .getByTestId("engine-status")
  .textContent()
  .catch(() => "(no status bar)")
console.log("grid rows:", rows)
console.log("status bar:", (status ?? "").trim().slice(0, 120))
console.log("console errors:", errors.length)
for (const e of errors.slice(0, 10)) console.log("  -", e.slice(0, 200))
await browser.close()
process.exit(rows > 0 && !errors.some((e) => /Content Security Policy/i.test(e)) ? 0 : 1)
