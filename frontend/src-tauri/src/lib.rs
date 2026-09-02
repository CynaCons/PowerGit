use std::io::{Read, Write};
use std::net::{SocketAddr, TcpListener, TcpStream};
use std::sync::Mutex;
use std::time::Duration;

use tauri::{Manager, RunEvent};
use tauri_plugin_shell::ShellExt;
use tauri_plugin_shell::process::{CommandChild, CommandEvent};

const ENGINE_HOST: &str = "127.0.0.1";
const ENGINE_DEFAULT_PORT: u16 = 7733;
const ENGINE_PROBE_TIMEOUT: Duration = Duration::from_millis(300);

/// Base URL the frontend should call, plus (only when we spawned the
/// sidecar ourselves) its process handle so it can be killed on app exit.
/// `base_url` is resolved synchronously in `setup`, before the webview can
/// run any frontend code, so the `engine_base_url` command never races the
/// port decision (see docs/agents/memories/engine-port.md).
struct EngineState {
    base_url: String,
    child: Mutex<Option<CommandChild>>,
}

/// Tauri command: `frontend/src/engine.ts` calls this once at startup to
/// learn which port the sidecar actually landed on.
#[tauri::command]
fn engine_base_url(state: tauri::State<EngineState>) -> String {
    state.base_url.clone()
}

/// Which port the sidecar should use, decided by `resolve_engine_port`.
enum EnginePort {
    /// A healthy PowerGit engine already answers on this port; reuse it and
    /// do not spawn a second instance.
    Reuse(u16),
    /// Nothing usable is listening here; spawn our sidecar on this port.
    Spawn(u16),
}

/// Decides which port the sidecar should use. The default port is tried
/// first so every existing dev/demo/e2e setup keeps working unchanged; we
/// only fall back to an OS-assigned free port when the default is held by
/// something that doesn't answer like our engine (a leftover instance from
/// a previous run, a crashed process that never released the socket, or an
/// unrelated program squatting on it).
fn resolve_engine_port() -> EnginePort {
    match probe_health(ENGINE_DEFAULT_PORT) {
        Some(true) => EnginePort::Reuse(ENGINE_DEFAULT_PORT),
        Some(false) => EnginePort::Spawn(pick_free_port()),
        None => EnginePort::Spawn(ENGINE_DEFAULT_PORT),
    }
}

/// Connects to `port` on the engine host and issues a minimal, dependency-
/// free `GET /health`. `None` means nothing is listening (port is free to
/// bind); `Some(true)` means a PowerGit engine answered; `Some(false)` means
/// *something* answered but not with our `/health` shape, so the port is
/// occupied by a stranger and must not be reused or rebound.
fn probe_health(port: u16) -> Option<bool> {
    let addr: SocketAddr = format!("{ENGINE_HOST}:{port}").parse().ok()?;
    let mut stream = TcpStream::connect_timeout(&addr, ENGINE_PROBE_TIMEOUT).ok()?;
    let _ = stream.set_read_timeout(Some(ENGINE_PROBE_TIMEOUT));
    let _ = stream.set_write_timeout(Some(ENGINE_PROBE_TIMEOUT));

    let request = format!("GET /health HTTP/1.1\r\nHost: {ENGINE_HOST}\r\nConnection: close\r\n\r\n");
    if stream.write_all(request.as_bytes()).is_err() {
        return Some(false);
    }

    let mut response = String::new();
    if stream.read_to_string(&mut response).is_err() {
        return Some(false);
    }

    Some(looks_like_powergit_health(&response))
}

/// A response only counts as "our engine" when it is a 200 whose body has
/// the `{"engine": "...", "status": "ok", ...}` shape the `/health` route
/// returns (see `HealthResponse` in `src/engine/PowerGit.Engine/GitHost.cs`).
/// Kestrel answers this route with `Transfer-Encoding: chunked` and no
/// `Content-Length` (confirmed by probing the real engine — a minimal-API
/// JSON write is streamed, not buffered, so the length isn't known up
/// front), so the body must be de-chunked before it is valid JSON.
fn looks_like_powergit_health(response: &str) -> bool {
    let Some((head, body)) = response.split_once("\r\n\r\n") else {
        return false;
    };
    if !head.starts_with("HTTP/1.1 200") && !head.starts_with("HTTP/1.0 200") {
        return false;
    }

    let body = if head.to_ascii_lowercase().contains("transfer-encoding: chunked") {
        dechunk(body)
    } else {
        body.to_string()
    };

    let Ok(json) = serde_json::from_str::<serde_json::Value>(&body) else {
        return false;
    };
    let status_ok = json.get("status").and_then(|v| v.as_str()) == Some("ok");
    // Only reuse an engine of OUR version. A leftover sidecar from a previous
    // release answers /health just as happily, and reusing it would pair a
    // new UI with an old API (missing routes look like "nothing happens").
    // A version mismatch is treated like a stranger on the port: the caller
    // spawns our own sidecar on a free port instead.
    let same_version = json.get("engine").and_then(|v| v.as_str()) == Some(env!("CARGO_PKG_VERSION"));
    if status_ok && !same_version {
        eprintln!(
            "[powergit] engine on port answers /health with version {:?}, expected {}; not reusing",
            json.get("engine").and_then(|v| v.as_str()).unwrap_or("?"),
            env!("CARGO_PKG_VERSION")
        );
    }
    status_ok && same_version
}

