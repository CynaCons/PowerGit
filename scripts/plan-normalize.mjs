// PLAN.md normalizer — the one-time v0.13.2 restructure, kept as the
// reference behaviour for powerplan's `normalize` tool (v0.13.9). Not part of
// any workflow: PLAN.md is written by powerplan only. Usage:
//   node scripts/plan-normalize.mjs PLAN.md [--dry]
import { readFileSync, writeFileSync } from "node:fs"

const path = process.argv[2]
const dry = process.argv.includes("--dry")
const src = readFileSync(path, "utf8")
const eol = src.includes("\r\n") ? "\r\n" : "\n"
const lines = src.split(/\r?\n/)

const verKey = (v) => v.split(".").map(Number)
const cmpVer = (a, b) => {
  const x = verKey(a), y = verKey(b)
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] ?? 0) - (y[i] ?? 0)
    if (d) return d
  }
  return 0
}

// --- split into top-level sections ---
const sections = [] // { heading, body: string[] }
let preamble = []
let cur = null
for (const line of lines) {
  const m = /^## (.*)$/.exec(line)
  if (m) {
    cur = { heading: m[1], body: [] }
    sections.push(cur)
  } else if (cur) cur.body.push(line)
  else preamble.push(line)
}

// --- classify ---
const majors = new Map() // "0.5" -> { titles: [], intro: string[], iterations: Map }
const later = [], backlog = []
const MAJOR_RE = /^v(\d+\.\d+) — (.*)$/
const ITER_RE = /^### v(\d+\.\d+\.\d+)\b/

function addMajor(ver, title) {
  if (!majors.has(ver)) majors.set(ver, { titles: [], intro: [], iterations: new Map() })
  const mj = majors.get(ver)
  if (title && !mj.titles.includes(title)) mj.titles.push(title)
  return mj
}

for (const s of sections) {
  if (s.heading === "Current Status") continue // replaced below
  if (s.heading === "Later") { later.push(...s.body); continue }
  if (s.heading === "Backlog") { backlog.push(...s.body); continue }
  const m = MAJOR_RE.exec(s.heading)
  if (!m) throw new Error(`unexpected section: ${s.heading}`)
  const mj = addMajor(m[1], m[2])
  let iter = null
  for (const line of s.body) {
    const im = ITER_RE.exec(line)
    if (im) {
      iter = { heading: line, body: [] }
      const ver = im[1]
      const majorVer = ver.split(".").slice(0, 2).join(".")
      const owner = addMajor(majorVer, null)
      if (owner.iterations.has(ver)) throw new Error(`duplicate iteration ${ver}`)
      owner.iterations.set(ver, iter)
    } else if (iter) iter.body.push(line)
    else mj.intro.push(line)
  }
}

// titles for majors that only existed implicitly
const TITLES = {
  "0.6": "Showcase + cleanup",
  "0.7": "File Tree correctness + GE command bars",
  "0.8": "Large-repo responsiveness",
  "0.9": "Linux AppImage hardening",
  "0.10": "Large-repo scalability for real",
  "0.12": "Owner feedback rounds — Linux AppImage",
}
for (const [ver, mj] of majors) {
  if (mj.titles.length === 0) mj.titles.push(TITLES[ver] ?? "(untitled)")
}

// --- backlog: fold Later in, drop the dated narrative subsection ---
const cleanedBacklog = []
let skipping = false
for (const line of backlog) {
  if (/^### Branch restructure \+ first Tauri build/.test(line)) { skipping = true; continue }
  if (skipping) {
    if (/^\s*$/.test(line)) continue
    if (/^- \[|^- [A-Z]/.test(line) && !/^  /.test(line)) skipping = false
    else continue
  }
  cleanedBacklog.push(line)
}
const trim = (arr) => {
  const out = [...arr]
  while (out.length && /^\s*$/.test(out[0])) out.shift()
  while (out.length && /^\s*$/.test(out[out.length - 1])) out.pop()
  return out
}

// --- header ---
const HEADER = [
  "## Current Status",
  "",
  "The current iteration is the last heading below that is not marked COMPLETE",
  "(`powerplan get_current_iteration`). This header never names a version, so it",
  "cannot go stale. Live dev: UI `http://127.0.0.1:1420` · engine `http://127.0.0.1:7733`",
  "(bearer-token gated since v0.13.0).",
  "",
  "---",
]

// --- emit ---
const out = [...trim(preamble), "", ...HEADER, ""]
const majorVers = [...majors.keys()].sort(cmpVer)
for (const ver of majorVers) {
  const mj = majors.get(ver)
  out.push(`## v${ver} — ${mj.titles.join(" · ")}`)
  const intro = trim(mj.intro)
  if (intro.length) out.push(...intro)
  const iters = [...mj.iterations.keys()].sort(cmpVer)
  for (const iv of iters) {
    const it = mj.iterations.get(iv)
    if (out[out.length - 1] !== "") out.push("")
    out.push(it.heading, ...trim(it.body))
  }
  out.push("")
}
out.push("## Backlog")
out.push(...trim(cleanedBacklog))
if (later.length) {
  out.push("", "### From the former “Later” list")
  out.push(...trim(later))
}
out.push("")

// --- invariants: every task line survives byte-identical ---
const taskLines = (ls) => ls.filter((l) => /^\s*- \[[ x]\]/.test(l)).sort()
const before = taskLines(lines), after = taskLines(out)
if (before.length !== after.length || before.some((l, i) => l !== after[i])) {
  const missing = before.filter((l) => !after.includes(l))
  const extra = after.filter((l) => !before.includes(l))
  throw new Error(`task lines changed:\nmissing:\n${missing.join("\n")}\nextra:\n${extra.join("\n")}`)
}
console.log(`majors: ${majorVers.map((v) => "v" + v).join(", ")}`)
console.log(`tasks: ${before.length} preserved; lines ${lines.length} -> ${out.length}`)
if (!dry) writeFileSync(path, out.join(eol))
