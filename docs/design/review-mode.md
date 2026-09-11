# Review mode

Owner, 2026-09-11: "review mode keeps track of every single file and every
single changed or added line in the diff, and marks them as unreviewed. The
user has to click on each line of every file and that changes the status.
Must be line by line. This is the first step towards AI-assisted review,
where the user can drop messages in his diff and they are sent to AI at the
end of the review, just like in a Bitbucket review." Then: arrows and vim
j/k to move, Enter / Shift+Enter next and previous file, Space cycles
unreviewed → ok → rejected → unreviewed, slash commands on a line
(`/comment …`), the review kept in a file for an agent over MCP later.
"Should be applied to both the diff view in the main panel and the commit
window."

The approved prototype is `docs/prototypes/review-mode.html` (also an
artifact). This document is the implementation design; PLAN.md major
v0.17 holds the iterations.

## 1. Model

A **review** is one document per reviewed thing, keyed by:

| Selected row | Key | File |
|---|---|---|
| a commit | its full sha | `.powergit/reviews/<sha>.json` |
| Working directory row, or an unstaged file in the commit dialog | `<HEAD sha>-worktree` | `.powergit/reviews/<HEAD>-worktree.json` |
| Index row, or a staged file in the commit dialog | `<HEAD sha>-index` | `.powergit/reviews/<HEAD>-index.json` |

The same key from either surface, so a line marked in the commit dialog is
marked in the Diff tab of the Working directory row and vice versa. The key
is validated by the engine with `^[0-9a-f]{40}([0-9a-f]{24})?(-(worktree|index))?$`
so it can never be a path.

A **line key** is the diff side and number: `+<new line>` for added,
`-<old line>` for removed. Context lines have no key and are never counted.
Keys survive a refetch of the same diff (the Working directory diff is
refetched on every status poll); they do not survive an amend that shifts
lines, which is accepted — the review belongs to that commit.

Line **state**: absent (unreviewed) · `ok` · `rejected`. Space or a click on
the mark cycles them in that order; `x` toggles rejected directly.
`rejected` counts as reviewed for progress and is listed separately.

**Comments** attach to a line key, several per line, plain text.

Document (`version` first, tolerant parse: unknown keys ignored, garbage → empty):

```json
{
  "version": 1,
  "commit": "<key>",
  "head": "<sha>",
  "reviewed": 5, "changed": 27, "status": "in-progress",
  "files": {
    "frontend/src/x.ts": {
      "lines": { "+29": "ok", "-13": "rejected" },
      "comments": [ { "line": "+33", "text": "…" } ]
    }
  }
}
```

`reviewed`, `changed`, `status` are derived and rewritten on every save; they
exist for the reader that gets the file without the app (the agent).

## 2. Storage

`<repo>/.powergit/reviews/<key>.json`, written by the engine through
`GET/PUT/DELETE /repos/{id}/reviews/{key}`. The repo stays clean: before the
first write the engine ensures `/.powergit/` is in `.git/info/exclude`
(Git Extensions' own never-committed mechanism, already used by
"Add to .git/info/exclude"), then bumps the status so the Working directory
row does not list the review's own file. Writes are temp + rename. The
reviews routes bypass the mutation gate: saving a review must not 409 while
a pull runs. The directory is one constant so a fallback under the app data
dir (`POWERGIT_DATA_DIR/reviews/<repo id>/`) is a one-line switch if the
owner prefers an untouched repo.

Why the repo and not the app data dir: the whole point is an agent in the
repository reading the file over MCP.

## 3. Interaction

Review mode is a per-window toggle (module store, like the console's
"Show all"), shared by the Diff tab and the commit dialog, remembered.

| Key | Action |
|---|---|
| ↑ ↓, k j | move the cursor one row (context rows included) |
| gg, Home / G, End | first / last row |
| Space | cycle the current changed line; nothing on a context row |
| x | toggle rejected |
| n | next unreviewed line, wrapping, then the next file with work |
| Enter / Shift+Enter | next / previous file, cursor on its first row |
| / | open the command line under the cursor: `/comment <text>`, `/ok`, `/reject`, `/clear`; Enter runs, Esc cancels; `/c`, `/x` short forms |

