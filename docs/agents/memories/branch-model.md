# Branch model (settled 2026-09-03, v0.13.1)

## Shape
- `powergit` is the product and the GitHub default branch. 226-ish tracked
  files: engine, frontend, website, docs, scripts. No upstream tree.
- `master` is the untouched Git Extensions mirror at the upstream pin
  (`7f75cee29`, see PLAN.md header). Read-only.
- `master` is an ancestor of `powergit` via one `git merge -s ours
  --allow-unrelated-histories` commit (tree unchanged). Diffs, merge-bases and
  PRs between the branches therefore work. Never merge master forward for
  content; move the pin by rebasing the mirror and re-doing the ours merge.
- The behavioural reference is a sibling worktree, not this checkout:
  `git worktree add ../gitextensions-ref master`. Nothing in the build or
  tests reads it; only humans and agents do (and the v0.13.3 golden-parity
  generator, on demand).

## History (why it looked wrong before)
On 2026-08-21 the worktree was accidentally reset to the upstream pin,
recovered via fetch + fast-forward, and the product was moved onto a fresh
orphan branch `powergit` (commit 1 docs, commit 2 engine + frontend + tooling)
while `master` kept the full GitExtensions history. The upstream files stayed
on disk, hidden by 40 lines of .gitignore, and AGENTS.md kept saying the
WinForms app "remains in-tree". v0.13.1 deleted the on-disk leftovers,
replaced .gitignore with a PowerGit-only one, and rewrote the docs.

## Landmines
- Upstream's `.gitignore` had `[Rr]elease*/`, which silently ignored
  `.claude/skills/release/` and `.opencode/skills/release/` — the release
  skill was never committed until v0.13.1. Keep ignore rules specific.
- A `/tests/` root ignore would hide any future root-level tests directory.
