import type { CommitChanges, CommitDetail, FileChange, RefTree, RepoStatus } from "../engine/types"
import type { Revision } from "./types"

// Sample data for the Pages demo and `?demo=1` (no engine). Deterministic
// for a given seed so the showcase looks the same on every load, but with
// SHAs, dates, messages and diffs that read like a real project rather than
// counters (v0.13.21, owner: "refine the demo").

const AUTHORS = ["Henrik", "RussKie", "mstv", "gerhardol", "NikolayXIT", "you"]

const SUBJECTS = [
  "Revision grid: keep the selected row's node visible",
  "Engine: stream /events with the change kind in the low bits",
  "Commit dialog: stage a selected hunk like Git Extensions",
  "Diff view: directory tree mode for the file list",
  "Rail: count pill above the Commit icon when collapsed",
  "Frameless window with integrated controls on Windows and Linux",
  "Settings: stage every change until Save",
  "AppImage: register the desktop entry so GNOME shows the icon",
  "History: reuse unchanged rows on refresh",
  "Ref tree: cloud icon on remote-tracking branches",
  "Status bar: brand-blue branch name, 22px",
  "Graph: lane colours from Git Extensions",
  "Stash: drop and apply from the rail menu",
  "Blob viewer: cap at 2 MB and say so",
  "Tests: symptom-first specs for owner reports",
  "Docs: visual walkthrough states 1 to 9",
]

const FILES: [string, string][] = [
  ["frontend/src/components/RevisionGrid.tsx", "M"],
  ["frontend/src/hooks/useHistory.ts", "M"],
  ["src/engine/PowerGit.Engine/GitHost.Watch.cs", "M"],
  ["frontend/src/components/CommandRail.tsx", "A"],
  ["frontend/src/components/dialogs/CommitDialog.tsx", "M"],
  ["frontend/src/styles/app.css", "M"],
  ["docs/agents/memories/selection-pipeline.md", "A"],
  ["frontend/tests/e2e/selected-row-graph.spec.ts", "A"],
  ["frontend/src/components/NavRail.tsx", "D"],
  ["src/engine/PowerGit.Engine/Program.cs", "M"],
  ["frontend/src-tauri/src/lib.rs", "M"],
  ["PLAN.md", "M"],
]

function lcg(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 0xffffffff
  }
}

function sha(rand: () => number): string {
  let out = ""
  for (let i = 0; i < 40; i++) out += Math.floor(rand() * 16).toString(16)
  return out
}

export function syntheticHistory(count: number, seed = 1): Revision[] {
  const rand = lcg(seed)
  const chronological: Revision[] = []
  let lastMain = ""
  const openBranches: string[] = []
  // Newest commit "now", one every 1 to 9 hours back from there.
  const now = Math.floor(Date.now() / 3600_000) * 3600_000
  const stamps: number[] = []
  let t = now
  for (let i = 0; i < count; i++) {
    stamps.unshift(t)
    t -= (1 + Math.floor(rand() * 9)) * 3600_000
  }

  for (let i = 0; i < count; i++) {
    const id = sha(rand)
    const roll = rand()
    const refs: string[] = []
    let parents: string[] = []

    // Forks and merges often enough that any 10-row window shows lanes;
    // the last rows are forced so the demo opens on a fork and a merge.
    const forceFork = i === count - 8
    const forceMerge = i === count - 3 && openBranches.length > 0
    if (i === 0) {
      parents = []
    } else if ((forceMerge || roll < 0.18) && openBranches.length > 0 && lastMain) {
      const branchTip = openBranches.pop() as string
      parents = [lastMain, branchTip]
      lastMain = id
    } else if ((forceFork || roll < 0.3) && lastMain && openBranches.length < 4) {
      parents = [lastMain]
      openBranches.push(id)
      refs.push(`feature/${SUBJECTS[i % SUBJECTS.length].split(":")[0].toLowerCase().replace(/\s+/g, "-")}`)
    } else {
      parents = lastMain ? [lastMain] : []
      lastMain = id
    }

    if (i > 0 && i % 60 === 0) refs.push(`v0.${Math.floor(i / 60)}.0`)
    if (i === count - 12) refs.push("origin/master")

    chronological.push({
      id,
      parents,
      message:
        i === 0
          ? "Initial commit"
          : parents.length > 1
            ? `Merge branch '${SUBJECTS[i % SUBJECTS.length].split(":")[0].toLowerCase().replace(/\s+/g, "-")}'`
            : SUBJECTS[(i * 7) % SUBJECTS.length],
      author: AUTHORS[(i * 5) % AUTHORS.length],
      date: new Date(stamps[i]).toISOString().slice(0, 16).replace("T", " "),
      refs,
    })
  }

  const newestFirst = chronological.reverse()
  newestFirst[0] = {
    ...newestFirst[0],
    refs: ["HEAD", "master", ...newestFirst[0].refs],
  }
  return newestFirst
}

