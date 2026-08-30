#!/usr/bin/env node
// Perf harness orchestrator (`npm run test:perf`): builds/reuses the heavy
// synthetic repo, starts a dedicated engine on :7799 with that repo open,
// then runs the perf Playwright suite against it. Opt-in — not part of
// test:e2e — because generating 50k commits takes ~a minute on first run.

import { spawn, spawnSync } from "node:child_process"
import { existsSync } from "node:fs"
import { join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const frontendDir = resolve(fileURLToPath(new URL(".", import.meta.url)), "..")
const repoRoot = resolve(frontendDir, "..")
const ENGINE_URL = "http://127.0.0.1:7799"

const { ensureHeavyRepo } = await import(new URL("../../scripts/make-heavy-repo.mjs", import.meta.url))
const manifest = await ensureHeavyRepo({})

// Prefer the user-local .NET 10 SDK (see docs/agents/memories/engine-exe-lock.md).
const localDotnet = join(process.env.LOCALAPPDATA ?? "", "Microsoft", "dotnet", "dotnet.exe")
const dotnet = existsSync(localDotnet) ? localDotnet : "dotnet"

console.error("starting perf engine on :7799…")
// Prefer the already-built exe: `dotnet run` would rebuild and collide with
// a dev engine's file lock (docs/agents/memories/engine-exe-lock.md). The
// exe needs DOTNET_ROOT pointing at the user-local SDK on this machine.
const builtExe = join(repoRoot, "src", "engine", "PowerGit.Engine", "bin", "Debug", "net10.0", "PowerGit.Engine.exe")
const [cmd, args] = existsSync(builtExe)
  ? [builtExe, ["--urls", ENGINE_URL]]
  : [dotnet, ["run", "--project", join(repoRoot, "src", "engine", "PowerGit.Engine"), "--urls", ENGINE_URL]]
const engine = spawn(cmd, args, {
  cwd: manifest.root, // repo auto-discovery opens the heavy repo
  env: {
    ...process.env,
    DOTNET_ROOT: join(process.env.LOCALAPPDATA ?? "", "Microsoft", "dotnet"),
    POWERGIT_ENGINE_URL: ENGINE_URL,
  },
  stdio: ["ignore", "ignore", "inherit"],
})

const kill = () => {
  if (!engine.killed) engine.kill()
}
process.on("exit", kill)
process.on("SIGINT", () => process.exit(130))

try {
  let healthy = false
  for (let i = 0; i < 120 && !healthy; i++) {
    try {
      const res = await fetch(`${ENGINE_URL}/health`)
      healthy = res.ok
    } catch {
      await new Promise((r) => setTimeout(r, 1000))
    }
  }
  if (!healthy) throw new Error("perf engine did not become healthy on :7799")

  const open = await fetch(`${ENGINE_URL}/repos/open`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path: manifest.root }),
  })
  if (!open.ok) throw new Error(`failed to open heavy repo: ${await open.text()}`)

  const result = spawnSync("npx", ["playwright", "test", "-c", "playwright.perf.config.ts"], {
    cwd: frontendDir,
    stdio: "inherit",
    shell: true,
    env: { ...process.env, PERF_MANIFEST: JSON.stringify(manifest) },
  })
  process.exit(result.status ?? 1)
} finally {
  kill()
}
