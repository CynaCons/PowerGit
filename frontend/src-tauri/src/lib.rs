// Compiled everywhere (std only) so Windows/macOS builds type-check and
// unit-test it; only the call in setup() is Linux-only.
#[cfg_attr(not(target_os = "linux"), allow(dead_code))]
mod desktop_integration;
mod crash_hooks;
mod snapshot;
mod tinyhttp;
mod watchdog;

use std::fs::{self, File, OpenOptions};
use std::io::Write;
use std::net::TcpListener;
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use tauri::{AppHandle, Emitter, Manager, RunEvent};
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;

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
    /// v0.14.1 diagnostics: the webview's own log beside engine.log, the
    /// last heartbeat the page sent (None until the first), the last frame
    /// the page painted as reported by that heartbeat (None while the
    /// window is hidden; v0.14.2), the watchdog's memory, the platform's
    /// crash report if any (consumed by the watchdog), and when this shell
    /// started.
    frontend_log: Mutex<Option<File>>,
    last_beat: Mutex<Option<Instant>>,
    last_paint: Mutex<Option<Instant>>,
    watchdog: Mutex<watchdog::Status>,
    crashed: Mutex<Option<String>>,
    /// Recent snapshot-button presses (v0.15.0): two within PRESS_WINDOW
    /// mean the user cannot see the page's answer.
    presses: Mutex<Vec<Instant>>,
    started: Instant,
}

/// Presses of the snapshot button closer together than this count as one
/// "the display is dead" signal.
const PRESS_WINDOW: Duration = Duration::from_secs(15);

#[derive(Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct Incident {
    at: String,
    snapshot: String,
    /// "script", "paint" or "crash" (watchdog::Stall); absent in v0.14.1 files.
    #[serde(default)]
    kind: String,
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
    state
        .log_path
        .as_ref()
        .map(|p| p.to_string_lossy().into_owned())
}

/// Open the inspector for the requesting window, including release builds.
#[tauri::command]
fn open_devtools(window: tauri::WebviewWindow) {
    window.open_devtools();
}

#[tauri::command]
fn app_location() -> Result<String, String> {
    #[cfg(target_os = "linux")]
    if let Some(path) = std::env::var_os("APPIMAGE").filter(|p| !p.is_empty()) {
        return Ok(PathBuf::from(path).to_string_lossy().into_owned());
    }
    std::env::current_exe()
        .map(|p| p.to_string_lossy().into_owned())
        .map_err(|e| e.to_string())
}

/// Tauri command: the page beats every 2 s and says how long ago it last
/// painted a frame (None while hidden). Silence, or beats without frames,
/// is what the watchdog (watchdog.rs) turns into an incident.
#[tauri::command]
fn heartbeat(state: tauri::State<EngineState>, frame_age_ms: Option<f64>) {
    let now = Instant::now();
    *state.last_beat.lock().expect("beat mutex poisoned") = Some(now);
    *state.last_paint.lock().expect("paint mutex poisoned") = frame_age_ms
        .filter(|ms| ms.is_finite() && *ms >= 0.0)
        .map(|ms| now - Duration::from_secs_f64(ms / 1000.0));
}

/// The platform said the web process died (crash_hooks.rs): remembered for
/// the watchdog's next tick, which reloads the webview at once.
fn note_crash(app: &AppHandle, what: String) {
    let state = app.state::<EngineState>();
    log_line(&state, &what);
    *state.crashed.lock().expect("crash mutex poisoned") = Some(what);
}

/// The WebKitGTK the shell links against (Linux); the platform's name elsewhere.
fn webkit_version() -> String {
    #[cfg(target_os = "linux")]
    {
        // SAFETY: plain version getters, no state.
        unsafe {
            format!(
                "webkitgtk {}.{}.{}",
                webkit2gtk::ffi::webkit_get_major_version(),
                webkit2gtk::ffi::webkit_get_minor_version(),
                webkit2gtk::ffi::webkit_get_micro_version()
            )
        }
    }
    #[cfg(windows)]
    {
        "webview2".into()
    }
    #[cfg(not(any(target_os = "linux", windows)))]
    {
        "wkwebview".into()
    }
}