Mouse: clicking the **mark cell** cycles the line and moves the cursor.
Clicking the **text** moves the cursor only, so the v0.15.5 line selection
for reset and the v0.16.0 text selection keep working unchanged. The
prototype cycles on any click; that collides with line selection, so the
mark cell is the click target (open call 1 below). A "+" on hover in the
gutter adds a comment.

Hotkeys live in a `review` scope of the catalog (Git Extensions has no
equivalent, `ge: null`), active only while review mode is on and the focus
is inside the diff surface (`data-hotkey-surface="review"`), and never while
typing in the command line or a comment. `Host.tsx` walks the layer stack
top to bottom instead of consulting only the top layer, so the review layer
can sit over `browse` in the main window and over `commit` in the dialog.
Bare Space is not bound anywhere today (commit is Ctrl+Space); j/k/x/n/g,
`/`, Enter are free.

## 4. UI

- **Toggle**: a round check button left of the tree toggle, in the Diff
  tab's floating pair (`right: 10 + 30 + 6, bottom: 8`) and in the commit
  dialog's files bar before the mode button.
- **Marks**: a `.diff-row-mark` cell inside the sticky gutter, so it inherits
  `user-select: none` and the copy handler never sees it. Unreviewed: amber
  ring and an amber stripe on the code; ok: primary-blue filled check;
  rejected: red filled ×, red stripe; cursor: the grid selection colour.
  Amber rather than green because green means "added" in a diff.
- **Bar** in the tab strip (Diff tab) and the dialog frame (commit dialog):
  REVIEWING / REVIEW COMPLETE, meter, `d / n lines · r rejected · f of F
  files · c comments`, Review file, Start over, Finish review.
- **File pills** on the file list rows: `reviewed/changed`, blue with a
  check when complete, red with the rejected count; left stripe amber or
  blue. Changed-line counts come from `git diff --numstat` so files not yet
  opened have a denominator.
- **Review file pane** beside the diff: the JSON as written, Copy, saved-at.
- **Finish review**: for now, saves and shows the summary; the MCP hand-off
  is a later major.
- Tokens: a `review` family in `theme/tokens.ts` for both themes, exported
  as `--pg-review-*`.

## 5. Where it plugs in

- `DiffView.tsx` renders rows for both surfaces; the mark cell, the cursor
  class and the comment / command rows are added behind a `review` prop so
  the non-review layout is byte-identical. Comment and command rows are not
  `.diff-row`, so `plainTextOf` skips them. `VirtualLines.tsx` (diffs over
  200 lines) gets a row model with per-index sizes and a `scrollToIndex`.
- Diff tab: `BottomPanel.tsx` knows `commitId`, `pendingRow` and `headId`;
  `DiffTab.tsx` owns the button, the layer and Enter/Shift+Enter over its
  file list.
- Commit dialog: `CommitDialog.tsx` is at the 400-line lint cap and is split
  first; it gets `headId` through `AppDialogs`; the key follows
  `selected.staged`.
- `useReview({ engine, key })` loads on key change and saves debounced,
  latest-wins, like `usePendingDiff`.

## 6. Iterations (PLAN.md major v0.17)

1. **v0.17.0 Mark lines in the Diff tab** — in-memory, one file at a time:
   marks, cursor, keys, bar, button. Usable the day it ships.
2. **v0.17.1 The review survives** — engine routes and file, Review file
   pane, Start over, exclude handling.
3. **v0.17.2 The commit dialog** — same mode, shared key, dialog split.
4. **v0.17.3 Whole-review progress** — numstat counts, file pills and
   stripes, meter over all files, n and Enter across files, "complete".
5. **v0.17.4 Comments and the slash command line** — command row, comment
   rows, "+" affordance, comments in the file and the bar.

Each iteration ends with a symptom e2e in the owner's words and an owner
tick. The MCP hand-off (`Finish review` sending the file to an agent) is
the next major, once the file format has been used for real.

## 7. Open calls for the owner

1. **Click on the text of a line**: cursor only (line selection for reset
   keeps working) — recommended — or cycle like the prototype (then line
   selection needs another gesture in review mode).
2. **Where j/k work**: only while the diff has focus (strict; Enter and n
   move focus into it) — recommended — or anywhere in the Diff tab
   including the file list.
3. **`.powergit/` in the repo**, hidden through `.git/info/exclude` —
   recommended, it is what makes the MCP hand-off possible — or the app
   data directory, leaving the repository untouched.
