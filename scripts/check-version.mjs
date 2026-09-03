#!/usr/bin/env node
// Version consistency guard (v0.13.5). The ONLY version source is
// frontend/package.json; everything else must derive from it or be a
// placeholder. Exit 1 on any drift. Options:
//   --engine-url http://127.0.0.1:7733   also compare GET /health "engine"
//   --dist dist                          also check packaged artifact names
//   --tag vX.Y.Z                         also compare a git tag / release name
import { existsSync, readFileSync, readdirSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const repo = join(dirname(fileURLToPath(import.meta.url)), "..")
const args = process.argv.slice(2)
const opt = (name) => {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : undefined
}
const failures = []
const ok = (what) => console.log(`ok   ${what}`)
const fail = (what) => {
  failures.push(what)
  console.log(`FAIL ${what}`)
}

const pkg = JSON.parse(readFileSync(join(repo, "frontend/package.json"), "utf8"))
const version = pkg.version
if (!/^\d+\.\d+\.\d+$/.test(version)) fail(`frontend/package.json version "${version}" is not X.Y.Z`)
else ok(`frontend/package.json version ${version} (source of truth)`)

// tauri.conf.json must point at package.json, not hold a copy
const tauri = JSON.parse(readFileSync(join(repo, "frontend/src-tauri/tauri.conf.json"), "utf8"))
if (tauri.version === "../package.json") ok("tauri.conf.json version -> ../package.json")
else fail(`tauri.conf.json version is "${tauri.version}", expected "../package.json"`)

// Cargo.toml is a placeholder nothing consumes (build.rs exports POWERGIT_VERSION)
const cargo = readFileSync(join(repo, "frontend/src-tauri/Cargo.toml"), "utf8")
const cargoVersion = /^version = "([^"]+)"/m.exec(cargo)?.[1]
if (cargoVersion === "0.0.0") ok("Cargo.toml version is the 0.0.0 placeholder")
else fail(`Cargo.toml version is "${cargoVersion}", expected the 0.0.0 placeholder`)
const buildRs = readFileSync(join(repo, "frontend/src-tauri/build.rs"), "utf8")
if (buildRs.includes("POWERGIT_VERSION")) ok("build.rs exports POWERGIT_VERSION from package.json")
else fail("build.rs does not export POWERGIT_VERSION")

// Engine derives its version in the csproj; no literal allowed in Program.cs
const csproj = readFileSync(join(repo, "src/engine/PowerGit.Engine/PowerGit.Engine.csproj"), "utf8")
if (csproj.includes("package.json") && csproj.includes("<Version")) ok("engine csproj derives <Version> from package.json")
else fail("engine csproj does not derive <Version> from package.json")
const program = readFileSync(join(repo, "src/engine/PowerGit.Engine/Program.cs"), "utf8")
if (/engineVersion\s*=\s*"\d/.test(program)) fail("Program.cs still hardcodes engineVersion")
else ok("Program.cs has no hardcoded engine version")

// Optional live checks
const engineUrl = opt("--engine-url")
if (engineUrl) {
  try {
    const res = await fetch(`${engineUrl}/health`)
    const body = await res.json()
    if (body.engine === version) ok(`engine /health reports ${body.engine}`)
    else fail(`engine /health reports "${body.engine}", package.json says ${version}`)
  } catch (e) {
    fail(`engine /health unreachable at ${engineUrl}: ${e.message}`)
  }
}
const dist = opt("--dist")
if (dist) {
  const dir = join(repo, dist)
  const names = existsSync(dir) ? readdirSync(dir) : []
  for (const expected of [`PowerGit_${version}_win64.zip`, `PowerGit_${version}_x64-setup.exe`]) {
    if (names.includes(expected)) ok(`${dist}/${expected} present`)
    else fail(`${dist}/${expected} missing (found: ${names.join(", ") || "nothing"})`)
  }
}
const tag = opt("--tag")
if (tag) {
  if (tag === `v${version}`) ok(`tag ${tag} matches`)
  else fail(`tag ${tag} does not match v${version}`)
}

if (failures.length) {
  console.error(`\n${failures.length} version check(s) failed`)
  process.exit(1)
}
console.log(`\nall version checks passed for ${version}`)
