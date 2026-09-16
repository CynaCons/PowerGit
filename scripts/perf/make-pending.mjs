#!/usr/bin/env node
// Generates a repository with N pending changes for the performance audit
// (v0.18.10): ~2N small committed files in nested folders, then N modified
// tracked files, N/4 untracked files and N/10 staged modifications.
// Idempotent and cheap to re-run: the committed base is built once under
// <tmpdir>/powergit-pending-<N>; every later call resets the working tree
// and re-applies the pending changes, so a harness that staged files can
// ask for the same tree again. Modelled on scripts/make-heavy-repo.mjs.
//
// Usage: node scripts/perf/make-pending.mjs [--n 2000]
// Prints the manifest JSON (root, counts, …) on stdout as the last line.

import { execFileSync } from "node:child_process"
import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"

const STAMP_VERSION = "v1"

const gitIn =
  (root) =>
  (...a) =>
    execFileSync("git", a, {
      cwd: root,
      stdio: ["ignore", "pipe", "pipe"],
      maxBuffer: 64 * 1024 * 1024,
    })
      .toString()
      .trim()

/** Path of the i-th committed file: three nested levels so the tree is realistic. */
const fileAt = (i) => join(`d${i % 23}`, `s${i % 7}`, `g${Math.floor(i / 161) % 11}`, `f${i}.txt`)

export function pendingCounts(n) {
  return {
    committed: n * 2,
    modified: n,
    untracked: Math.floor(n / 4),
    staged: Math.floor(n / 10),
  }
}

function buildBase(root, n) {
  const { committed } = pendingCounts(n)
  console.error(`generating pending repo base: ${committed} committed files under ${root}…`)
  mkdirSync(root, { recursive: true })
  const git = gitIn(root)
  git("init", "-b", "main")
  git("config", "user.name", "Pending Gen")
  git("config", "user.email", "pending@example.com")
  git("config", "core.autocrlf", "false")
  const made = new Set()
  for (let i = 0; i < committed; i++) {
    const p = join(root, fileAt(i))
    const d = dirname(p)
    if (!made.has(d)) {
      mkdirSync(d, { recursive: true })
      made.add(d)
    }
    writeFileSync(p, `file ${i}\nline two of ${i}\nline three\n`)
  }
  git("add", "-A")
  git("commit", "-q", "-m", `base: ${committed} files`)
  // A second commit so the graph has two rows, and an "upstream" so the
  // status refresh runs rev-list --left-right for real (as it does on a
  // cloned repository) instead of failing fast on @{upstream}.
  writeFileSync(join(root, "README.md"), "# pending fixture\n")
  git("add", "README.md")
  git("commit", "-q", "-m", "docs: readme")
  git("branch", "upstream-main", "HEAD~1")
  git("config", "branch.main.remote", ".")
  git("config", "branch.main.merge", "refs/heads/upstream-main")
}

/** Resets the tree to the committed base, then applies the pending changes. */
function applyPending(root, n) {
  const { modified, untracked, staged } = pendingCounts(n)
  const git = gitIn(root)
  git("reset", "-q", "--hard", "HEAD")
  git("clean", "-fdq")
  for (let i = 0; i < modified; i++) appendFileSync(join(root, fileAt(i)), `modified ${i}\n`)
  for (let i = 0; i < untracked; i++) {
    const p = join(root, `d${i % 23}`, `s${i % 7}`, `new-${i}.txt`)
    mkdirSync(dirname(p), { recursive: true })
    writeFileSync(p, `untracked ${i}\n`)
  }
  // Staged: distinct files, modified then added, so the index differs from
  // HEAD while the worktree matches the index (a clean "M " line).
  const stagedPaths = []
  for (let i = 0; i < staged; i++) {
    const rel = fileAt(modified + i)
    appendFileSync(join(root, rel), `staged ${i}\n`)
    stagedPaths.push(rel.replace(/\\/g, "/"))
  }
  if (stagedPaths.length > 0) {
    execFileSync("git", ["add", "--pathspec-from-file=-"], {
      cwd: root,
      input: stagedPaths.join("\n") + "\n",
    })
  }
}

export async function ensurePendingRepo({ n = 2000 } = {}) {
  const root = join(tmpdir(), `powergit-pending-${n}`)
  const manifestPath = join(root, ".git", "pending-manifest.json")
  const stamp = `${STAMP_VERSION}:${n}`
  let fresh = true
  if (existsSync(manifestPath)) {
    const previous = JSON.parse(readFileSync(manifestPath, "utf8"))
    if (previous.stamp === stamp) fresh = false
    else rmSync(root, { recursive: true, force: true })
  } else if (existsSync(root)) {
    rmSync(root, { recursive: true, force: true })
  }
  if (fresh) buildBase(root, n)
  applyPending(root, n)
  const git = gitIn(root)
  const porcelain = git("status", "--porcelain=v1", "-uall").split("\n").filter(Boolean)
  const counts = pendingCounts(n)
  const manifest = {
    stamp,
    root,
    n,
    ...counts,
    unstagedTotal: counts.modified + counts.untracked,
    statusLines: porcelain.length,
    headSha: git("rev-parse", "HEAD"),
    firstModified: fileAt(0).replace(/\\/g, "/"),
  }
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2))
  console.error(`pending repo (${n}) ready at ${root}: ${porcelain.length} status lines`)
  return manifest
}

const invokedDirectly =
  process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/").split("/").pop())
if (invokedDirectly) {
  const args = process.argv.slice(2)
  const i = args.indexOf("--n")
  ensurePendingRepo({ n: i >= 0 ? Number(args[i + 1]) : 2000 })
    .then((m) => console.log(JSON.stringify(m)))
    .catch((e) => {
      console.error(e)
      process.exit(1)
    })
}