let demoRows: Revision[] | null = null
function demoHistory(): Revision[] {
  demoRows ??= syntheticHistory(200)
  return demoRows
}

function indexOf(id: string): number {
  const rows = demoHistory()
  const i = rows.findIndex((r) => r.id === id)
  return i < 0 ? 0 : i
}

/** Commit details for a demo row (the panel's Commit tab). */
export function syntheticCommitDetail(id: string): CommitDetail {
  const rows = demoHistory()
  const rev = rows[indexOf(id)]
  const email = `${rev.author.toLowerCase()}@example.org`
  const date = `${rev.date.replace(" ", "T")}:00`
  return {
    id: rev.id,
    parents: rev.parents,
    author: rev.author,
    authorEmail: email,
    committer: rev.author,
    committerEmail: email,
    authorDate: date,
    commitDate: date,
    subject: rev.message,
    body:
      rev.parents.length > 1
        ? ""
        : "Sample data: this is PowerGit itself running in the browser without its git engine.\n\nThe shipped app shows your repository here.",
    refs: rev.refs,
  }
}

/** Changed files plus the first file's diff for a demo row. */
export function syntheticChanges(id: string): CommitChanges {
  const i = indexOf(id)
  const rand = lcg(i + 17)
  const n = 2 + Math.floor(rand() * 4)
  const start = Math.floor(rand() * FILES.length)
  const files: FileChange[] = []
  for (let k = 0; k < n; k++) {
    const [path, status] = FILES[(start + k) % FILES.length]
    files.push({ path, status, binary: false })
  }
  const first = files[0]
  const line = 40 + Math.floor(rand() * 200)
  const text = [
    `diff --git a/${first.path} b/${first.path}`,
    `--- a/${first.path}`,
    `+++ b/${first.path}`,
    `@@ -${line},7 +${line},9 @@`,
    "   const rows = useMemo(() => layout(revisions), [revisions])",
    "   const selected = rows.findIndex((r) => r.rev.id === selectedSha)",
    "-  // A refresh rebuilt every row, so the layout effect always reset.",
    "-  post({ reset: true, revisions })",
    "+  // Rows keep their identity where nothing changed, so a refresh that",
    "+  // changes nothing never reaches the layout worker.",
    "+  if (unchanged) return",
    "+  post({ reset: false, revisions: revisions.slice(prev.length) })",
    "   lastSent.current = revisions",
    " }",
    "",
  ].join("\n")
  return {
    files,
    firstDiff: { path: first.path, text, binary: false, sizeBytes: text.length, truncated: false, truncatedReason: null },
  }
}

/** The ref panel's content for the demo: every ref the sample rows carry. */
export function syntheticRefTree(): RefTree {
  const rows = demoHistory()
  const tree: RefTree = { branches: [], remotes: [], tags: [], submodules: [] }
  for (const r of rows) {
    for (const ref of r.refs) {
      if (ref === "HEAD") continue
      if (ref.startsWith("v0.")) tree.tags.push({ name: ref, fullName: `refs/tags/${ref}`, target: r.id, current: false })
      else if (ref.startsWith("origin/"))
        tree.remotes.push({ name: ref, fullName: `refs/remotes/${ref}`, target: r.id, current: false })
      else tree.branches.push({ name: ref, fullName: `refs/heads/${ref}`, target: r.id, current: ref === "master" })
    }
  }
  tree.branches.sort((a, b) => a.name.localeCompare(b.name))
  return tree
}

/** A clean working tree on master, one commit ahead of origin. */
export function syntheticStatus(): RepoStatus {
  return { branch: "master", unstagedCount: 0, stagedCount: 0, unstaged: [], staged: [], ahead: 1, behind: 0, upstream: "origin/master" }
}
