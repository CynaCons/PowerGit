#!/usr/bin/env node
// Sink for the in-app perf probe (src/perf/probe.ts, v0.20.6): serves the
// probe its config and writes the report it posts, then exits so the caller
// can close the app. Plain node http, no dependencies, so it runs on the
// WSL side as well (node 18).
//   node scripts/perf/probe-sink.mjs --port 7790 --label linux-wayland-flutter --repo-id <id> --runs 3 --out <dir>
import { mkdirSync, writeFileSync } from "node:fs"
import { createServer } from "node:http"
import { join } from "node:path"

const args = process.argv.slice(2)
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 ? args[i + 1] : def
}
const port = Number(opt("port", 7790))
const config = { label: opt("label", "probe"), repoId: opt("repo-id", undefined), runs: Number(opt("runs", 3)) }
const out = opt("out", "test-results/perf")
const timeoutMs = Number(opt("timeout", 900)) * 1000

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*" }
const server = createServer((req, res) => {
  if (req.method === "OPTIONS") return res.writeHead(204, cors).end()
  if (req.url === "/config")
    return res.writeHead(200, { ...cors, "Content-Type": "application/json" }).end(JSON.stringify(config))
  if (req.url === "/report" && req.method === "POST") {
    let body = ""
    req.on("data", (c) => (body += c))
    req.on("end", () => {
      mkdirSync(out, { recursive: true })
      const file = join(out, `probe-${config.label}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`)
      writeFileSync(file, body)
      res.writeHead(204, cors).end()
      console.log(file)
      server.close()
      process.exit(0)
    })
    return
  }
  res.writeHead(404, cors).end()
})
server.listen(port, "127.0.0.1", () => console.error(`probe sink on :${port} for ${config.label}`))
setTimeout(() => {
  console.error(`no report within ${timeoutMs / 1000} s`)
  process.exit(3)
}, timeoutMs)
