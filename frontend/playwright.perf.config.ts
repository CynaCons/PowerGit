import { defineConfig, devices } from "@playwright/test"

// Perf harness config: runs the real app against the synthetic heavy repo
// (scripts/make-heavy-repo.mjs) served by a dedicated engine on :7799.
// Launched via `npm run test:perf` (frontend/scripts/perf-run.mjs), which
// starts that engine and passes the repo manifest in PERF_MANIFEST.
export default defineConfig({
  testDir: "tests/perf",
  workers: 1,
  retries: 0,
  maxFailures: 1,
  reporter: [["line"]],
  timeout: 120_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: "http://127.0.0.1:1421",
    trace: "off",
    screenshot: "off",
    video: "off",
    chromiumSandbox: false,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run dev -- --port 1421 --strictPort",
    url: "http://127.0.0.1:1421",
    reuseExistingServer: false,
    timeout: 60_000,
    stdout: "ignore",
    stderr: "pipe",
    env: { VITE_ENGINE_URL: "http://127.0.0.1:7799" },
  },
})
