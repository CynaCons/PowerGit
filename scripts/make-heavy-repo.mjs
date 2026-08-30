#!/usr/bin/env node
// Generates a synthetic heavy repository for perf testing: tens of thousands
// of commits (with periodic merges so the graph has real lanes) and thousands
// of refs (local branches, remote-tracking branches, tags). Idempotent: the
// repo is cached in the OS temp dir and only rebuilt when parameters change.
//
// Usage: node scripts/make-heavy-repo.mjs [--commits 50000] [--branches 2000] [--tags 500]
// Prints the manifest JSON (root, deepTipSha, …) on stdout as the last line.

import { execFileSync, spawnSync } from "node:child_process"
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const args = process.argv.slice(2)
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 ? Number(args[i + 1]) : def
}

export async function ensureHeavyRepo({ commits = 50_000, branches = 2_000, tags = 500 } = {}) {
  const root = join(tmpdir(), "powergit-heavy-repo")
  const manifestPath = join(root, "heavy-repo.json")
  const stamp = `v1:${commits}:${branches}:${tags}`

  if (existsSync(manifestPath)) {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"))
    if (manifest.stamp === stamp) return manifest
    rmSync(root, { recursive: true, force: true })
  } else if (existsSync(root)) {
    rmSync(root, { recursive: true, force: true })
  }

  console.error(`generating heavy repo: ${commits} commits, ${branches} branches, ${tags} tags…`)
  mkdirSync(root, { recursive: true })
  const git = (...a) => execFileSync("git", a, { cwd: root, stdio: ["ignore", "pipe", "pipe"] })
  git("init", "-b", "main")
  git("config", "user.name", "Heavy Gen")
  git("config", "user.email", "heavy@example.com")
  git("config", "core.autocrlf", "false")

  // --- fast-import stream: linear main with a short merged branch every 200
  // commits so lane layout has real work to do.
  const lines = []
  let mark = 0
  let prev = 0
  const t0 = 1_600_000_000
  const commit = (from, merge, i, label) => {
    mark += 1
    const msg = `${label} ${i}`
    lines.push("commit refs/heads/main")
    lines.push(`mark :${mark}`)
    lines.push(`committer Heavy Gen <heavy@example.com> ${t0 + i * 60} +0000`)
    lines.push(`data ${Buffer.byteLength(msg)}`)
    lines.push(msg)
    if (from) lines.push(`from :${from}`)
    if (merge) lines.push(`merge :${merge}`)
    const content = `${label} ${i}\n`
    lines.push(`M 100644 inline counter.txt`)
    lines.push(`data ${Buffer.byteLength(content)}`)
    lines.push(content)
    lines.push("")
    return mark
  }

  for (let i = 1; i <= commits; i++) {
    if (i > 400 && i % 200 === 0) {
      // Side branch: two commits forked a bit earlier, merged back into main.
      const base = prev
      const s1 = commit(base, null, i, "side-a")
      const s2 = commit(s1, null, i, "side-b")
      prev = commit(base, s2, i, "merge side")
    } else {
      prev = commit(prev || null, null, i, "work")
    }
  }

  const marksFile = join(root, ".git", "heavy-marks.txt")
  const stream = lines.join("\n")
  const imp = spawnSync("git", ["fast-import", `--export-marks=${marksFile}`], {
    cwd: root,
    input: stream,
    stdio: ["pipe", "ignore", "pipe"],
    maxBuffer: 1024 * 1024 * 256,
  })
  if (imp.status !== 0) {
    throw new Error(`git fast-import failed: ${imp.stderr}`)
  }

  // mark -> sha map from the export.
  const marks = new Map()
  for (const line of readFileSync(marksFile, "utf8").split("\n")) {
    const [m, sha] = line.trim().split(" ")
    if (m && sha) marks.set(Number(m.slice(1)), sha)
  }
  const totalMarks = mark

  // --- thousands of refs via one update-ref batch: mostly remote-tracking
  // branches (the monorepo case), some local, plus tags. Spread evenly over
  // history so most tips are NOT near the top of the log.
  const refLines = []
  const shaAt = (fraction) => marks.get(Math.max(1, Math.round(totalMarks * fraction)))
  const localCount = Math.min(500, branches)
  const remoteCount = Math.max(0, branches - localCount)
  for (let i = 0; i < localCount; i++) {
    refLines.push(`create refs/heads/gen/local-${String(i).padStart(5, "0")} ${shaAt((i + 1) / (localCount + 1))}`)
  }
  for (let i = 0; i < remoteCount; i++) {
    refLines.push(`create refs/remotes/origin/gen/branch-${String(i).padStart(5, "0")} ${shaAt((i + 1) / (remoteCount + 1))}`)
  }
  for (let i = 0; i < tags; i++) {
    refLines.push(`create refs/tags/gen-v${String(i).padStart(4, "0")} ${shaAt((i + 1) / (tags + 1))}`)
  }
  // Known deep tip for the jump-to-ref perf assertion: ~30% down the log.
  const deepTipSha = shaAt(0.7)
  refLines.push(`create refs/heads/gen/deep-tip ${deepTipSha}`)
  const upd = spawnSync("git", ["update-ref", "--stdin"], {
    cwd: root,
    input: refLines.join("\n") + "\n",
    stdio: ["pipe", "ignore", "pipe"],
  })
  if (upd.status !== 0) {
    throw new Error(`git update-ref failed: ${upd.stderr}`)
  }

  git("checkout", "-f", "main")

  const manifest = {
    stamp,
    root,
    commits,
    branches: branches + 1,
    tags,
    deepTipSha,
    headSha: marks.get(totalMarks),
  }
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2))
  console.error(`heavy repo ready at ${root}`)
  return manifest
}

const invokedDirectly = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/").split("/").pop())
if (invokedDirectly) {
  ensureHeavyRepo({ commits: opt("commits", 50_000), branches: opt("branches", 2_000), tags: opt("tags", 500) })
    .then((m) => console.log(JSON.stringify(m)))
    .catch((e) => {
      console.error(e)
      process.exit(1)
    })
}
