# Partial patches: which side the patch must describe

`frontend/src/patch/partial.ts` builds a unified diff containing only the
selected changed lines (Git Extensions' `PatchManager`), and
`frontend/src/hooks/useDiffLineSelection.ts` hands it to the engine's
`POST /patch` → `git apply`. The one thing that decides whether git accepts it
is `base`, and the rule is short:

> A **forward** apply requires the target file to equal the patch's
> **preimage**. A `--reverse` apply requires it to equal the **postimage**.

A hunk's preimage is its `" "` and `"-"` lines; its postimage is its `" "` and
`"+"` lines. `buildPartialPatch(text, selected, base)` produces a patch whose
`base` side is faithful to the real file: unselected changes on that side
become context, unselected changes on the other side are dropped.

So, per action (the table lives in `useDiffLineSelection.APPLY`):

| Action | Target file | Direction | `base` |
|---|---|---|---|
| stage | the index, which is `git diff`'s **old** side | forward `--cached` | `"old"` |
| unstage | the index, which is `git diff --cached`'s **new** side | `--cached --reverse` | `"new"` |
| reset lines | the working tree, the **new** side | `--reverse` | `"new"` |
| undo lines from a commit | the working tree at the commit's **new** side | `--reverse --index --3way` | `"new"` |

## The bug this cost us (v0.15.5)

`unstage` was built from `"old"` since v0.13.14. That patch's postimage keeps
the unselected `"-"` lines and drops the unselected `"+"` ones, so it matches
the index only when the selection happens to cover a whole hunk. Anything
narrower failed with git's `error: patch does not apply` — and the commit
dialog's e2e never caught it because it only ever unstaged a complete hunk.

Reproduce it in ten seconds if you ever doubt the table: commit `1\n2\n3\n`,
write `1x\n2x\n3x\n`, `git add`, then try to unstage only the first line with a
patch built each way. `scripts/`-free, just `git apply --cached --reverse`.

## Two other ways to build a patch git cannot use

`partialEligibility(text, context)` refuses both, because neither failure is
readable once it comes back from `git apply`:

- **truncated** — the engine caps a diff at `MaxDiffChars` / `MaxLines`
  (`GitHost.Queries.cs`), so the text ends mid-hunk.
- **whitespace ignored** — a diff taken with `-w` (Diff options) has context
  lines that do not match the bytes on disk.

## `--3way` needs the header

The `index <old>..<new> <mode>` line from git's own diff output is what
`--3way` uses to find the recorded blobs, so `buildPartialPatch` keeps every
header line above the first hunk verbatim. Drop them and 3-way silently
degrades to a plain apply. `--recount` is safe alongside it.

`--index` and `--cached` are mutually exclusive; the engine rejects the pair
rather than letting git do it (`GitHost.ApplyPatch`).
