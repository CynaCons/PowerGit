# Agent review over MCP

PowerGit hosts a same-machine MCP review gate in its engine sidecar. Coding agents connect through `powergit mcp`, a byte-for-byte stdio bridge to a private per-user named pipe on Windows or local socket on Linux/macOS. The endpoint carries no token on disk. PowerGit must be running; a second PowerGit instance does not host another endpoint.

Choose **Silent** for ordinary work that needs no PowerGit session, **Notify** to leave an inbox item while the agent continues, or **Wait** when the owner must review before the agent continues: they accept or reject each change, comment on lines, and send the round back; the agent revises until they approve. Version 1 is local-only: it does not clone, push, synchronize cloud reviews, or support multiple users.

## Configure a client

Claude Code, using the Windows installer location:

```powershell
claude mcp add powergit -- "C:\Users\<you>\AppData\Local\PowerGit\powergit.exe" mcp
```

For an AppImage, substitute its path. During development use `frontend/src-tauri/target/debug/powergit.exe` (or `powergit` on Linux). The equivalent project `.mcp.json` entry is:

```json
{
  "mcpServers": {
    "powergit": {
      "command": "C:\\Users\\<you>\\AppData\\Local\\PowerGit\\powergit.exe",
      "args": ["mcp"]
    }
  }
}
```

Codex uses `~/.codex/config.toml`:

```toml
[mcp_servers.powergit]
command = "C:/Users/<you>/AppData/Local/PowerGit/powergit.exe"
args = ["mcp"]
```

The release Windows binary uses the GUI subsystem, but child-process pipe handles are still inherited; Claude Code and Codex receive the shim's stdout normally.

## Tools and payloads