/// How long ago the page painted, as far as the shell knows.
fn paint_age(state: &EngineState) -> Option<Duration> {
    state
        .last_paint
        .lock()
        .expect("paint mutex poisoned")
        .map(|p| p.elapsed())
}

/// The native "restart?" dialog: it is drawn by the OS, not the webview,
/// so it shows even when the page is a black rectangle.
fn ask_restart(app: &AppHandle, why: &str) {
    use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};
    let handle = app.clone();
    app.dialog()
        .message(format!(
            "PowerGit's window stopped updating ({why}) and reloading it did not help. \
             A diagnostic snapshot was saved next to the logs.\n\n\
             Restart PowerGit now? Your repository stays open."
        ))
        .title("PowerGit is not responding")
        .kind(MessageDialogKind::Warning)
        .buttons(MessageDialogButtons::OkCancelCustom(
            "Restart PowerGit".into(),
            "Keep waiting".into(),
        ))
        .show(move |restart| {
            if restart {
                let state = handle.state::<EngineState>();
                log_line(&state, "user chose to restart after the watchdog dialog");
                handle.restart();
            }
        });
}

/// The native "snapshot saved" note for a page that cannot paint its own
/// dialog (v0.14.2, owner: "can't use the Diagnostic snapshot button, it's
/// not responsive" — the button worked, the result never showed).
fn tell_snapshot_path(app: &AppHandle, path: &str) {
    use tauri_plugin_dialog::{DialogExt, MessageDialogKind};
    app.dialog()
        .message(format!("Diagnostic snapshot saved:\n{path}"))
        .title("PowerGit")
        .kind(MessageDialogKind::Info)
        .show(|_| {});
}

/// Tauri command: the page streams its diagnostics here so they exist on
/// disk when the page itself can no longer show them.
#[tauri::command]
fn log_frontend(state: tauri::State<EngineState>, lines: Vec<String>) {
    let mut guard = state.frontend_log.lock().expect("frontend log poisoned");
    if let Some(file) = guard.as_mut() {
        for line in lines {
            let _ = writeln!(file, "{line}");
        }
        let _ = file.flush();
    }
}

/// Tauri command: writes snapshot-<time>.zip in the log dir and returns its
/// path. `frontend` is the page's own dump (empty when the watchdog calls
/// without a responsive page).
#[tauri::command]
fn diagnostic_snapshot(app: AppHandle, frontend: String) -> Result<String, String> {
    let path = write_snapshot(&app, frontend, "button")?;
    let state = app.state::<EngineState>();
    // The page asked, so its script runs; if it has not painted for a while
    // the in-page dialog will never show — say it natively instead.
    let stalled = paint_age(&state).is_some_and(|a| a >= watchdog::PAINT_THRESHOLD);
    // v0.15.0: the owner pressed the button four times in two seconds on a
    // frozen window whose frames the shell still saw as fine. A second
    // press inside PRESS_WINDOW is the user telling us the display is dead:
    // reload the webview; a third press asks natively whether to restart.
    let now = Instant::now();
    let repeated = {
        let mut presses = state.presses.lock().expect("press mutex poisoned");
        presses.retain(|t| now.duration_since(*t) < PRESS_WINDOW);
        presses.push(now);
        presses.len()
    };
    if repeated >= 2 {
        log_line(
            &state,
            &format!("snapshot button pressed {repeated} times in {}s: treating the display as dead", PRESS_WINDOW.as_secs()),
        );
        let action = watchdog::force(&mut state.watchdog.lock().expect("watchdog mutex poisoned"), now);
        apply_watchdog_action(&app, action);
    }
    if stalled || repeated >= 2 {
        tell_snapshot_path(&app, &path);
    }
    Ok(path)
}

