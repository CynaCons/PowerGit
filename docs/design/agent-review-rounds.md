# Agent review rounds, on the board

Owner, 2026-10-13: "I want agents to be able to trigger a review, and to
bring to the user's attention the change sets — give the user the possibility
to approve or reject lines and give comments to the agents. The review shall
be cadenced by the agents through MCP, and PowerGit is the way through which
the agent presents the stuff to the user and gets his review and approval."
Then: "should we go full view instead of just the bottom panels?" and "I want
powerboard to be the communication medium between PowerGit / user and the
agent. Agent prepares the review using powergit mcp, triggers the review
rounds, and listens to a board dedicated to the review. Feedback from the
user is pushed on that board, allowing the exchange to be interactive."
He picked layout A: "I'm okay for A. This is very good."

The approved design is `docs/prototypes/agent-review-v3.html`, tab
"A · Diff + board (picked)", with the inbox and the other screens under
"Inbox" and "States", and the exchange under "The cadence". The earlier
drafts are `agent-review-v2.html` (rounds without the board; layouts A/B/C)
and tab "C" of v3 (board first, not picked). PLAN.md major v0.21 holds the
iterations.

## 1. What exists (v0.19 – v0.20.1)

- Review mode (v0.19, `docs/design/review-mode.md`): every changed line
  marked unreviewed / ok / rejected, line comments, kept in
  `.powergit/reviews/<key>.json`.
- Agent review sessions (v0.20.0): `.powergit/agent-reviews/<id>.json`, the
  inbox under the rail's Agent reviews button, the session's diff read-only
  with the review bar, Approve / Request changes / Cancel / Ack for the
  whole session. The session id is also the review key.
- The MCP server (v0.20.1): `powergit mcp`, the stdio shim over a private
  pipe; tools `agent_review_open`, `agent_review_wait`, `agent_review_get`,
  `agent_review_list`, `agent_review_cancel`.
  `docs/agents/mcp-agent-review.md` is the agent-facing doc.

What changes: a session gets rounds; a verdict per change; comments go back
with ids and line numbers; the conversation runs on a powerboard channel;
the review takes the full window.

## 2. Decisions

| # | Decision | Source |
|---|---|---|
| 1 | Full view: the inbox and a review take the window except the rail; no repository tree, no bottom panel while open. The rail always works (the v0.20.11 rule for Settings). | owner picked A |
| 2 | Layout A: files · diff with verdicts · board column with the round controls. | owner, 2026-10-13 |
| 3 | The engine reads and writes powerboard's SQLite file directly; no Python needed. No `board.db` or an unknown schema → the board column becomes the rounds list and agents use `agent_review_wait`. | default |
| 4 | The review file in the repository is the record (rounds, verdicts, comments, replies). The board is the conversation and a readable copy; it drops messages after 7 days. PowerGit copies the agent's replies into the review file as they arrive. | default |
| 5 | Accept does nothing to git; the agent commits. Staging the accepted changes is a later option. | default |
| 6 | A verdict per change (hunk) on top of v0.19's per-line marks: Accept / Reject marks all the change's lines; Space still marks one line; a change whose lines disagree goes out as `mixed` with the rejected lines listed. Comments are per line. | default |

The defaults are the plan's starting point; the owner can still change any.

## 3. Model

### 3.1 Session, version 2

`.powergit/agent-reviews/<id>.json` gains:

```jsonc
{
  "version": 2,
  "board": "review-atlas-9c1e",        // null when powerboard is absent
  "boardCursor": 1234,                 // last message id copied into the file
  "rounds": [
    {
      "n": 1,
      "openedAt": "…", "sentAt": "…",  // sentAt null while it is the user's turn
      "note": "Good fix. Two things inline.",
      "files": [{ "path": "…", "status": "M", "patch": "<unified diff>" }],
      "changes": [
        { "id": "h1", "path": "src/Auth/TokenStore.cs",
          "oldStart": 40, "oldLines": 9, "newStart": 40, "newLines": 11,
          "hash": "<sha1 of the +/- lines>",
          "origin": "new" | "carried" | "revised",
          "from": null | "h4",          // the previous round's change it continues
          "verdict": "accept" | "reject" | "mixed" | "undecided" }
      ],
      "removed": ["h2"]                 // previous round's changes that are gone
    }
  ],
  "comments": [
    { "id": "c1", "round": 1, "change": "h2", "path": "…", "line": "+64",
      "body": "…", "kind": "round" | "ask", "postedAt": "…",
      "replies": [{ "author": "auth-fix", "body": "…", "at": "…", "boardId": 1240 }] }
  ]
}
```

- **The patch is captured when a round opens** (`git diff <base>` of the
  worktree, or `base..head`), so round 1 stays readable after the agent
  edits the worktree for round 2. Today's live diff route serves the
  current round only; the new route serves any round from its patch.
