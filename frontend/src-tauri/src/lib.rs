use std::fs::{self, File, OpenOptions};
use std::io::Write;
use std::net::TcpListener;
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use tauri::{AppHandle, Emitter, Manager, RunEvent};
use tauri_plugin_shell::ShellExt;
use tauri_plugin_shell::process::{CommandChild, CommandEvent};

const ENGINE_HOST: &str = "127.0.0.1";
const ENGINE_DEFAULT_PORT: u16 = 7733;
/// Env var the sidecar reads its shared secret from (see EngineAuth.cs).
const ENGINE_TOKEN_ENV: &str = "POWERGIT_ENGINE_TOKEN";
/// v0.13.11 supervision: at most this many automatic restarts per window,
/// so a sidecar that dies on startup does not spin forever.
const MAX_RESTARTS_PER_WINDOW: u32 = 1;
const RESTART_WINDOW: Duration = Duration::from_secs(60);
const RESTART_BACKOFF: Duration = Duration::from_secs(2);

/// What the frontend needs to talk to the sidecar: where it listens and the
/// per-launch bearer token every request must carry. Both are decided
/// synchronously in `setup`, before the webview can run any frontend code,
/// so the `engine_config` command never races the port decision (see
/// docs/agents/memories/engine-port.md and engine-token.md).
struct EngineState {
    base_url: String,
    port: u16,
    token: String,
    child: Mutex<Option<CommandChild>>,
    /// Timestamped sidecar stderr + exit status, kept on disk for the
    /// recovery panel (v0.13.11). None when the log dir is unavailable.
    log_path: Option<PathBuf>,
    log: Mutex<Option<File>>,
    /// Restart bookkeeping: (count in the current window, window start).
    restarts: Mutex<(u32, Instant)>,
    /// Set on ExitRequested so a Terminated event during shutdown is not
    /// mistaken for a crash.
    exiting: Mutex<bool>,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct EngineConfig {
    base_url: String,
    token: String,
}

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct EngineExited {
    status: String,
    restarting: bool,
}

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct EngineRestarted {
    base_url: String,
}

/// Tauri command: `frontend/src/engine/bootstrap.ts` calls this once at startup.
#[tauri::command]
fn engine_config(state: tauri::State<EngineState>) -> EngineConfig {
    EngineConfig {
        base_url: state.base_url.clone(),
        token: state.token.clone(),
    }
}

/// Tauri command: where the sidecar log lives (shown by the recovery panel).
#[tauri::command]
fn engine_log_path(state: tauri::State<EngineState>) -> Option<String> {
    state.log_path.as_ref().map(|p| p.to_string_lossy().into_owned())
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

/// `YYYY-MM-DDTHH:MM:SS.mmmZ` without pulling in chrono.
fn timestamp() -> String {
    let now = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default();
    let secs = now.as_secs();
    let millis = now.subsec_millis();
    // Civil-from-days (Howard Hinnant), good for any date we will see.
    let days = (secs / 86_400) as i64;
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if m <= 2 { y + 1 } else { y };
    let sod = secs % 86_400;
    format!(
        "{y:04}-{m:02}-{d:02}T{:02}:{:02}:{:02}.{millis:03}Z",
        sod / 3600,
        (sod % 3600) / 60,
        sod % 60
    )
}

/// Appends one line to the engine log (and mirrors it to stdout for `tauri dev`).
fn log_line(state: &EngineState, line: &str) {
    println!("[engine] {line}");
    if let Ok(mut guard) = state.log.lock() {
        if let Some(file) = guard.as_mut() {
            let _ = writeln!(file, "{} {line}", timestamp());
            let _ = file.flush();
        }
    }
}

/// Decides whether the sidecar may be restarted now (v0.13.11): one bounded
/// restart per window, never while the app is shutting down.
fn may_restart(state: &EngineState) -> bool {
    if *state.exiting.lock().expect("exiting flag poisoned") {
        return false;
    }
    let mut restarts = state.restarts.lock().expect("restart state poisoned");
    if restarts.1.elapsed() > RESTART_WINDOW {
        *restarts = (0, Instant::now());
    }
    if restarts.0 >= MAX_RESTARTS_PER_WINDOW {
        return false;
    }
    restarts.0 += 1;
    true
}

/// Spawns the sidecar and supervises it: stderr goes to the log, an exit is
/// reported to the webview (`engine-exited`), and one automatic restart with
/// backoff is attempted (`engine-restarted` follows) before giving up.
fn spawn_engine(handle: AppHandle) {
    tauri::async_runtime::spawn(async move {
        let state = handle.state::<EngineState>();
        let port = state.port;
        let token = state.token.clone();
        let sidecar = handle.shell().sidecar("powergit-engine").expect("sidecar not found");
        let spawned = sidecar
            // --parent-pid lets the engine exit with us even when we
            // are force-killed and never reach RunEvent::Exit below.
            .args([
                "--urls",
                &format!("http://{ENGINE_HOST}:{port}"),
                "--parent-pid",
                &std::process::id().to_string(),
            ])
            .env(ENGINE_TOKEN_ENV, &token)
            .spawn();
        let (mut rx, child) = match spawned {
            Ok(pair) => pair,
            Err(e) => {
                log_line(&state, &format!("failed to spawn sidecar: {e}"));
                let _ = handle.emit(
                    "engine-exited",
                    EngineExited { status: format!("spawn failed: {e}"), restarting: false },
                );
                return;
            }
        };
        log_line(&state, &format!("sidecar started on port {port} (pid {})", child.pid()));
        *state.child.lock().expect("engine state mutex poisoned") = Some(child);

        let mut status = String::from("terminated");
        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stderr(line) => log_line(&state, String::from_utf8_lossy(&line).trim_end()),
                CommandEvent::Stdout(line) => log_line(&state, String::from_utf8_lossy(&line).trim_end()),
                CommandEvent::Error(e) => log_line(&state, &format!("io error: {e}")),
                CommandEvent::Terminated(payload) => {
                    status = match (payload.code, payload.signal) {
                        (Some(code), _) => format!("exit code {code}"),
                        (None, Some(sig)) => format!("signal {sig}"),
                        _ => "terminated".to_string(),
                    };
                    break;
                }
                _ => {}
            }
        }
        *state.child.lock().expect("engine state mutex poisoned") = None;
        if *state.exiting.lock().expect("exiting flag poisoned") {
            log_line(&state, &format!("sidecar stopped during shutdown ({status})"));
            return;
        }
        let restarting = may_restart(&state);
        log_line(
            &state,
            &format!("sidecar exited: {status}{}", if restarting { ", restarting" } else { ", not restarting" }),
        );
        let _ = handle.emit("engine-exited", EngineExited { status: status.clone(), restarting });
        if restarting {
            tokio::time::sleep(RESTART_BACKOFF).await;
            let base_url = state.base_url.clone();
            spawn_engine(handle.clone());
            let _ = handle.emit("engine-restarted", EngineRestarted { base_url });
        }
    });
}