/// The side effects of a watchdog decision (shared by the timer loop and
/// the forced path).
fn apply_watchdog_action(app: &AppHandle, action: watchdog::Action) {
    let state = app.state::<EngineState>();
    match action {
        watchdog::Action::None | watchdog::Action::Stalled(_) | watchdog::Action::Recovered(..) => {}
        watchdog::Action::Reload => {
            log_line(&state, "watchdog: reloading the webview");
            *state.last_paint.lock().expect("paint mutex poisoned") = None;
            match app.get_webview_window("main") {
                Some(w) => {
                    if let Err(e) = w.reload() {
                        log_line(&state, &format!("watchdog: reload failed: {e}"));
                    }
                }
                None => log_line(&state, "watchdog: no main window to reload"),
            }
        }
        watchdog::Action::AskRestart => {
            let why = state
                .watchdog
                .lock()
                .expect("watchdog mutex poisoned")
                .stalled
                .map(|(k, _)| k.describe())
                .unwrap_or("stall");
            log_line(&state, "watchdog: still stalled after reload, asking to restart");
            ask_restart(app, why);
        }
    }
}

/// Tauri command: the incident the watchdog recorded during the previous
/// run, if any; cleared once read so the banner shows once.
#[tauri::command]
fn last_incident(app: AppHandle) -> Option<Incident> {
    let path = app.path().app_log_dir().ok()?.join("incident.json");
    let text = fs::read_to_string(&path).ok()?;
    let _ = fs::remove_file(&path);
    serde_json::from_str(&text).ok()
}

/// Tauri command: the log directory (Settings -> Open logs folder).
#[tauri::command]
fn log_dir(app: AppHandle) -> Option<String> {
    app.path()
        .app_log_dir()
        .ok()
        .map(|p| p.to_string_lossy().into_owned())
}

fn log_dir_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_log_dir()
        .map_err(|e| format!("log dir: {e}"))?;
    fs::create_dir_all(&dir).map_err(|e| format!("log dir: {e}"))?;
    Ok(dir)
}

