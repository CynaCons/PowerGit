# MCP stdio shim

## The argv branch runs first
`frontend/src-tauri/src/main.rs` handles `powergit mcp` before setting GTK/WebKit environment variables and before Tauri starts.

## Windows named pipes open as files
The shim opens the byte-mode named-pipe path with a read/write `std::fs::OpenOptions` handle and clones that handle for the two copy directions.

## Exit codes describe availability
The shim returns 0 when either copy direction closes. Failure to connect to the running PowerGit host returns 2 after retrying missing/busy Windows pipes for about one second.
