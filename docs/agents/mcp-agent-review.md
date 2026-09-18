# Agent review over MCP

PowerGit hosts a same-machine MCP review gate in its engine sidecar. Coding agents connect through `powergit mcp`, a byte-for-byte stdio bridge to a private per-user named pipe on Windows or local socket on Linux/macOS. The endpoint carries no token on disk. PowerGit must be running; a second PowerGit instance does not host another endpoint.

Choose **Silent** for ordinary work that needs no PowerGit session, **Notify** to leave an inbox item while the agent continues, or **Wait** when the owner must approve or request changes before the agent continues. Version 1 is local-only: it does not clone, push, synchronize cloud reviews, or support multiple users.

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

- `agent_review_open` `{ repo_path, mode: "notify"|"wait", title, why?, agent?, branch?, base_sha?, head_sha?, worktree?, files?: [{ path, status?, patch? }] }`
- `agent_review_wait` `{ repo_path, review_id, timeout_ms? }` (clamped 1–120 s)
- `agent_review_get` `{ repo_path, review_id }`
- `agent_review_list` `{ repo_path }`
- `agent_review_cancel` `{ repo_path, review_id, reason? }`

The payload is `{ review_id, status: pending|approved|changes_requested|cancelled|expired, mode, title, timed_out?, summary_note, comments: [{ path, line: "+12"|"-7", side: "new"|"old", body }], session_file, review_file, export_markdown }`. A `tools/call` response is `{ content: [{ type: "text", text: <payload JSON> }], structuredContent: <payload> }`; a failure sets `isError: true` and puts the message in the text item.

The protocol is JSON-RPC 2.0 over newline-delimited JSON. `initialize` negotiates protocol version `2025-06-18`; `serverInfo.name` is `powergit`.

## Agent convention

Use Silent, or Notify when a paper trail is useful, for large refactors and generated noise. Use Wait for engine, release, authentication, or IPC changes. Always give a one-line `why` and either base/head SHAs or patches so the UI can anchor the diff.

Wait calls run in bounded slices. If the payload has `timed_out: true`, call `agent_review_wait` again; timeout never means approval. If PowerGit quits during a wait, the session expires with the `host_gone` reason.

Session files live at `.powergit/agent-reviews/<id>.json`; review comments and marks live at `.powergit/reviews/<id>.json`. PowerGit adds `/.powergit/` to `.git/info/exclude` so neither file is committed.

## Endpoint rule and troubleshooting

`POWERGIT_MCP_ENDPOINT`, when set, is the complete pipe name or socket path. Otherwise Windows uses `\\.\pipe\PowerGit.mcp.<user>`, where `USERNAME` is lower-cased and every character outside `[a-z0-9_-]` becomes `_`. Linux and macOS use `<data-dir>/mcp.sock`: `POWERGIT_DATA_DIR`, else `$XDG_DATA_HOME/PowerGit`, else `$HOME/.local/share/PowerGit`.

If the shim prints `PowerGit is not running — start it, then retry` and exits 2, start the primary PowerGit instance and retry. A second instance uses the existing host rather than opening another MCP endpoint.