/// Assembles the package (snapshot.rs) from the shell's facts, both logs,
/// the page's dump and the engine's answers, and writes it to the log dir.
fn write_snapshot(app: &AppHandle, frontend: String, trigger: &str) -> Result<String, String> {
    let state = app.state::<EngineState>();
    let dir = log_dir_path(app)?;
    let beat_age = state
        .last_beat
        .lock()
        .expect("beat mutex poisoned")
        .map(|b| format!("{:.1}s ago", b.elapsed().as_secs_f64()))
        .unwrap_or_else(|| "never".into());
    let paint = paint_age(&state)
        .map(|a| format!("{:.1}s ago", a.as_secs_f64()))
        .unwrap_or_else(|| "unknown (hidden or never)".into());
    let unresponsive = {
        let w = state.watchdog.lock().expect("watchdog mutex poisoned");
        match w.stalled {
            Some((kind, since)) => format!(
                "{} stall for {:.0}s{}{}",
                kind.describe(),
                since.elapsed().as_secs_f64(),
                if w.reloaded_at.is_some() { ", webview reloaded" } else { "" },
                if w.asked { ", restart dialog shown" } else { "" }
            ),
            None => "no".into(),
        }
    };
    let crashed = state
        .crashed
        .lock()
        .expect("crash mutex poisoned")
        .clone()
        .unwrap_or_else(|| "no".into());
    // The display stack on Linux is where the v0.14.2 freeze lives; these
    // are the facts the next report needs (see docs/agents/memories/diagnostics.md).
    let env_fact = |name: &str| std::env::var(name).unwrap_or_else(|_| "<unset>".into());
    let nvidia = fs::read_to_string("/proc/driver/nvidia/version")
        .ok()
        .and_then(|s| s.lines().next().map(str::to_owned))
        .unwrap_or_else(|| "none".into());
    let child_pid = state
        .child
        .lock()
        .expect("engine state mutex poisoned")
        .as_ref()
        .map(|c| c.pid().to_string())
        .unwrap_or_else(|| "none".into());
    let restarts = state.restarts.lock().expect("restart mutex poisoned").0;
    let facts = snapshot::shell_facts(&[
        ("powergit", env!("POWERGIT_VERSION").into()),
        ("taken", timestamp()),
        ("trigger", trigger.into()),
        (
            "os",
            format!("{} {}", std::env::consts::OS, std::env::consts::ARCH),
        ),
        ("shell pid", std::process::id().to_string()),
        ("app location", app_location().unwrap_or_else(|e| e)),
        ("XDG_DATA_HOME", env_fact("XDG_DATA_HOME")),
        ("POWERGIT_DATA_DIR", env_fact("POWERGIT_DATA_DIR")),
        (
            "uptime",
            format!("{:.0}s", state.started.elapsed().as_secs_f64()),
        ),
        ("engine port", state.port.to_string()),
        ("engine pid", child_pid),
        ("engine restarts in window", restarts.to_string()),
        ("last webview heartbeat", beat_age),
        ("last webview frame", paint),
        ("webview stalled", unresponsive),
        ("web process crash", crashed),
        ("XDG_SESSION_TYPE", env_fact("XDG_SESSION_TYPE")),
        ("WAYLAND_DISPLAY", env_fact("WAYLAND_DISPLAY")),
        ("GDK_BACKEND", env_fact("GDK_BACKEND")),
        (
            "WEBKIT_DISABLE_DMABUF_RENDERER",
            env_fact("WEBKIT_DISABLE_DMABUF_RENDERER"),
        ),
        (
            "WEBKIT_DISABLE_COMPOSITING_MODE",
            env_fact("WEBKIT_DISABLE_COMPOSITING_MODE"),
        ),
        ("LIBGL_ALWAYS_SOFTWARE", env_fact("LIBGL_ALWAYS_SOFTWARE")),
        ("POWERGIT_WAYLAND", env_fact("POWERGIT_WAYLAND")),
        ("POWERGIT_KEEP_DMABUF", env_fact("POWERGIT_KEEP_DMABUF")),
        ("POWERGIT_KEEP_COMPOSITING", env_fact("POWERGIT_KEEP_COMPOSITING")),
        ("webkit", webkit_version()),
        ("nvidia driver", nvidia),
    ]);
    let mut parts = vec![
        snapshot::Part::text("shell.txt", facts),
        snapshot::Part::text("frontend.json", frontend),
    ];
    for name in [
        "engine.log",
        "engine.log.1",
        "frontend.log",
        "frontend.log.1",
    ] {
        let bytes = fs::read(dir.join(name)).unwrap_or_default();
        if !bytes.is_empty() || !name.ends_with(".1") {
            parts.push(snapshot::Part {
                name: name.into(),
                bytes,
            });
        }
    }
    // Engine facts straight from the sidecar; each is best-effort so a dead
    // engine still yields a package that says so.
    let timeout = Duration::from_secs(3);
    let fetch = |path: &str| match tinyhttp::get(state.port, path, &state.token, timeout) {
        Ok(body) => body,
        Err(e) => serde_json::json!({ "error": e }).to_string(),
    };
    let sessions = fetch("/repos/sessions");
    parts.push(snapshot::Part::text("engine/health.json", fetch("/health")));
    parts.push(snapshot::Part::text(
        "engine/sessions.json",
        sessions.clone(),
    ));
    parts.push(snapshot::Part::text(
        "engine/recents.json",
        fetch("/repos/recents"),
    ));
    if let Ok(serde_json::Value::Array(list)) = serde_json::from_str::<serde_json::Value>(&sessions)
    {
        for session in list {
            if let Some(id) = session.get("id").and_then(|v| v.as_str()) {
                parts.push(snapshot::Part::text(
                    &format!("engine/jobs-{id}.json"),
                    fetch(&format!("/repos/{id}/jobs")),
                ));
            }
        }
    }
    let bytes = snapshot::build_zip(&parts)?;
    let name = format!("snapshot-{}.zip", timestamp().replace(':', "-"));
    let path = dir.join(name);
    fs::write(&path, bytes).map_err(|e| format!("write snapshot: {e}"))?;
    log_line(
        &state,
        &format!(
            "diagnostic snapshot ({trigger}) written to {}",
            path.display()
        ),
    );
    Ok(path.to_string_lossy().into_owned())
}