- `agent_review_open` `{ repo_path, mode: "notify"|"wait", title, why?, agent?, branch?, base_sha?, head_sha?, worktree?, files?: [{ path, status?, patch? }], board?, explanations?: [{ file, line, body }] }` — opens round 1; its patch is captured now. `explanations` justify changes on their lines (see [Explaining your changes](#explaining-your-changes)).
- `agent_review_wait` `{ repo_path, review_id, timeout_ms? }` (clamped 1–120 s) — returns when the owner sends the round back or closes the review.
- `agent_review_get` `{ repo_path, review_id, round?, patches? }` — a round (the latest by default); `patches: true` adds `files: [{ file, status, patch }]`.
- `agent_review_revise` `{ repo_path, review_id, note?, replies?: [{ comment: "c1", body }], head_sha?, files?, explanations?: [{ file, line, body }] }` — opens the next round from the worktree as it is now (or `head_sha`, or the given patches), with explanations of that round's changes.
- `agent_review_list` `{ repo_path }`
- `agent_review_cancel` `{ repo_path, review_id, reason? }`
- `agent_review_comment` `{ repo_path, review_id, reviewer, body, file?, line?, reply_to? }` — a reviewer agent's comment on a line of the round, or with `reply_to: "c3"` its reply in that conversation (see [Reviewing beside the owner](#reviewing-beside-the-owner)).

Since v0.21 (docs/design/agent-review-rounds.md) a review has rounds. The payload of open, wait, get and revise is `{ review_id, status: pending|approved|cancelled|expired, mode, title, round, rounds, turn: "user"|"agent"|null, board, timed_out, note, sent_at, changes: [{ id: "h1", file, origin: new|carried|revised, from, old_lines: [start, end], new_lines: [start, end], verdict: accept|reject|mixed|undecided, rejected_lines }], removed: ["h2"], comments: [{ id: "c1", round, change, file, line: "+12"|"-7", body, kind: round|ask|explain|withdrawn, author, replies: [{ author, body, at }] }], session_file, review_file, export_markdown }`. A comment's `author` is `human` for the owner's, the reviewer agent's name, or for an `explain` comment the author agent (the `agent` passed to open). `turn` is `"user"` while the owner reviews and `"agent"` once a round is sent back. A change keeps its id while its patch text is unchanged (`carried`, with its verdict); a change at an overlapping place is `revised`, `from` the old id. `mixed` means some lines were rejected: `rejected_lines` lists them. Reviews opened before v0.21 return the v0.20 payload (`summary_note`, `comments: [{ path, line, side, body }]`).

A `tools/call` response is `{ content: [{ type: "text", text: <payload JSON> }], structuredContent: <payload> }`; a failure sets `isError: true` and puts the message in the text item. The protocol is JSON-RPC 2.0 over newline-delimited JSON. `initialize` negotiates protocol version `2025-06-18`; `serverInfo.name` is `powergit`.

## The board (PowerChannel)

When [PowerChannel](https://github.com/CynaCons/PowerChannel) is installed (its `channels.db` exists, or the legacy `board.db`), a review gets a channel, returned as `board` (`review-<repo>-<id4>`, or the name passed in `board`). PowerGit posts there: `Round n opened` (as `powergit`), the owner's questions (`c3 · path:line` + text), the round sent back (`Round n sent · …`, one line per rejected, mixed or undecided change with its comments, then `details: agent_review_get review_id=… round=n`), `Approved · …` or `Cancelled · …` (as `human`). The owner can also post on the channel from PowerGit at any time.

The agent's loop, with its PowerChannel name equal to the `agent` it passed to open:

```text
open = powergit.agent_review_open(mode="wait", title, why, agent=<me>, worktree=true | base_sha/head_sha)
if open.board:
  loop:
    msgs = powerchannel.read(me=<me>, channel=open.board, wait_seconds=3600)
    "Round n sent"   → powergit.agent_review_get(review_id, round=n); fix what was rejected
                       or commented; powergit.agent_review_revise(review_id, note, replies=[{comment, body}])
    "Approved"       → commit; stop
    "Cancelled"      → stop
    "cN · path:line" → answer on the board: powerchannel.post(me, open.board, "cN: <answer>")
    "cN withdrawn"   → the owner took question cN back; drop it, no answer
    "cN · path:line" from a reviewer agent → a reviewer's comment; it comes again
                       with the round; you may answer it now with "cN: <answer>"
    anything else from human → answer with powerchannel.post
else:
  powergit.agent_review_wait(...) in a loop, as above without the questions
```

An answer that starts with `cN:` lands under that comment's line in PowerGit. The owner can reply in a comment's conversation; the reply comes as another `cN · path:line` post, a follow-up in that conversation: answer it the same way. PowerChannel 0.4.0 and later (formerly powerboard 0.3.0+) keep a waiting reader's last-seen time fresh, so PowerGit shows the agent as reading the channel; with an older PowerChannel it shows when the agent last read it.

## Explaining your changes

Since v0.21.17 the author agent can justify its changes where they are. Pass `explanations: [{ file, line: "+12"|"-7", body }]` to `agent_review_open` (round 1) or `agent_review_revise` (the new round). The line must be in that round's diff: an added (`+`) or removed (`-`) line, or a context line inside a change. A bad entry refuses the whole call, and nothing is opened.

Each explanation becomes a comment of kind `explain` with your name as `author` (`c1`, `c2` …, numbered with the other comments). It shows under its line as your conversation, marked "explains the change", and the board's `Round n opened` post lists it as `c1 explains path:line: …`. The owner replies in it like in any conversation, and the reply comes as a `c1 · path:line` post: answer it with `c1: …`, or with `replies` on the next revise. Reviewer agents reply with `agent_review_comment { reply_to: "c1" }`. An explanation is your own word: it is not one of the comments the round sends back to you, the owner does not dismiss it, and it stays in later rounds with its change.

Explain what a diff cannot say: why this approach, what was ruled out, what a reader might take for a mistake. One explanation per point, on the line it is about; Markdown is shown.

```json
"explanations": [
  { "file": "src/auth/token.ts", "line": "+42", "body": "Refresh **before** the expiry check, so a token that expires mid-request is renewed once, not twice." }
]
```

## Branch plans

Since v0.22.0 an agent can plan branch work before doing it: rebases, new branches, commits, merges, tags and deletions. PowerGit plays the plan on the repository's graph and checks each step with git; the owner sees it on PowerGit's own graph, scrubs through it step by step, comments on steps, and approves or sends it back. Nothing moves until you run the steps yourself, after approval; PowerGit then ticks each step as the refs show it ran.

- `branch_plan_preview` `{ repo_path, steps }` — checks without opening anything. Returns `steps: [{ n, op, text, result, because, commands, conflicts }]` and `branches_after`.
- `branch_plan_open` `{ repo_path, mode: "notify"|"wait", title, why?, agent?, steps, explanations?: [{ step, body }], board? }` — opens round 1. A step whose result is `invalid` refuses the call with its reason.
- `branch_plan_wait` `{ repo_path, plan_id, timeout_ms? }` — returns when the owner sends the plan back, approves or cancels it; `timed_out: true` means call again.
- `branch_plan_get` `{ repo_path, plan_id }` — the latest round: steps with checks, `done` per step once approved, `moved` (refs that moved since the check), and comments with their `step`.
- `branch_plan_revise` `{ repo_path, plan_id, note?, steps?, replies?: [{ comment, body }], explanations? }` — the next round; without `steps` the same steps are checked again.
- `branch_plan_cancel` `{ repo_path, plan_id, reason? }`.

Steps, in order:

```json
[
  { "op": "rebase", "branch": "feature/auth", "onto": "main" },
  { "op": "branch", "name": "feature/billing", "from": "feature/auth" },
  { "op": "commit", "on": "feature/billing", "subject": "billing: plan model", "files": ["src/billing/plan.ts"] },
  { "op": "merge", "from": "feature/billing", "into": "feature/auth", "mode": "no-ff" },
  { "op": "merge", "from": "feature/auth", "into": "main", "mode": "no-ff" },
  { "op": "cherry-pick", "commits": ["4c2d9e1"], "onto": "release/1.4" },
  { "op": "tag", "name": "v1.5", "at": "main" },
  { "op": "delete", "branch": "feature/billing" }
]
```

What each check means:

- `ok`: git or the refs say it works (a merge into a branch the other side already contains, a clean `git merge-tree`, a free name).
- `conflict`: `git merge-tree --write-tree` stops; `conflicts` names the files, and the owner sees both sides' change to each. Rebases and cherry-picks (since v0.22.1) are replayed commit by commit, as git applies them, and say which commit stops (`stops at 77d0b11 (…) on session.ts`); commits after a stop are not checked. Needs git 2.38 or later; an older git says the check could not run.
- `risk`: planned commits' declared `files` overlap the other side's changes, or a delete would lose commits.
- `unknown`: planned commits nobody can check yet. Declare `files` on planned commits so merges after them can be checked for overlap.
- `invalid`: it cannot run (a missing ref, a taken name, a fast-forward that is not one).

The loop is the review's: comments on steps come on the board as `cN · step n` and with the round when it is sent (`Round n sent · plan …`, one line per comment); answer with `cN: …` or `replies` on revise. After `Approved · plan … · run steps 1 to N`, run the steps with git in order; `branch_plan_get` shows them `done` as the refs move. If the owner's repository moves while the plan waits (`moved` is not empty), PowerGit offers to check it again.

## Reviewing beside the owner

Since v0.21.14 other agents can review a round alongside the owner, so a review mixes agents and the owner on the same changes. A reviewer agent:

1. Finds the review: `agent_review_list { repo_path }`, then `agent_review_get { repo_path, review_id, patches: true }` for the round's patches, its changes and every comment so far.
2. Comments on a line while the owner reviews the round: `agent_review_comment { repo_path, review_id, reviewer: <its name>, file, line: "+12"|"-7", body }`. The reply is the comment (`c4`, `author: <its name>`).
3. Replies in any conversation, at any time while the review is open: `agent_review_comment { …, reviewer, reply_to: "c3", body }`.
4. Reads the board, if the review has one (`board` in the payload), to follow the rounds and answers. A `c3: …` post from any agent also lands as its reply.

The reviewer's comment shows under its line in PowerGit with its name, and on the board under its name as `c4 · path:line` + text. It goes to the author with the round when the owner sends it, named in the round's text (`c4 (codex-review)`), unless the owner dismisses it first; the board then says `c4 dismissed`. Once the round is with the author, a new comment is refused until the next round opens; replies are not. Verdicts, sending a round and approval stay the owner's. The reviewer's name is a PowerChannel name (letters, digits, `.`, `_`, `-`), lower-cased, and never `human` or `powergit`.

## Writing for the owner

Markdown is rendered in `why`, round `note`s, reply and comment `body`s and board posts,
including GitHub-flavoured lists, tables and links. Lead with one sentence
explaining what changed and why, then a `-` list of useful details. Put code
in backticks or fenced blocks with a language. Keep each post focused on one point.

Example `why`:

```markdown
Cancel superseded refreshes so older results cannot replace the latest selection.

- Pass the cancellation token to `GitProcess`.
- Cover overlapping refreshes with an engine test.
```

Example board reply:

```markdown
c3: Kept the previous result visible so refreshing does not clear the selection.

- Replace it only when the latest request completes.
- Ignore cancelled requests.
```

## Agent convention

Use Silent, or Notify when a paper trail is useful, for large refactors and generated noise. Use Wait for engine, release, authentication, or IPC changes. Always give a focused `why` and either base/head SHAs, `worktree: true`, or patches so the UI can anchor the diff.

Wait calls run in bounded slices. If the payload has `timed_out: true`, call `agent_review_wait` again; timeout never means approval. If PowerGit quits during a wait, the review expires with the `host_gone` reason. Approval is the owner's alone; the agent commits after `Approved`, and only then.

Review files live at `.powergit/agent-reviews/<id>.json` (rounds, verdicts, comments, replies); the owner's line marks live at `.powergit/reviews/<id>.json` for round 1 and `.powergit/reviews/<id>-r<n>.json` after. PowerGit adds `/.powergit/` to `.git/info/exclude` so none of them is committed.

## Endpoint rule and troubleshooting

`POWERGIT_MCP_ENDPOINT`, when set, is the complete pipe name or socket path. Otherwise Windows uses `\\.\pipe\PowerGit.mcp.<user>`, where `USERNAME` is lower-cased and every character outside `[a-z0-9_-]` becomes `_`. Linux and macOS use `<data-dir>/mcp.sock`: `POWERGIT_DATA_DIR`, else `$XDG_DATA_HOME/PowerGit`, else `$HOME/.local/share/PowerGit`.

If the shim prints `PowerGit is not running — start it, then retry` and exits 2, start the primary PowerGit instance and retry. A second instance uses the existing host rather than opening another MCP endpoint.
