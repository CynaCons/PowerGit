#!/usr/bin/env node
// Turns Git Extensions' RevisionGraph snapshot tests into JSON golden fixtures
// for PowerGit's TypeScript lane layouter. See README.md next to this file.
//
//   node tools/ge-parity/extract.mjs [path/to/gitextensions-ref]
//
// Reads  tools/ge-parity/scenarios.json (hand-transcribed C# scenarios) and the
//        *.verified.txt ASCII snapshots from the reference worktree
// Writes frontend/src/graph/__fixtures__/ge/<name>.json
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, "..", "..")
const refRoot = resolve(process.argv[2] ?? process.env.GE_REF ?? join(repoRoot, "..", "gitextensions-ref"))
const geTestDir = join(refRoot, "tests", "app", "UnitTests", "GitUI.Tests", "UserControls", "RevisionGrid", "Graph")
const geTestFile = join(geTestDir, "RevisionGraphTests.cs")
const outDir = join(repoRoot, "frontend", "src", "graph", "__fixtures__", "ge")

if (!existsSync(geTestFile)) {
  console.error(`Git Extensions reference not found: ${geTestFile}\nPass the worktree path or set GE_REF.`)
  process.exit(2)
}

const geTestSource = readFileSync(geTestFile, "utf8")
const { scenarios } = JSON.parse(readFileSync(join(here, "scenarios.json"), "utf8"))

/** "{id}:{parent},{parent}" tokens -> revisions in the order the C# test lists them. */
function parseSpec(spec) {
  return spec
    .split(" ")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((token) => {
      const [id, parents] = token.split(":")
      return { id, parents: parents ? parents.split(",") : [] }
    })
}

/** Mirrors AsciiGraphFor: a 1-char Subject is printed, anything else is '*'. */
const labelOf = (id) => (id.length === 1 ? id : "*")

/** Even lines of the snapshot are commit rows: '|' marks a lane carrying a segment, the label marks the node. */
function parseCommitLine(line) {
  const occupiedLanes = []
  let lane = -1
  let label = null
  for (let pos = 0; pos < line.length; pos += 2) {
    const ch = line[pos]
    if (ch === " ") continue
    if (ch === "|") {
      occupiedLanes.push(pos / 2)
    } else {
      if (lane >= 0) throw new Error(`two nodes in one commit line: ${JSON.stringify(line)}`)
      lane = pos / 2
      label = ch
    }
  }
  if (lane < 0) throw new Error(`no node in commit line: ${JSON.stringify(line)}`)
  return { lane, label, laneCount: Math.ceil(line.length / 2), occupiedLanes }
}

rmSync(outDir, { recursive: true, force: true })
mkdirSync(outDir, { recursive: true })

const usedVerifiedFiles = new Set()
for (const scenario of scenarios) {
  if (!scenario.handWritten && !geTestSource.includes(`"${scenario.spec}"`)) {
    throw new Error(`${scenario.name}: spec no longer found verbatim in RevisionGraphTests.cs — re-transcribe scenarios.json`)
  }
  if (!geTestSource.includes(`${scenario.method}(`)) {
    throw new Error(`${scenario.name}: method ${scenario.method} not found in RevisionGraphTests.cs`)
  }

  const verifiedPath = join(geTestDir, scenario.verifiedFile)
  usedVerifiedFiles.add(scenario.verifiedFile)
  const expectedAscii = readFileSync(verifiedPath, "utf8")
    .replace(String.fromCharCode(0xfeff), "") // UTF-8 BOM
    .replace(/\r\n?/g, "\n")
    .replace(/\n$/, "")
    .split("\n")

  const listed = parseSpec(scenario.spec)
  const topDown = scenario.order === "oldestFirst" ? [...listed].reverse() : listed
  const revisions = topDown.map((r) => ({ id: r.id, parents: r.parents, label: labelOf(r.id) }))

  const commitLines = expectedAscii.filter((_, i) => i % 2 === 0)
  if (commitLines.length !== revisions.length) {
    throw new Error(`${scenario.name}: ${commitLines.length} commit lines but ${revisions.length} revisions`)
  }
  const expectedRows = commitLines.map((line, i) => {
    const parsed = parseCommitLine(line)
    if (parsed.label !== revisions[i].label) {
      throw new Error(`${scenario.name}: row ${i} shows '${parsed.label}' but spec order says '${revisions[i].label}' (${revisions[i].id})`)
    }
    return { id: revisions[i].id, lane: parsed.lane, laneCount: parsed.laneCount, occupiedLanes: parsed.occupiedLanes }
  })

  const fixture = {
    $generated: "tools/ge-parity/extract.mjs — do not edit by hand",
    name: scenario.name,
    source: {
      test: `RevisionGraphTests.${scenario.method}`,
      verifiedFile: scenario.verifiedFile,
      spec: scenario.spec,
      order: scenario.order,
    },
    settings: {
      mergeGraphLanesHavingCommonParent: scenario.mergeGraphLanesHavingCommonParent,
      straightenGraphDiagonals: scenario.straightenGraphDiagonals,
    },
    revisions,
    expectedRows,
    expectedAscii,
  }
  const fileName = `${scenario.name.replace(/[^A-Za-z0-9_-]/g, "_")}.json`
  writeFileSync(join(outDir, fileName), JSON.stringify(fixture, null, 2) + "\n")
  console.log(`wrote ${fileName} (${revisions.length} revisions)`)
}

const unused = readdirSync(geTestDir).filter((f) => f.endsWith(".verified.txt") && !usedVerifiedFiles.has(f))
if (unused.length > 0) {
  console.log(`\nnot extracted (see README.md):\n  ${unused.join("\n  ")}`)
}
console.log(`\n${scenarios.length} fixtures -> ${outDir}`)