/// Opens (append) the engine log under the app's log dir; None when the dir
/// cannot be created — logging must never block startup.
fn open_engine_log(app: &AppHandle) -> (Option<PathBuf>, Option<File>) {
    let Ok(dir) = app.path().app_log_dir() else { return (None, None) };
    if fs::create_dir_all(&dir).is_err() {
        return (None, None);
    }
    let path = dir.join("engine.log");
    // Keep the file bounded: rotate once past ~2 MB.
    if fs::metadata(&path).map(|m| m.len() > 2 * 1024 * 1024).unwrap_or(false) {
        let _ = fs::rename(&path, dir.join("engine.log.1"));
    }
    let file = OpenOptions::new().create(true).append(true).open(&path).ok();
    (Some(path), file)
}

// The engine sidecar serves git over HTTP. It is spawned at startup and
// supervised for the lifetime of the app; the frontend polls /health and
// shows the recovery panel if it never comes up. The child handle lives in
// managed state so `run`'s exit handler can kill it instead of leaking a
// zombie engine.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![engine_config, engine_log_path])
        .setup(|app| {
            let port = resolve_engine_port();
            let token = generate_token();
            let (log_path, log) = open_engine_log(app.handle());
            app.manage(EngineState {
                base_url: format!("http://{ENGINE_HOST}:{port}"),
                port,
                token,
                child: Mutex::new(None),
                log_path,
                log: Mutex::new(log),
                restarts: Mutex::new((0, Instant::now())),
                exiting: Mutex::new(false),
            });

            let state = app.state::<EngineState>();
            log_line(&state, &format!("PowerGit {} starting", env!("POWERGIT_VERSION")));
            if port != ENGINE_DEFAULT_PORT {
                log_line(
                    &state,
                    &format!("default port {ENGINE_DEFAULT_PORT} was occupied by another process; spawning sidecar on {port} instead"),
                );
            }

            spawn_engine(app.handle().clone());
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building PowerGit")
        .run(|app_handle, event| {
            if !matches!(event, RunEvent::ExitRequested { .. } | RunEvent::Exit) {
                return;
            }
            let state = app_handle.state::<EngineState>();
            *state.exiting.lock().expect("exiting flag poisoned") = true;
            let Some(child) = state.child.lock().expect("engine state mutex poisoned").take() else {
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

    fn state_for_tests() -> EngineState {
        EngineState {
            base_url: String::new(),
            port: 0,
            token: String::new(),
            child: Mutex::new(None),
            log_path: None,
            log: Mutex::new(None),
            restarts: Mutex::new((0, Instant::now())),
            exiting: Mutex::new(false),
        }
    }

    #[test]
    fn restart_budget_is_one_per_window_and_none_while_exiting() {
        let state = state_for_tests();
        assert!(may_restart(&state));
        assert!(!may_restart(&state), "second crash inside the window must not restart");
        // A new window resets the budget.
        *state.restarts.lock().unwrap() = (1, Instant::now() - RESTART_WINDOW - Duration::from_secs(1));
        assert!(may_restart(&state));
        *state.exiting.lock().unwrap() = true;
        assert!(!may_restart(&state));
    }

    #[test]
    fn timestamp_is_iso8601_utc() {
        let t = timestamp();
        assert_eq!(t.len(), 24, "{t}");
        assert!(t.ends_with('Z'));
        assert_eq!(&t[4..5], "-");
        assert_eq!(&t[10..11], "T");
        assert!(t.starts_with("20"));
    }
}
