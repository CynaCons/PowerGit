//! The recovery ladder the owner can drive (v0.15.6).
//!
//! During the Ubuntu freeze the IPC is alive (taskforce, 2026-09-10) but the
//! picture is dead, so the page can ask the shell to try things in order:
//! Ctrl+Shift+F1..F9, Settings -> Tools, or `scripts/freeze-dump.sh recover`
//! through `<log dir>/recover.request`. Each step is logged in engine.log as
//! `recover #<n> <key>: requested`, then `done in <ms>ms` (or `failed: <why>`,
//! or `not available on this platform`), then 3 s later one `probe` readout
//! so the log says whether the ages reset.
//!
//! The command only ENQUEUES a closure on the main thread: nothing here calls
//! a window getter off-thread (those block on the loop we are probing).

use std::sync::atomic::{AtomicU32, Ordering};
use std::time::{Duration, Instant};

use tauri::{AppHandle, Manager};

/// Step keys, index = step - 1.
pub const KEYS: [&str; 9] = [
    "queue_draw",
    "thaw",
    "hide_show",
    "resize",
    "present",
    "frame_sync_off_hide_show",
    "reload",
    "new_window",
    "webview_snapshot",
];

/// Where a request came from, for the log line.
#[derive(Clone, Copy, PartialEq, Eq)]
pub enum Source {
    Command,
    File,
}

/// How long step 9 waits for WebKit's snapshot callback.
const SNAPSHOT_TIMEOUT: Duration = Duration::from_secs(5);
/// The probe readout after a step, once the step had time to take effect.
const READOUT_AFTER: Duration = Duration::from_secs(3);

static COUNTER: AtomicU32 = AtomicU32::new(0);

pub fn key(step: u8) -> Option<&'static str> {
    (1..=9).contains(&step).then(|| KEYS[step as usize - 1])
}

/// "3" or "hide_show" -> 3.
pub fn parse_step(text: &str) -> Option<u8> {
    if let Ok(n) = text.parse::<u8>() {
        return key(n).map(|_| n);
    }
    KEYS.iter().position(|k| *k == text).map(|i| i as u8 + 1)
}

enum Outcome {
    /// Finished inside the closure.
    Done,
    /// Logs its own result later (step 9).
    Pending,
    /// Linux-only step on another platform.
    Unavailable,
}

/// Logs the request and enqueues the step. Returns the step key.
pub fn run(app: &AppHandle, step: u8, source: Source) -> Result<String, String> {
    let key = key(step).ok_or_else(|| format!("unknown recovery step {step}"))?;
    let n = COUNTER.fetch_add(1, Ordering::Relaxed) + 1;
    crate::log(
        app,
        &format!(
            "recover #{n} {key}: requested{}",
            if source == Source::File { " (file)" } else { "" }
        ),
    );
    let handle = app.clone();
    app.run_on_main_thread(move || {
        let started = Instant::now();
        match perform(&handle, n, step) {
            Ok(Outcome::Done) => crate::log(
                &handle,
                &format!("recover #{n} {key}: done in {}ms", started.elapsed().as_millis()),
            ),
            Ok(Outcome::Pending) => {}
            Ok(Outcome::Unavailable) => {
                crate::log(&handle, &format!("recover #{n} {key}: not available on this platform"))
            }
            Err(e) => crate::log(&handle, &format!("recover #{n} {key}: failed: {e}")),
        }
        let h = handle.clone();
        std::thread::spawn(move || {
            std::thread::sleep(READOUT_AFTER);
            crate::log(&h, &format!("recover #{n} {key}: {}", crate::probe_readout(&h)));
        });
    })
    .map_err(|e| e.to_string())?;
    Ok(key.into())
}

/// The step itself. Main thread only: every getter below answers inline there.
fn perform(app: &AppHandle, n: u32, step: u8) -> Result<Outcome, String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "no main window".to_string())?;
    match step {
        1 => queue_draw(&window),
        2 => thaw(&window),
        3 => {
            window.hide().map_err(|e| e.to_string())?;
            window.show().map_err(|e| e.to_string())?;
            Ok(Outcome::Done)
        }
        4 => {
            let size = window.inner_size().map_err(|e| e.to_string())?;
            window
                .set_size(tauri::PhysicalSize::new(size.width + 1, size.height))
                .map_err(|e| e.to_string())?;
            window.set_size(size).map_err(|e| e.to_string())?;
            Ok(Outcome::Done)
        }
        5 => {
            #[cfg(target_os = "linux")]
            {
                use gtk::prelude::*;
                let gtk_window = window.gtk_window().map_err(|e| e.to_string())?;
                gtk_window.present();
            }
            #[cfg(not(target_os = "linux"))]
            window.set_focus().map_err(|e| e.to_string())?;
            Ok(Outcome::Done)
        }
        6 => frame_sync_off_hide_show(app, &window),
        7 => {
            window.reload().map_err(|e| e.to_string())?;
            Ok(Outcome::Done)
        }
        8 => {
            let label = format!("recovery-{n}");
            let size = window.inner_size().map_err(|e| e.to_string())?;
            let scale = window.scale_factor().unwrap_or(1.0);
            tauri::WebviewWindowBuilder::new(app, &label, tauri::WebviewUrl::App("index.html".into()))
                .title(format!("PowerGit (recovery {n})"))
                .inner_size(size.width as f64 / scale, size.height as f64 / scale)
                .decorations(false)
                .build()
                .map_err(|e| e.to_string())?;
            Ok(Outcome::Done)
        }
        9 => webview_snapshot(app, &window, n),
        _ => Err(format!("unknown step {step}")),
    }
}

