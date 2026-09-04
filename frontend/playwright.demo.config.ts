import { defineConfig, devices } from "@playwright/test"

export default defineConfig({
  testDir: "tests/demo",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  maxFailures: 1,
  reporter: [["line"]],
  timeout: 120_000,
  use: {
    baseURL: "http://127.0.0.1:1420",
    headless: false,
    launchOptions: { slowMo: 250 },
    trace: "off",
    video: "off",
    screenshot: "off",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // The walkthrough runs on synthetic data. VITE_DEMO must reach the dev
    // server: a dev server already running without it shows real data or
    // "connecting…" instead (v0.13.12: demo is never inferred).
    command: "npm run dev",
    url: "http://127.0.0.1:1420",
    reuseExistingServer: true,
    timeout: 60_000,
    env: { VITE_DEMO: "1" },
  },
})
