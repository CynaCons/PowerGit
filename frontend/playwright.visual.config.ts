import { defineConfig, devices } from "@playwright/test"

/**
 * Pixel diffs. Do not run unless the owner asked (`npm run test:visual`).
 * Update baselines with `npm run test:visual:update`.
 */
export default defineConfig({
  testDir: "tests/visual",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  maxFailures: 1,
  passWithNoTests: true,
  reporter: [["line"]],
  timeout: 30_000,
  expect: {
    toHaveScreenshot: { maxDiffPixelRatio: 0.02, animations: "disabled" },
  },
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
    reuseExistingServer: true,
    timeout: 60_000,
    stdout: "ignore",
    stderr: "pipe",
  },
})
