# MCP host

## Endpoint derivation is shared
`POWERGIT_MCP_ENDPOINT` overrides the full endpoint. Otherwise Windows uses `\\.\pipe\PowerGit.mcp.<user>`, with the lower-case user name restricted to `[a-z0-9_-]`, while Unix uses `<RecentsStore.DataDir>/mcp.sock`. The engine exposes this as `McpEndpoint.Resolve()`; the client shim must apply the same rule.

## The OS is the authentication boundary
Windows grants the current SID full control on the named pipe and no other rule. Unix sets the data directory to `0700` and socket to `0600`. No MCP token is stored on disk.

## Framing is MCP stdio framing
Each UTF-8 JSON-RPC 2.0 message occupies one newline-terminated line. A trailing carriage return is tolerated, and batch arrays receive batch responses.

## Tool failures are results
An MCP tool failure returns `isError: true` with text content. Protocol failures such as an unknown JSON-RPC method use JSON-RPC errors.

## Writes are serialized per connection
Requests, including long waits, dispatch independently so later messages and other clients continue. A per-connection semaphore keeps their response lines from interleaving.