- Version 1 sessions read as one round with the live diff, no board.
- Change ids are stable within a session: `h<n>`, numbered in the order
  they first appear.

### 3.2 Change identity across rounds

For each file, for each change of the new round:

1. Same path and same `hash` as a change of the previous round → `carried`;
   it keeps its id and verdict, drawn faded.
2. Else, its old-side range overlaps a previous change's old-side range in
   the same file → `revised`; new id, `from` = that change, verdict reset,
   its comments shown under it.
3. Else → `new`.

A previous change that matched nothing is in `removed`; the diff shows a
one-line "removed after your rejection" (or "removed") card in its file.

### 3.3 Line marks per round

The v0.19 marks file is per key; a round gets its own key:
`<session id>-r<n>` (the engine's key regex gains `(-r[0-9]{1,3})?`). When
a round opens, the marks of carried changes are copied across with their
line numbers shifted to the new round's diff. The verdict of a change is
derived from its lines' marks: all ok → accept, all rejected → reject, any
mix → mixed, none → undecided.

## 4. The board (powerboard)

### 4.1 The file

- Path, as powerboard resolves it: `POWERBOARD_DB`, else
  `%LOCALAPPDATA%\powerboard\board.db` (Windows),
  `~/Library/Application Support/powerboard/board.db` (macOS),
  `$XDG_DATA_HOME` or `~/.local/share` + `/powerboard/board.db` (Linux).
- Open like powerboard: WAL, `busy_timeout` 10 s, autocommit; writes in
  `BEGIN IMMEDIATE`.
- Schema check on open: tables `messages(id, channel, author, text,
  created)` and `seen(reader, channel, last_id, updated)`. Anything else →
  "board unavailable", the fallback of decision 3.
- PowerGit never creates `board.db`: no file means powerboard is not
  installed.
- `Microsoft.Data.Sqlite` is a new engine dependency (bundled native
  SQLite on Windows and Linux); check the self-contained sidecar size and
  the AppImage matrix after adding it.

### 4.2 Channels and authors

- One channel per review: `review-<repo>-<first 4 of the id>`, lowercased,
  only `[a-z0-9._-]`, at most 64 characters; `agent_review_open` takes an
  optional `board` to name it.
- Authors PowerGit writes: `powergit` for events, `human` for what the
  user does (powerboard reserves `human` for the user; agents cannot post
  as it). The user's own `powerboard post` from a terminal shows the same.
- PowerGit reads with `SELECT … WHERE channel = ? AND id > ?` (as
  powerboard's `tail` does) and never touches `seen` for anyone, so it does
  not move an agent's read position.
- The engine polls the channel of every open review every second while the
  app runs; the frontend reads the feed from the engine.

### 4.3 What is posted

| When | Author | Text |
|---|---|---|
| a round opens | powergit | `Round 1 opened · review 9c1e · 3 files, 5 changes` + the title |
| Ask now / Board box | human | `c3 · src/Auth/TokenStore.cs:45` + the comment; plain text for the Board box |
| Send round | human | `Round 1 sent · review 9c1e · 3 accepted, 1 rejected, 1 undecided, 2 comments`, the note, one line per rejected / mixed / commented change (`✗ h2  path:64  c1  body`), the accepted ids on one line, and `details: agent_review_get review_id=9c1e round=1` |
| Approve | human | `Approved · review 9c1e · round 2 · 5 of 5 changes` |
| Cancel (user) | human | `Cancelled · review 9c1e` + the reason |
| closed | powergit | `Review closed · approved` / `· cancelled` |

An agent message that starts with `c<n>:` is a reply to that comment; the
engine attaches it under the comment in the review file and the diff
shows it under the line. Anything else stays on the board only.

### 4.4 "Is the agent reading?"

powerboard writes `seen.updated` when a `read` returns, not while it waits,
so a long wait looks like an old read. Two steps:

1. Without a powerboard change: "last read 10:44" from `seen.updated` of
   the review's agent name (the `agent` field of the session).
2. powerboard change (its own repository): while `read` waits, touch
   `seen.updated` every 5 s. PowerGit then shows "reading this channel"
   when `updated` is under 15 s old, else "last read … ago".

## 5. MCP tools

| Tool | Status | Payload |
|---|---|---|
| `agent_review_open` | changed | as today, plus optional `board`; the result adds `board` (the channel name, or null) and `round: 1` |
| `agent_review_revise` | new | `review_id`, `note?`, `replies?: [{comment, body}]`; captures the worktree diff as the next round, runs §3.2, posts "Round n opened" and the replies; returns the round summary |
| `agent_review_get` | changed | optional `round`; returns the round's changes with verdicts and line ranges, and its comments with ids, path, line, body and replies |
| `agent_review_wait` | kept | blocks until the round is sent or the review closes; returns the same payload as `get` for that round |
| `agent_review_list`, `agent_review_cancel` | kept | — |

Agent convention (goes into `docs/agents/mcp-agent-review.md`):

```text
open = powergit.agent_review_open(mode, title, why, base | worktree)
if open.board:
  loop:
    msgs = powerboard.read(me=<agent name>, channel=open.board, wait_seconds=3600)
    "Round n sent"  → agent_review_get(round=n); fix; agent_review_revise(replies)
    "Approved"      → commit; stop
    "Cancelled"     → stop
    other from human → answer with powerboard.post (prefix "c<n>: " for a comment)
else:
  agent_review_wait → as today
```

The agent's powerboard name must equal the `agent` it passes to
`agent_review_open`, so PowerGit can read its presence.

## 6. Engine routes

In the repository group of `Program.cs`, next to today's `/agent-reviews` routes (`/{sid}`, `/{sid}/resolve`, `/{sid}/wait`, `/{sid}/diff`). The review key regex is in `GitHost.Reviews.cs`.

- `GET  /agent-reviews/{id}` — version 2 session (rounds, comments).
- `GET  /agent-reviews/{id}/rounds/{n}/diff?path=` — the round's patch for a file.
- `PUT  /agent-reviews/{id}/rounds/{n}/verdict` — `{change, verdict}`; writes the line marks.
- `POST /agent-reviews/{id}/comments` — `{round, change, path, line, body, kind}`; `ask` posts at once.
- `POST /agent-reviews/{id}/rounds/{n}/send` — `{note}`; stamps `sentAt`, posts the round, wakes `wait`.
- `POST /agent-reviews/{id}/resolve` — approve / cancel as today, plus the board post.
- `GET  /agent-reviews/{id}/board?after=` — the channel's messages after an id, and the presence.
- `POST /agent-reviews/{id}/board` — `{text}` from the Board box, as `human`.
- `GET  /board/status` — found / not found / unknown schema, and the path.

## 7. UI (layout A)

- **Full view.** `AgentReviewsView` leaves the file-history slot and takes
  the main area like Settings and the start pane: the inbox, or a review.
  The rail stays and wins (v0.20.11). Escape or ← returns from a review to
  the inbox; Escape from the inbox returns to the history.
- **Inbox** (tab "Inbox"): rows with the title, mode chip, agent and client,
  repository and branch, file count, presence dot, the turn ("round 1 ·
  your turn", "round 1 sent · agent revising", "approved · round 1") and
  age; filter Waiting for you / Open / All. The badge counts reviews
  waiting for the user.
- **Review**: top bar (←, title, mode · round · turn chip, round buttons,
  agent · branch · worktree · base, the why); files column (name, path,
  decided/total, a green/red bar); the diff (a verdict bar on every change:
  ✓ Accept, ✗ Reject, Comment; origin chips "accepted in round 1 ·
  unchanged" and "revised in round 2"; carried changes faded; threads under
  their line with "asked on the board" or "goes with the round"; removed
  changes as one-line cards); the board column (channel name, presence,
  the feed with `c<n> ↗` links that scroll the diff to the line, the Board
  box, and under it the round box: counts, note, Send round n /
  Approve all (n) / Cancel review).
- **Keys**: A accept, R reject, C comment, J/K next/previous change,
  Space marks one line (v0.19), Ctrl+Enter sends the round.
- **States** (tab "States"): round sent (verdicts read-only until the next
  round, board open); agent not reading (grey dot, last read time); no
  powerboard (rounds list, `agent_review_wait`); Notify (no Send; verdicts
  and comments go on the board as they are made; Mark read); approved
  (read-only, the closing posts).
- Built on what exists: `DiffTab` (read-only, review mode on) for the diff,
  `useReview` under the round key, `ReviewBar`'s marks; new
  `components/agentReviews/` parts for the verdict bar, the board column and
  the round box.

## 8. Tests

- Engine (xunit): session v1 → v2 read; patch capture per round; §3.2
  identity (carried / revised / new / removed) on fixture diffs; marks
  copied for carried changes; verdict from marks (accept / reject / mixed /
  undecided); send stamps and wakes `wait`; board adapter against a temp
  `board.db` created with powerboard's schema (post, read after id, never
  writes `seen`, channel name rules, unknown schema → unavailable, missing
  file → unavailable); replies `c<n>:` attached.
- MCP: `mcp-probe.mjs` drives open → (board) → send → revise → approve;
  `agent_review_wait` still works with no board.
- Frontend (vitest): the round summary text; verdict ↔ marks; inbox turn
  labels.
- e2e: a fake session v2 with two rounds and a temp board: verdicts,
  Ask now lands on the board, an agent reply (written to the temp board)
  shows under the line, Send round, Approve; the rail leaves a review;
  the no-powerboard fallback.
- Gate: a real Claude Code session with powerboard does two rounds against
  PowerGit; the owner ticks it.
