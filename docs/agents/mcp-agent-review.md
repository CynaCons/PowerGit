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

- `agent_review_open` `{ repo_path, mode: "notify"|"wait", title, why?, agent?, branch?, base_sha?, head_sha?, worktree?, files?: [{ path, status?, patch? }], board? }` — opens round 1; its patch is captured now.
- `agent_review_wait` `{ repo_path, review_id, timeout_ms? }` (clamped 1–120 s) — returns when the owner sends the round back or closes the review.
- `agent_review_get` `{ repo_path, review_id, round? }` — a round (the latest by default).
- `agent_review_revise` `{ repo_path, review_id, note?, replies?: [{ comment: "c1", body }], head_sha?, files? }` — opens the next round from the worktree as it is now (or `head_sha`, or the given patches).
- `agent_review_list` `{ repo_path }`
- `agent_review_cancel` `{ repo_path, review_id, reason? }`

Since v0.21 (docs/design/agent-review-rounds.md) a review has rounds. The payload of open, wait, get and revise is `{ review_id, status: pending|approved|cancelled|expired, mode, title, round, rounds, turn: "user"|"agent"|null, board, timed_out, note, sent_at, changes: [{ id: "h1", file, origin: new|carried|revised, from, old_lines: [start, end], new_lines: [start, end], verdict: accept|reject|mixed|undecided, rejected_lines }], removed: ["h2"], comments: [{ id: "c1", round, change, file, line: "+12"|"-7", body, kind: round|ask, replies: [{ author, body, at }] }], session_file, review_file, export_markdown }`. `turn` is `"user"` while the owner reviews and `"agent"` once a round is sent back. A change keeps its id while its patch text is unchanged (`carried`, with its verdict); a change at an overlapping place is `revised`, `from` the old id. `mixed` means some lines were rejected: `rejected_lines` lists them. Reviews opened before v0.21 return the v0.20 payload (`summary_note`, `comments: [{ path, line, side, body }]`).

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
    anything else from human → answer with powerchannel.post
else:
  powergit.agent_review_wait(...) in a loop, as above without the questions
```

An answer that starts with `cN:` lands under that comment's line in PowerGit. PowerChannel 0.4.0 and later (formerly powerboard 0.3.0+) keep a waiting reader's last-seen time fresh, so PowerGit shows the agent as reading the channel; with an older PowerChannel it shows when the agent last read it.

## Writing for the owner

Markdown is rendered in `why`, round `note`s, reply `body`s and board posts,
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
