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
    command: "npm run dev",
    url: "http://127.0.0.1:1420",
    reuseExistingServer: true,
    timeout: 60_000,
  },
})
