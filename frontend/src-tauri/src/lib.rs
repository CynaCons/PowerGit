use std::net::TcpListener;
use std::sync::Mutex;

use tauri::{Manager, RunEvent};
use tauri_plugin_shell::ShellExt;
use tauri_plugin_shell::process::{CommandChild, CommandEvent};

const ENGINE_HOST: &str = "127.0.0.1";
const ENGINE_DEFAULT_PORT: u16 = 7733;
/// Env var the sidecar reads its shared secret from (see EngineAuth.cs).
const ENGINE_TOKEN_ENV: &str = "POWERGIT_ENGINE_TOKEN";

/// What the frontend needs to talk to the sidecar: where it listens and the
/// per-launch bearer token every request must carry. Both are decided
/// synchronously in `setup`, before the webview can run any frontend code,
/// so the `engine_config` command never races the port decision (see
/// docs/agents/memories/engine-port.md and engine-token.md).
struct EngineState {
    base_url: String,
    token: String,
    child: Mutex<Option<CommandChild>>,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct EngineConfig {
    base_url: String,
    token: String,
}

/// Tauri command: `frontend/src/engine.ts` calls this once at startup.
#[tauri::command]
fn engine_config(state: tauri::State<EngineState>) -> EngineConfig {
    EngineConfig {
        base_url: state.base_url.clone(),
        token: state.token.clone(),
    }
}

/// Picks the port to spawn the sidecar on. The default port is tried first
/// so every existing dev/demo/e2e setup keeps working unchanged; when it is
/// held by anything at all we fall back to an OS-assigned free port. We
/// never reuse a foreign engine: it would not know this launch's token, and
/// the parent-pid watchdog already guarantees no engine of ours outlives us.
fn resolve_engine_port() -> u16 {
    resolve_port_preferring(ENGINE_DEFAULT_PORT)
}

/// `preferred` when it is free, otherwise an OS-assigned free port.
/// Split out so tests can drive it with a port they control.
fn resolve_port_preferring(preferred: u16) -> u16 {
    if port_is_free(preferred) {
        preferred
    } else {
        pick_free_port()
    }
}

/// True when nothing on the engine host holds `port`. Binding (then dropping)
/// is the only reliable, dependency-free probe: a connect attempt would miss
/// a listener that is still starting up.
fn port_is_free(port: u16) -> bool {
    TcpListener::bind((ENGINE_HOST, port)).is_ok()
}

/// Reserves an ephemeral port from the OS by binding then immediately
/// dropping the listener, so the caller can hand that number to a child
/// process it spawns a moment later. There is an inherent, tiny TOCTOU race
/// between the drop and the sidecar's own bind; acceptable here since this
/// only runs on the fallback path where the default port was already taken.
/// Falls back to the default port if even the ephemeral bind fails.
fn pick_free_port() -> u16 {
    TcpListener::bind((ENGINE_HOST, 0))
        .and_then(|listener| listener.local_addr())
        .map(|addr| addr.port())
        .unwrap_or(ENGINE_DEFAULT_PORT)
}

/// 32 random bytes as lowercase hex. Generated once per launch and shared
/// only with the sidecar (env) and the webview (IPC), never written to disk.
fn generate_token() -> String {
    let mut bytes = [0u8; 32];
    getrandom::getrandom(&mut bytes).expect("OS randomness unavailable");
    hex::encode(bytes)
}

// The engine sidecar serves git over HTTP. It is spawned at startup and left
// running for the lifetime of the app; the frontend polls /health and shows
// a banner if it never comes up. The child handle lives in managed state so
// `run`'s exit handler can kill it instead of leaking a zombie engine.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![engine_config])
        .setup(|app| {
            let port = resolve_engine_port();
            let token = generate_token();
            app.manage(EngineState {
                base_url: format!("http://{ENGINE_HOST}:{port}"),
                token: token.clone(),
                child: Mutex::new(None),
            });

            if port != ENGINE_DEFAULT_PORT {
                println!(
                    "[engine] default port {ENGINE_DEFAULT_PORT} was occupied by another process; spawning sidecar on {port} instead"
                );
            }

            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                let sidecar = handle.shell().sidecar("powergit-engine").expect("sidecar not found");
                let (mut rx, child) = sidecar
                    // --parent-pid lets the engine exit with us even when we
                    // are force-killed and never reach RunEvent::Exit below.
                    .args([
                        "--urls",
                        &format!("http://{ENGINE_HOST}:{port}"),
                        "--parent-pid",
                        &std::process::id().to_string(),
                    ])
                    .env(ENGINE_TOKEN_ENV, &token)
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn version_comes_from_package_json_via_build_rs() {
        // v0.13.5: Cargo.toml is a 0.0.0 placeholder; the real version is
        // exported by build.rs from frontend/package.json.
        let v = env!("POWERGIT_VERSION");
        assert_eq!(v.split('.').count(), 3, "{v} is not X.Y.Z");
        assert!(v.split('.').all(|p| p.parse::<u32>().is_ok()), "{v} is not numeric");
        assert_ne!(v, "0.0.0");
    }

    #[test]
    fn token_is_64_lowercase_hex_chars_and_unique() {
        let a = generate_token();
        let b = generate_token();
        assert_eq!(a.len(), 64);
        assert!(a.chars().all(|c| c.is_ascii_hexdigit() && !c.is_ascii_uppercase()));
        assert_ne!(a, b);
    }

    #[test]
    fn preferred_port_is_used_when_free_and_replaced_when_held() {
        // Free: reserve an ephemeral port, drop it, expect it back.
        let free = pick_free_port();
        assert_eq!(resolve_port_preferring(free), free);

        // Held by a "stranger" (any listener counts; we never reuse engines):
        // expect a different, bindable port.
        let stranger = TcpListener::bind((ENGINE_HOST, 0)).expect("bind");
        let held = stranger.local_addr().unwrap().port();
        let chosen = resolve_port_preferring(held);
        assert_ne!(chosen, held);
        assert!(port_is_free(chosen));
    }

    #[test]
    fn picked_port_is_free_and_not_default_when_default_is_held() {
        // Hold the default port (or whatever port we can get) and verify the
        // fallback hands out a different, bindable port.
        let held = TcpListener::bind((ENGINE_HOST, 0)).expect("bind");
        let held_port = held.local_addr().unwrap().port();
        assert!(!port_is_free(held_port));
        let picked = pick_free_port();
        assert_ne!(picked, held_port);
        assert!(port_is_free(picked));
    }
}
