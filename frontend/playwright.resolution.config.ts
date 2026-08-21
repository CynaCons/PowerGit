import { defineConfig } from "@playwright/test"

export default defineConfig({
  testDir: "./tests/resolution",
  timeout: 30_000,
  retries: 0,
  workers: 1,
  reporter: [["list"]],
  outputDir: "./test-results/resolution",
  use: {
    baseURL: "http://127.0.0.1:1420",
    trace: "off",
    screenshot: "off",
    video: "off",
  },
  webServer: {
    command: "npm run dev",
    url: "http://127.0.0.1:1420",
    reuseExistingServer: true,
    stdout: "ignore",
  },
})
