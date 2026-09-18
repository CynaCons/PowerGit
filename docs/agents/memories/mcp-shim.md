# MCP stdio shim

## The argv branch runs first
`frontend/src-tauri/src/main.rs` handles `powergit mcp` before setting GTK/WebKit environment variables and before Tauri starts.

## Windows: a synchronous pipe handle cannot read and write at once
The first shim opened `\.\pipe\…` as a `std::fs::File` and cloned the
handle for the two copy threads. A synchronous named-pipe handle serialises
`ReadFile` and `WriteFile`: the thread parked in the pipe→stdout read held
the handle and the stdin→pipe write of `initialize` waited behind it
forever (mcp-probe.mjs hung with no output, 2026-09-18; a 10-line Python
client reproduced it). The shim now opens the pipe with tokio's
`named_pipe::ClientOptions` (overlapped I/O), splits it, and copies each
direction on its own task (`tokio::task::JoinSet`, the first to finish ends
the bridge). Cargo features: tokio `net`, `io-util`, `io-std`,
`rt-multi-thread`. The Unix branch keeps std's `UnixStream`, which is full
duplex. A TCP loopback in a unit test does not show the pipe rule — the
probe against a live engine does.

## Exit codes describe availability
The shim returns 0 when either copy direction closes. Failure to connect to the running PowerGit host returns 2 after retrying missing/busy Windows pipes for about one second.