#[cfg(target_os = "linux")]
fn queue_draw(window: &tauri::WebviewWindow) -> Result<Outcome, String> {
    use gtk::prelude::*;
    window.gtk_window().map_err(|e| e.to_string())?.queue_draw();
    Ok(Outcome::Done)
}

#[cfg(target_os = "linux")]
fn thaw(window: &tauri::WebviewWindow) -> Result<Outcome, String> {
    use gtk::glib::translate::ToGlibPtr;
    use gtk::prelude::*;
    let gtk_window = window.gtk_window().map_err(|e| e.to_string())?;
    let gdk_window = gtk_window
        .window()
        .ok_or_else(|| "toplevel has no GdkWindow".to_string())?;
    gdk_window.thaw_updates();
    // Not in the safe bindings; the GTK-internal toplevel freeze is what
    // gtk_window_present/unmap pair with. Both g_return_if_fail (a stderr
    // critical) when nothing was frozen — harmless.
    // SAFETY: a live GdkWindow owned by the toplevel, on the GTK thread.
    unsafe {
        gtk::gdk::ffi::gdk_window_thaw_toplevel_updates_libgtk_only(gdk_window.to_glib_none().0);
    }
    Ok(Outcome::Done)
}

#[cfg(target_os = "linux")]
fn frame_sync_off_hide_show(app: &AppHandle, window: &tauri::WebviewWindow) -> Result<Outcome, String> {
    let gtk_window = window.gtk_window().map_err(|e| e.to_string())?;
    let state = app.state::<crate::EngineState>();
    crate::probe::disable_frame_sync(app, &gtk_window, &state.probe);
    window.hide().map_err(|e| e.to_string())?;
    window.show().map_err(|e| e.to_string())?;
    Ok(Outcome::Done)
}

#[cfg(not(target_os = "linux"))]
fn queue_draw(_window: &tauri::WebviewWindow) -> Result<Outcome, String> {
    Ok(Outcome::Unavailable)
}

#[cfg(not(target_os = "linux"))]
fn thaw(_window: &tauri::WebviewWindow) -> Result<Outcome, String> {
    Ok(Outcome::Unavailable)
}

#[cfg(not(target_os = "linux"))]
fn frame_sync_off_hide_show(_app: &AppHandle, _window: &tauri::WebviewWindow) -> Result<Outcome, String> {
    Ok(Outcome::Unavailable)
}

/// Step 9: `webkit_web_view_get_snapshot` of the visible region. WebKit
/// answers through the main loop; a 5 s timer on a plain thread reports a
/// missing answer, which is itself the finding.
#[cfg(target_os = "linux")]
fn webview_snapshot(app: &AppHandle, window: &tauri::WebviewWindow, n: u32) -> Result<Outcome, String> {
    use std::sync::atomic::AtomicBool;
    use std::sync::Arc;
    use webkit2gtk::WebViewExt;

    let answered = Arc::new(AtomicBool::new(false));
    let started = Instant::now();
    let handle = app.clone();
    let flag = answered.clone();
    window
        .with_webview(move |webview| {
            webview.inner().snapshot(
                webkit2gtk::SnapshotRegion::Visible,
                webkit2gtk::SnapshotOptions::NONE,
                None::<&webkit2gtk::gio::Cancellable>,
                move |result| {
                    if flag.swap(true, Ordering::Relaxed) {
                        return;
                    }
                    let ms = started.elapsed().as_millis();
                    match result {
                        Ok(_) => crate::log(&handle, &format!("recover #{n} webview_snapshot: done in {ms}ms")),
                        Err(e) => crate::log(&handle, &format!("recover #{n} webview_snapshot: failed: {e}")),
                    }
                },
            );
        })
        .map_err(|e| e.to_string())?;
    let handle = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(SNAPSHOT_TIMEOUT);
        if !answered.swap(true, Ordering::Relaxed) {
            crate::log(
                &handle,
                &format!(
                    "recover #{n} webview_snapshot: timeout after {}ms",
                    SNAPSHOT_TIMEOUT.as_millis()
                ),
            );
        }
    });
    Ok(Outcome::Pending)
}

#[cfg(not(target_os = "linux"))]
fn webview_snapshot(_app: &AppHandle, _window: &tauri::WebviewWindow, _n: u32) -> Result<Outcome, String> {
    Ok(Outcome::Unavailable)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn steps_map_to_the_contract_keys_both_ways() {
        assert_eq!(key(1), Some("queue_draw"));
        assert_eq!(key(9), Some("webview_snapshot"));
        assert_eq!(key(0), None);
        assert_eq!(key(10), None);
        assert_eq!(parse_step("3"), Some(3));
        assert_eq!(parse_step("hide_show"), Some(3));
        assert_eq!(parse_step("frame_sync_off_hide_show"), Some(6));
        assert_eq!(parse_step("12"), None);
        assert_eq!(parse_step("nonsense"), None);
    }
}
