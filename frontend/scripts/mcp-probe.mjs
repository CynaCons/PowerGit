#!/usr/bin/env node

import { spawn } from "node:child_process"
import { createInterface } from "node:readline"
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"

const here = dirname(fileURLToPath(import.meta.url))
const executable =
  process.argv[2] ?? process.env.POWERGIT_EXE ?? resolve(here, "../src-tauri/target/debug/powergit.exe")
const repoPath = process.argv[3]

if (!repoPath) {
  console.error("usage: node frontend/scripts/mcp-probe.mjs [powergit.exe] <repo-path>")
  process.exit(1)
}

const child = spawn(executable, ["mcp"], { stdio: ["pipe", "pipe", "inherit"] })
const lines = createInterface({ input: child.stdout })
const pending = new Map()
let nextId = 1

lines.on("line", (line) => {
  let message
  try {
    message = JSON.parse(line)
  } catch {
    return
  }
  if (message.id !== undefined && pending.has(message.id)) {
    const { resolve, reject } = pending.get(message.id)
    pending.delete(message.id)
    if (message.error) reject(new Error(message.error.message))
    else resolve(message.result)
  }
})

child.on("exit", (code) => {
  for (const { reject } of pending.values()) reject(new Error(`powergit mcp exited ${code}`))
  pending.clear()
})

function send(message) {
  child.stdin.write(`${JSON.stringify(message)}\n`)
}

function request(method, params = {}) {
  const id = nextId++
  send({ jsonrpc: "2.0", id, method, params })
  return new Promise((resolveRequest, reject) => pending.set(id, { resolve: resolveRequest, reject }))
}

function payloadFrom(result) {
  if (result?.structuredContent) return result.structuredContent
  const text = result?.content?.find((item) => item.type === "text")?.text
  return text ? JSON.parse(text) : result
}

try {
  await request("initialize", {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "powergit-mcp-probe", version: "1" },
  })
  send({ jsonrpc: "2.0", method: "notifications/initialized", params: {} })
  await request("tools/list")

  const opened = payloadFrom(
    await request("tools/call", {
      name: "agent_review_open",
      arguments: {
        repo_path: repoPath,
        mode: "wait",
        title: "probe",
        why: "mcp-probe",
        files: [
          {
            path: "f.txt",
            status: "M",
            patch: "--- a/f.txt\n+++ b/f.txt\n@@ -1 +1 @@\n-old\n+new\n",
          },
        ],
      },
    }),
  )
  console.log(opened.review_id)

  const waited = payloadFrom(
    await request("tools/call", {
      name: "agent_review_wait",
      arguments: { repo_path: repoPath, review_id: opened.review_id, timeout_ms: 90000 },
    }),
  )
  console.log(JSON.stringify(waited))
  child.stdin.end()
  process.exitCode = waited.timed_out || waited.status === "pending" ? 3 : 0
} catch (error) {
  console.error(error.message)
  child.kill()
  process.exitCode = 1
}