/// The watchdog loop: watchdog.rs decides, this applies the effects.
fn spawn_watchdog(handle: AppHandle) {
    tauri::async_runtime::spawn(async move {
        loop {
            tokio::time::sleep(watchdog::INTERVAL).await;
            let state = handle.state::<EngineState>();
            if *state.exiting.lock().expect("exiting flag poisoned") {
                return;
            }
            let obs = watchdog::Observation {
                beat_age: state
                    .last_beat
                    .lock()
                    .expect("beat mutex poisoned")
                    .map(|b| b.elapsed()),
                paint_age: paint_age(&state),
                crashed: state
                    .crashed
                    .lock()
                    .expect("crash mutex poisoned")
                    .take()
                    .is_some(),
            };
            let action = watchdog::step(
                obs,
                &mut state.watchdog.lock().expect("watchdog mutex poisoned"),
                Instant::now(),
            );
            match action {
                watchdog::Action::None => {}
                watchdog::Action::Stalled(kind) => {
                    let secs = |d: Option<Duration>| d.map(|a| a.as_secs_f64()).unwrap_or(0.0);
                    log_line(
                        &state,
                        &match kind {
                            watchdog::Stall::Script => format!(
                                "webview unresponsive: no heartbeat for {:.0}s",
                                secs(obs.beat_age)
                            ),
                            watchdog::Stall::Paint => format!(
                                "webview not painting: script beats but no frame for {:.0}s",
                                secs(obs.paint_age)
                            ),
                            watchdog::Stall::Crash => "webview process crashed".into(),
                            watchdog::Stall::Forced => "display declared dead by the user".into(),
                        },
                    );
                    match write_snapshot(&handle, String::new(), "watchdog") {
                        Ok(path) => {
                            if let Ok(dir) = log_dir_path(&handle) {
                                let incident = Incident {
                                    at: timestamp(),
                                    snapshot: path,
                                    kind: kind.describe().into(),
                                };
                                if let Ok(text) = serde_json::to_string(&incident) {
                                    let _ = fs::write(dir.join("incident.json"), text);
                                }
                            }
                        }
                        Err(e) => log_line(&state, &format!("watchdog snapshot failed: {e}")),
                    }
                }
                watchdog::Action::Reload | watchdog::Action::AskRestart => {
                    apply_watchdog_action(&handle, action)
                }
                watchdog::Action::Recovered(kind, took) => {
                    log_line(
                        &state,
                        &format!(
                            "webview responsive again after {:.0}s ({} stall)",
                            took.as_secs_f64(),
                            kind.describe()
                        ),
                    );
                }
            }
        }
    });
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
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default();
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
        let sidecar = handle
            .shell()
            .sidecar("powergit-engine")
            .expect("sidecar not found");
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
                    EngineExited {
                        status: format!("spawn failed: {e}"),
                        restarting: false,
                    },
                );
                return;
            }
        };
        log_line(
            &state,
            &format!("sidecar started on port {port} (pid {})", child.pid()),
        );
        *state.child.lock().expect("engine state mutex poisoned") = Some(child);

        let mut status = String::from("terminated");
        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stderr(line) => {
                    log_line(&state, String::from_utf8_lossy(&line).trim_end())
                }
                CommandEvent::Stdout(line) => {
                    log_line(&state, String::from_utf8_lossy(&line).trim_end())
                }
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
            log_line(
                &state,
                &format!("sidecar stopped during shutdown ({status})"),
            );
            return;
        }
        let restarting = may_restart(&state);
        log_line(
            &state,
            &format!(
                "sidecar exited: {status}{}",
                if restarting {
                    ", restarting"
                } else {
                    ", not restarting"
                }
            ),
        );
        let _ = handle.emit(
            "engine-exited",
            EngineExited {
                status: status.clone(),
                restarting,
            },
        );
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
    let Ok(dir) = app.path().app_log_dir() else {
        return (None, None);
    };
    if fs::create_dir_all(&dir).is_err() {
        return (None, None);
    }
    let path = dir.join("engine.log");
    // Keep the file bounded: rotate once past ~2 MB.
    if fs::metadata(&path)
        .map(|m| m.len() > 2 * 1024 * 1024)
        .unwrap_or(false)
    {
        let _ = fs::rename(&path, dir.join("engine.log.1"));
    }
    let file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
        .ok();
    (Some(path), file)
}

