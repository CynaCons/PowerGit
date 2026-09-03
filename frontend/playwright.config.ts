import { defineConfig, devices } from "@playwright/test"

const ci = !!process.env.CI

export default defineConfig({
  testDir: "tests/e2e",
  // Every spec talks to ONE engine process with ONE open repository, and some
  // specs switch that repository (live-refresh-scope). Parallel workers there
  // let one spec's repo swap surface as "no repository" in another — that is
  // exactly how the Linux CI run failed while Windows (1 worker) passed. The
  // suite is ~3 min serially; keep it serial everywhere.
  fullyParallel: false,
  workers: 1,
  forbidOnly: ci,
  retries: 0,
  maxFailures: ci ? 0 : 1,
  reporter: ci ? [["github"], ["line"]] : [["line"]],
  timeout: 30_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: "http://127.0.0.1:1420",
    trace: "off",
    screenshot: "off",
    video: "off",
    chromiumSandbox: false,
  },
  // PW_WEBKIT=1 adds Playwright's WebKit — the closest stand-in for the
  // WebKitGTK webview the Linux AppImage runs in (see docker/ubuntu-check).
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    ...(process.env.PW_WEBKIT ? [{ name: "webkit", use: { ...devices["Desktop Safari"] } }] : []),
  ],
  webServer: {
    command: "npm run dev",
    url: "http://127.0.0.1:1420",
    reuseExistingServer: !ci,
    timeout: 60_000,
    stdout: "ignore",
    stderr: "pipe",
  },
})
