import { defineConfig, devices } from "@playwright/test"

const ci = !!process.env.CI

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: ci,
  workers: ci ? undefined : 1,
  forbidOnly: ci,
  retries: 0,
  maxFailures: ci ? 0 : 1,
  reporter: ci ? [["github"], ["line"]] : [["line"]],
  timeout: 15_000,
  use: {
    baseURL: "http://127.0.0.1:1420",
    trace: "off",
    video: "off",
    screenshot: "off",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run dev",
    url: "http://127.0.0.1:1420",
    reuseExistingServer: !ci,
    timeout: 60_000,
    stdout: "ignore",
    stderr: "pipe",
  },
})