/// frontend.log beside engine.log, same rotation (v0.14.1).
fn open_frontend_log(app: &AppHandle) -> Option<File> {
    let dir = app.path().app_log_dir().ok()?;
    fs::create_dir_all(&dir).ok()?;
    let path = dir.join("frontend.log");
    if fs::metadata(&path)
        .map(|m| m.len() > 2 * 1024 * 1024)
        .unwrap_or(false)
    {
        let _ = fs::rename(&path, dir.join("frontend.log.1"));
    }
    OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
        .ok()
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
        .plugin(tauri_plugin_process::init())
        // In-app updates (v0.14.0): endpoint and public key come from
        // tauri.conf.json (the GitHub release's latest.json). To walk a
        // locally signed build through the flow, build with a --config
        // override of plugins.updater.endpoints (see the release skill).
        .plugin(tauri_plugin_updater::Builder::new().build())
        // Settings -> Open logs folder and the snapshot dialog's "Show in folder".
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            engine_config,
            engine_log_path,
            heartbeat,
            log_frontend,
            open_devtools,
            app_location,
            diagnostic_snapshot,
            last_incident,
            log_dir
        ])
        .setup(|app| {
            let port = resolve_engine_port();
            let token = generate_token();
            let (log_path, log) = open_engine_log(app.handle());
            let frontend_log = open_frontend_log(app.handle());
            app.manage(EngineState {
                base_url: format!("http://{ENGINE_HOST}:{port}"),
                port,
                token,
                child: Mutex::new(None),
                log_path,
                log: Mutex::new(log),
                restarts: Mutex::new((0, Instant::now())),
                exiting: Mutex::new(false),
                frontend_log: Mutex::new(frontend_log),
                last_beat: Mutex::new(None),
                last_paint: Mutex::new(None),
                watchdog: Mutex::new(watchdog::Status::default()),
                crashed: Mutex::new(None),
                presses: Mutex::new(Vec::new()),
                started: Instant::now(),
            });

            let state = app.state::<EngineState>();
            log_line(&state, &format!("PowerGit {} starting", env!("POWERGIT_VERSION")));
            if port != ENGINE_DEFAULT_PORT {
                log_line(
                    &state,
                    &format!("default port {ENGINE_DEFAULT_PORT} was occupied by another process; spawning sidecar on {port} instead"),
                );
            }

            // Linux AppImage: register a desktop entry + icons so GNOME can
            // show our icon (see desktop_integration.rs). Off the startup
            // path's critical section; failures only reach the log.
            #[cfg(target_os = "linux")]
            if let Some(summary) = desktop_integration::integrate(env!("POWERGIT_VERSION")) {
                log_line(&state, &summary);
            }

            spawn_engine(app.handle().clone());
            spawn_watchdog(app.handle().clone());
            crash_hooks::install(app.handle(), note_crash);
            if std::env::var("POWERGIT_DEVTOOLS").as_deref() == Ok("1") {
                if let Some(window) = app.get_webview_window("main") {
                    window.open_devtools();
                    log_line(&state, "developer tools requested at startup");
                }
            }
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building PowerGit")
        .run(|app_handle, event| {
            // Native events survive a stalled page and are flushed to disk.
            if let RunEvent::WindowEvent {
                label,
                event: tauri::WindowEvent::Focused(focused),
                ..
            } = &event {
                let state = app_handle.state::<EngineState>();
                log_line(&state, &format!("window {label} focused={focused}"));
            }
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
        assert!(
            v.split('.').all(|p| p.parse::<u32>().is_ok()),
            "{v} is not numeric"
        );
        assert_ne!(v, "0.0.0");
    }

    #[test]
    fn token_is_64_lowercase_hex_chars_and_unique() {
        let a = generate_token();
        let b = generate_token();
        assert_eq!(a.len(), 64);
        assert!(a
            .chars()
            .all(|c| c.is_ascii_hexdigit() && !c.is_ascii_uppercase()));
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
            frontend_log: Mutex::new(None),
            last_beat: Mutex::new(None),
            last_paint: Mutex::new(None),
            watchdog: Mutex::new(watchdog::Status::default()),
            crashed: Mutex::new(None),
            presses: Mutex::new(Vec::new()),
            started: Instant::now(),
        }
    }

    #[test]
    fn restart_budget_is_one_per_window_and_none_while_exiting() {
        let state = state_for_tests();
        assert!(may_restart(&state));
        assert!(
            !may_restart(&state),
            "second crash inside the window must not restart"
        );
        // A new window resets the budget.
        *state.restarts.lock().unwrap() =
            (1, Instant::now() - RESTART_WINDOW - Duration::from_secs(1));
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