/// Undoes HTTP/1.1 chunked transfer-coding (`<hex-size>\r\n<data>\r\n...
/// 0\r\n\r\n`): a hand-rolled probe has no HTTP client to do that for it.
/// Uses `str::get` throughout instead of direct indexing so an unexpected
/// byte layout (or a chunk boundary that doesn't land on a UTF-8 char
/// boundary) stops the loop instead of panicking.
fn dechunk(body: &str) -> String {
    let mut out = String::new();
    let mut rest = body;
    loop {
        let Some(line_end) = rest.find("\r\n") else { break };
        let Some(size_line) = rest.get(..line_end) else { break };
        let size_str = size_line.split(';').next().unwrap_or("").trim();
        let Ok(size) = usize::from_str_radix(size_str, 16) else { break };
        if size == 0 {
            break;
        }
        let chunk_start = line_end + 2;
        let Some(chunk_end) = chunk_start.checked_add(size) else { break };
        let Some(chunk) = rest.get(chunk_start..chunk_end) else { break };
        out.push_str(chunk);
        rest = rest.get(chunk_end + 2..).unwrap_or(""); // skip data + trailing CRLF
    }
    out
}

/// Reserves an ephemeral port from the OS by binding then immediately
/// dropping the listener, so the caller can hand that number to a child
/// process it spawns a moment later. There is an inherent, tiny TOCTOU race
/// between the drop and the sidecar's own bind; acceptable here since this
/// only runs on the fallback path where the default port was already taken
/// by something else. Falls back to the default port if even the ephemeral
/// bind fails, which is no worse than the pre-fix behavior.
fn pick_free_port() -> u16 {
    TcpListener::bind((ENGINE_HOST, 0))
        .and_then(|listener| listener.local_addr())
        .map(|addr| addr.port())
        .unwrap_or(ENGINE_DEFAULT_PORT)
}

// The engine sidecar serves git over HTTP. It is spawned at startup (unless
// a healthy instance is already running, see `resolve_engine_port`) and
// left running for the lifetime of the app; the frontend polls /health and
// shows a banner if it never comes up. The child handle lives in managed
// state so `run`'s exit handler can kill it instead of leaking a zombie
// engine process (see docs/agents/memories/engine-port.md).
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![engine_base_url])
        .setup(|app| {
            let (port, reuse_existing) = match resolve_engine_port() {
                EnginePort::Reuse(port) => (port, true),
                EnginePort::Spawn(port) => (port, false),
            };
            app.manage(EngineState {
                base_url: format!("http://{ENGINE_HOST}:{port}"),
                child: Mutex::new(None),
            });

            if reuse_existing {
                println!("[engine] reusing existing PowerGit engine already listening on port {port}");
                return Ok(());
            }
            if port != ENGINE_DEFAULT_PORT {
                println!(
                    "[engine] default port {ENGINE_DEFAULT_PORT} was occupied by another process; spawning sidecar on {port} instead"
                );
            }

            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                let sidecar = handle.shell().sidecar("powergit-engine").expect("sidecar not found");
                let (mut rx, child) = sidecar
                    .args(["--urls", &format!("http://{ENGINE_HOST}:{port}")])
                    .spawn()
                    .expect("failed to spawn powergit-engine sidecar");
                *handle
                    .state::<EngineState>()
                    .child
                    .lock()
                    .expect("engine state mutex poisoned") = Some(child);
                while let Some(event) = rx.recv().await {
                    match event {
                        CommandEvent::Stderr(line) => {
                            println!("[engine] {}", String::from_utf8_lossy(&line));
                        }
                        CommandEvent::Terminated(_) => break,
                        _ => {}
                    }
                }
            });
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building PowerGit")
        .run(|app_handle, event| {
            if !matches!(event, RunEvent::ExitRequested { .. } | RunEvent::Exit) {
                return;
            }
            let Some(child) = app_handle
                .state::<EngineState>()
                .child
                .lock()
                .expect("engine state mutex poisoned")
                .take()
            else {
                return;
            };
            let _ = child.kill();
        });
}
