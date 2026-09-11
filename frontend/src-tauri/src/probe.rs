//! Paint probe and liveness thread (v0.15.6).
//!
//! The taskforce of 2026-09-10 (docs/agents/context/ubuntu-freeze-taskforce-
//! 2026-09-10.md) established that during the owner's freezes the GLib main
//! loop is alive: IPC heartbeats and snapshot presses keep being dispatched
//! by it. What dies is the presentation of the main window, and nothing the
//! shell measured touched the paint path. This module does:
//!
//! - GdkFrameClock `after-paint` on the main toplevel (count + timestamp). A
//!   frozen clock (H1: GTK3's X11 backend waiting for a `_NET_WM_FRAME_DRAWN`
//!   mutter never sends) stops this counter while every other GSource keeps
//!   running. Reconnected on `map` because realize can hand out a new clock.
//!   Never `add_tick_callback`: a tick callback keeps the clock busy and would
//!   hide the very thing we are looking for.
//! - `draw` on the toplevel and on the WebKitWebView (timestamps), whether the
//!   toplevel is mapped, and whether `draw` runs on the tao main thread
//!   (`gettid`; the H4 residual about rfd's GTK thread).
//! - A 1 px `queue_draw_area` stimulus every 2 s, so a healthy clock always
//!   has something to paint and the ages above mean something.
//! - `POWERGIT_NO_FRAME_SYNC=1`: X11 frame sync off after realize, the
//!   fallback experiment for owners who must stay on x11.
//! - The `powergit-liveness` thread: every 2 s it round-trips a
//!   `run_on_main_thread` closure and a `glib::idle_add_full` source, records
//!   rtt and completion time, rewrites `<log dir>/probe.txt` atomically (every
//!   10 s, and at once when an age crosses its threshold), logs the `probe:`
//!   readout (30 s healthy, 5 s stale), polls `<log dir>/recover.request`, and
//!   hands a dead loop to the watchdog. Never `MainContext::invoke`: it runs
//!   the closure on the caller when the context has no owner.
//!
//! Every GTK call happens on the main thread (setup, signal handlers, or a
//! `run_on_main_thread` closure). Everything shared is an atomic, so the
//! liveness thread and the watchdog read without locks and without the main
//! thread. `POWERGIT_PROBE_PAINT=0` switches the whole thing off.

use std::fs;
use std::path::Path;
use std::sync::atomic::{AtomicBool, AtomicU64, AtomicU8, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use tauri::{AppHandle, Manager};

/// A round-trip older than this means the main loop is not dispatching
/// (watchdog::LOOP_THRESHOLD).
pub const LOOP_STALE: Duration = Duration::from_secs(15);
/// No GTK paint / draw for this long on a mapped window is a presentation
/// stall (watchdog::PRESENTATION_THRESHOLD).
pub const PAINT_STALE: Duration = Duration::from_secs(20);
const ROUND_TRIP_EVERY: Duration = Duration::from_secs(2);
const FILE_EVERY: Duration = Duration::from_secs(10);
const READOUT_HEALTHY: Duration = Duration::from_secs(30);
const READOUT_STALE: Duration = Duration::from_secs(5);

/// An instant in an atomic: microseconds since the probe's epoch plus one,
/// 0 meaning "never".
struct Stamp(AtomicU64);

impl Stamp {
    const fn new() -> Stamp {
        Stamp(AtomicU64::new(0))
    }

    fn set(&self, epoch: Instant, at: Instant) {
        let micros = at.saturating_duration_since(epoch).as_micros() as u64;
        self.0.store(micros + 1, Ordering::Relaxed);
    }

    fn get(&self, epoch: Instant) -> Option<Instant> {
        match self.0.load(Ordering::Relaxed) {
            0 => None,
            v => Some(epoch + Duration::from_micros(v - 1)),
        }
    }

    fn age(&self, epoch: Instant) -> Option<Duration> {
        self.get(epoch).map(|t| t.elapsed())
    }
}

/// A duration in an atomic (micros + 1, 0 = none).
struct Span(AtomicU64);

impl Span {
    const fn new() -> Span {
        Span(AtomicU64::new(0))
    }

    fn set(&self, d: Duration) {
        self.0.store(d.as_micros() as u64 + 1, Ordering::Relaxed);
    }

    fn get(&self) -> Option<Duration> {
        match self.0.load(Ordering::Relaxed) {
            0 => None,
            v => Some(Duration::from_micros(v - 1)),
        }
    }
}

pub struct Probe {
    epoch: Instant,
    /// False with POWERGIT_PROBE_PAINT=0: nothing is hooked, every field
    /// stays "n/a".
    pub enabled: bool,
    after_paint_count: AtomicU64,
    after_paint: Stamp,
    paint_requested: Stamp,
    toplevel_draw: Stamp,
    webview_draw: Stamp,
    mapped: AtomicBool,
    /// 0 unknown, 1 the tao main thread, 2 some other thread.
    draw_thread: AtomicU8,
    main_tid: AtomicU64,
    loop_tauri_done: Stamp,
    loop_tauri_rtt: Span,
    loop_glib_done: Stamp,
    loop_glib_rtt: Span,
    gdk_backend: Mutex<String>,
    frame_sync: Mutex<String>,
}

impl Probe {
    pub fn new(enabled: bool) -> Probe {
        Probe {
            epoch: Instant::now(),
            enabled,
            after_paint_count: AtomicU64::new(0),
            after_paint: Stamp::new(),
            paint_requested: Stamp::new(),
            toplevel_draw: Stamp::new(),
            webview_draw: Stamp::new(),
            mapped: AtomicBool::new(false),
            draw_thread: AtomicU8::new(0),
            main_tid: AtomicU64::new(0),
            loop_tauri_done: Stamp::new(),
            loop_tauri_rtt: Span::new(),
            loop_glib_done: Stamp::new(),
            loop_glib_rtt: Span::new(),
            gdk_backend: Mutex::new("n/a".into()),
            frame_sync: Mutex::new("n/a".into()),
        }
    }

    /// Age of the last completed tauri round-trip (`run_on_main_thread`).
    pub fn loop_age(&self) -> Option<Duration> {
        self.loop_tauri_done.age(self.epoch)
    }

    /// Age of the last completed glib round-trip (`idle_add_full`).
    pub fn loop_glib_age(&self) -> Option<Duration> {
        self.loop_glib_done.age(self.epoch)
    }

    /// Age of the last GdkFrameClock after-paint, but only while the window
    /// is mapped and the page reports frames (`page_frames`): an unmapped or
    /// hidden window legitimately does not paint.
    pub fn gdk_paint_age(&self, page_frames: bool) -> Option<Duration> {
        if !self.mapped.load(Ordering::Relaxed) || !page_frames {
            return None;
        }
        self.after_paint.age(self.epoch)
    }

    pub fn is_mapped(&self) -> bool {
        self.mapped.load(Ordering::Relaxed)
    }

    /// Any age past its threshold: the liveness thread writes and logs faster.
    pub fn stale(&self, page_frames: bool) -> bool {
        let over = |a: Option<Duration>, t: Duration| a.is_some_and(|a| a >= t);
        let mapped = self.is_mapped();
        over(self.loop_age(), LOOP_STALE)
            || over(self.loop_glib_age(), LOOP_STALE)
            || over(self.gdk_paint_age(page_frames), PAINT_STALE)
            || (mapped && over(self.toplevel_draw.age(self.epoch), PAINT_STALE))
            || (mapped && over(self.webview_draw.age(self.epoch), PAINT_STALE))
    }

    fn set_gdk_backend(&self, s: &str) {
        if let Ok(mut b) = self.gdk_backend.lock() {
            *b = s.into();
        }
    }

    fn set_frame_sync(&self, s: &str) {
        if let Ok(mut f) = self.frame_sync.lock() {
            *f = s.into();
        }
    }

    fn text(m: &Mutex<String>) -> String {
        m.lock().map(|s| s.clone()).unwrap_or_else(|_| "n/a".into())
    }

    fn draw_thread_is_main(&self) -> &'static str {
        match self.draw_thread.load(Ordering::Relaxed) {
            1 => "true",
            2 => "false",
            _ => "n/a",
        }
    }

    /// The engine.log readout line (also reused after each recovery step).
    pub fn readout(&self, beat_age: Option<Duration>, frame_age: Option<Duration>) -> String {
        let e = self.epoch;
        format!(
            "probe: loop tauri {}/{} glib {}/{} | gdk paint {} (req {}) n={} | toplevel draw {} | webview draw {} | {} | beat {} | frame {}",
            ms(self.loop_tauri_rtt.get()),
            secs(self.loop_tauri_done.age(e)),
            ms(self.loop_glib_rtt.get()),
            secs(self.loop_glib_done.age(e)),
            secs(self.after_paint.age(e)),
            secs(self.paint_requested.age(e)),
            self.after_paint_count.load(Ordering::Relaxed),
            secs(self.toplevel_draw.age(e)),
            secs(self.webview_draw.age(e)),
            if self.is_mapped() { "mapped" } else { "unmapped" },
            secs(beat_age),
            secs(frame_age),
        )
    }

    /// The probe.txt fields (without `written=`), also copied into shell.txt.
    pub fn fields(&self, beat_age: Option<Duration>, frame_age: Option<Duration>) -> Vec<(&'static str, String)> {
        let e = self.epoch;
        vec![
            ("loop_tauri_rtt_ms", num_ms(self.loop_tauri_rtt.get())),
            ("loop_tauri_age_s", num_s(self.loop_tauri_done.age(e))),
            ("loop_glib_rtt_ms", num_ms(self.loop_glib_rtt.get())),
            ("loop_glib_age_s", num_s(self.loop_glib_done.age(e))),
            ("gdk_after_paint_count", self.after_paint_count.load(Ordering::Relaxed).to_string()),
            ("gdk_after_paint_age_s", num_s(self.after_paint.age(e))),
            ("gdk_paint_requested_age_s", num_s(self.paint_requested.age(e))),
            ("toplevel_draw_age_s", num_s(self.toplevel_draw.age(e))),
            ("webview_draw_age_s", num_s(self.webview_draw.age(e))),
            ("window_mapped", self.is_mapped().to_string()),
            ("beat_age_s", num_s(beat_age)),
            ("frame_age_s", num_s(frame_age)),
            ("gdk_backend", Self::text(&self.gdk_backend)),
            ("frame_sync", Self::text(&self.frame_sync)),
            ("draw_thread_is_main", self.draw_thread_is_main().into()),
        ]
    }

    /// The main-thread half of a tauri round-trip.
    fn tauri_round_trip_done(&self, sent: Instant) {
        let now = Instant::now();
        self.loop_tauri_rtt.set(now.saturating_duration_since(sent));
        self.loop_tauri_done.set(self.epoch, now);
    }

    #[cfg(target_os = "linux")]
    fn glib_round_trip_done(&self, sent: Instant) {
        let now = Instant::now();
        self.loop_glib_rtt.set(now.saturating_duration_since(sent));
        self.loop_glib_done.set(self.epoch, now);
    }
}

fn secs(d: Option<Duration>) -> String {
    d.map(|d| format!("{:.1}s", d.as_secs_f64())).unwrap_or_else(|| "n/a".into())
}

fn ms(d: Option<Duration>) -> String {
    d.map(|d| format!("{:.1}ms", d.as_secs_f64() * 1000.0)).unwrap_or_else(|| "n/a".into())
}

fn num_s(d: Option<Duration>) -> String {
    d.map(|d| format!("{:.1}", d.as_secs_f64())).unwrap_or_else(|| "n/a".into())
}

fn num_ms(d: Option<Duration>) -> String {
    d.map(|d| format!("{:.1}", d.as_secs_f64() * 1000.0)).unwrap_or_else(|| "n/a".into())
}

/// `<log dir>/probe.txt`, written whole under a temporary name and renamed
/// into place so a reader (freeze-dump.sh) never sees half a file.
fn write_file(dir: &Path, probe: &Probe, beat_age: Option<Duration>, frame_age: Option<Duration>) {
    let mut text = format!("written={}\n", crate::timestamp());
    for (k, v) in probe.fields(beat_age, frame_age) {
        text.push_str(k);
        text.push('=');
        text.push_str(&v);
        text.push('\n');
    }
    let tmp = dir.join("probe.txt.tmp");
    if fs::write(&tmp, text).is_ok() {
        let _ = fs::rename(&tmp, dir.join("probe.txt"));
    }
}

/// `<log dir>/recover.request`: a step number or key written by
/// `scripts/freeze-dump.sh recover`. Consumed (deleted) whether or not it
/// parses, so a typo does not run every 2 s.
fn poll_recover_request(app: &AppHandle, dir: &Path) {
    let path = dir.join("recover.request");
    let Ok(text) = fs::read_to_string(&path) else {
        return;
    };
    let _ = fs::remove_file(&path);
    let text = text.trim();
    match crate::recovery::parse_step(text) {
        Some(step) => {
            let _ = crate::recovery::run(app, step, crate::recovery::Source::File);
        }
        None => crate::log(app, &format!("recover.request ignored: {text:?} is not a step")),
    }
}

/// The 1 px stimulus: asks the toplevel for a paint so the frame clock has
/// work. Main thread only.
#[cfg(target_os = "linux")]
fn stimulate(app: &AppHandle, probe: &Probe) {
    use gtk::prelude::*;
    if let Some(w) = app.get_webview_window("main").and_then(|w| w.gtk_window().ok()) {
        w.queue_draw_area(0, 0, 1, 1);
        probe.paint_requested.set(probe.epoch, Instant::now());
    }
}

/// The `powergit-liveness` thread. Everything it does is off the main
/// thread; the main thread only ever runs the two tiny closures it sends.
pub fn spawn_liveness(app: AppHandle, probe: Arc<Probe>) {
    let dir = app.path().app_log_dir().ok();
    let spawned = std::thread::Builder::new()
        .name("powergit-liveness".into())
        .spawn(move || {
            let mut last_file = Instant::now() - FILE_EVERY;
            let mut last_readout = Instant::now();
            let mut was_stale = false;
            loop {
                std::thread::sleep(ROUND_TRIP_EVERY);
                if crate::is_exiting(&app) {
                    return;
                }
                let sent = Instant::now();
                {
                    let p = probe.clone();
                    let h = app.clone();
                    let _ = app.run_on_main_thread(move || {
                        p.tauri_round_trip_done(sent);
                        #[cfg(target_os = "linux")]
                        stimulate(&h, &p);
                        #[cfg(not(target_os = "linux"))]
                        let _ = &h;
                    });
                }
                #[cfg(target_os = "linux")]
                {
                    let p = probe.clone();
                    gtk::glib::idle_add_full(gtk::glib::Priority::DEFAULT, move || {
                        p.glib_round_trip_done(sent);
                        gtk::glib::ControlFlow::Break
                    });
                }
                if let Some(dir) = dir.as_deref() {
                    poll_recover_request(&app, dir);
                }
                let (beat_age, frame_age) = crate::heartbeat_ages(&app);
                let stale = probe.stale(frame_age.is_some());
                let now = Instant::now();
                if let Some(dir) = dir.as_deref() {
                    if stale != was_stale || now.saturating_duration_since(last_file) >= FILE_EVERY {
                        write_file(dir, &probe, beat_age, frame_age);
                        last_file = now;
                    }
                }
                let every = if stale { READOUT_STALE } else { READOUT_HEALTHY };
                if stale != was_stale || now.saturating_duration_since(last_readout) >= every {
                    crate::log(&app, &probe.readout(beat_age, frame_age));
                    last_readout = now;
                }
                was_stale = stale;
                // A dead loop is the one stall the watchdog's own timer may
                // never get to report in time; hand it over from here. The
                // state machine records it once and never asks the loop for
                // anything (watchdog::Stall::Loop).
                if probe.loop_age().is_some_and(|a| a >= LOOP_STALE) {
                    crate::watchdog_tick(&app);
                }
            }
        });
    if spawned.is_err() {
        eprintln!("liveness thread not started");
    }
}

/// Hooks the GTK side. Main thread only (called from setup).
#[cfg(target_os = "linux")]
pub fn install(app: &AppHandle, probe: Arc<Probe>) {
    use gtk::glib;
    use gtk::prelude::*;
    use std::cell::RefCell;
    use std::rc::Rc;

    let Some(window) = app.get_webview_window("main") else {
        crate::log(app, "paint probe: no main window");
        return;
    };
    let gtk_window = match window.gtk_window() {
        Ok(w) => w,
        Err(e) => {
            crate::log(app, &format!("paint probe: no gtk window: {e}"));
            return;
        }
    };
    probe.main_tid.store(current_tid(), Ordering::Relaxed);

    let backend = gtk::gdk::Display::default()
        .map(|d| d.type_().name().to_string())
        .unwrap_or_default();
    let backend = match backend.as_str() {
        "GdkX11Display" => "x11".to_string(),
        "GdkWaylandDisplay" => "wayland".to_string(),
        "" => "unknown".to_string(),
        other => other.trim_start_matches("Gdk").trim_end_matches("Display").to_lowercase(),
    };
    probe.set_frame_sync(if backend == "x11" { "enabled" } else { "n/a" });
    probe.set_gdk_backend(&backend);
    crate::log(app, &format!("paint probe: gdk backend {backend}"));

    // The toplevel's draw: timestamp plus which thread runs it.
    {
        let p = probe.clone();
        gtk_window.connect_draw(move |_, _| {
            p.toplevel_draw.set(p.epoch, Instant::now());
            let is_main = current_tid() == p.main_tid.load(Ordering::Relaxed);
            p.draw_thread.store(if is_main { 1 } else { 2 }, Ordering::Relaxed);
            glib::Propagation::Proceed
        });
    }

    // The frame clock: (re)connected on realize and on map, because realize
    // can hand out a new clock and the old one's after-paint would then count
    // nothing. The slot remembers which clock is hooked.
    let slot: Rc<RefCell<Option<(gtk::gdk::FrameClock, glib::SignalHandlerId)>>> = Rc::new(RefCell::new(None));
    let hook_clock = {
        let probe = probe.clone();
        let slot = slot.clone();
        move |w: &gtk::ApplicationWindow| {
            let Some(clock) = w.frame_clock() else {
                return;
            };
            let mut slot = slot.borrow_mut();
            if let Some((old, _)) = slot.as_ref() {
                if *old == clock {
                    return;
                }
            }
            if let Some((old, id)) = slot.take() {
                old.disconnect(id);
            }
            let p = probe.clone();
            let id = clock.connect_after_paint(move |_| {
                p.after_paint_count.fetch_add(1, Ordering::Relaxed);
                p.after_paint.set(p.epoch, Instant::now());
            });
            *slot = Some((clock, id));
        }
    };
    let no_frame_sync = std::env::var("POWERGIT_NO_FRAME_SYNC").as_deref() == Ok("1");
    {
        let hook = hook_clock.clone();
        let p = probe.clone();
        let h = app.clone();
        gtk_window.connect_realize(move |w| {
            hook(w);
            if no_frame_sync {
                disable_frame_sync(&h, w, &p);
            }
        });
    }
    {
        let hook = hook_clock.clone();
        let p = probe.clone();
        gtk_window.connect_map(move |w| {
            p.mapped.store(true, Ordering::Relaxed);
            hook(w);
        });
    }
    {
        let p = probe.clone();
        gtk_window.connect_unmap(move |_| {
            p.mapped.store(false, Ordering::Relaxed);
        });
    }
    if gtk_window.is_realized() {
        hook_clock(&gtk_window);
        if no_frame_sync {
            disable_frame_sync(app, &gtk_window, &probe);
        }
    }
    if gtk_window.is_mapped() {
        probe.mapped.store(true, Ordering::Relaxed);
    }

    // The WebKitWebView's own draw, the last hop before pixels.
    let p = probe.clone();
    let hooked = window.with_webview(move |webview| {
        webview.inner().connect_draw(move |_, _| {
            p.webview_draw.set(p.epoch, Instant::now());
            glib::Propagation::Proceed
        });
    });
    if let Err(e) = hooked {
        crate::log(app, &format!("paint probe: webview draw not hooked: {e}"));
    }
}

/// `gdk_x11_window_set_frame_sync_enabled(FALSE)` on the toplevel's
/// GdkWindow: GTK stops waiting for `_NET_WM_FRAME_DRAWN` before the next
/// frame, which is exactly the wait H1 says never ends. Main thread only.
#[cfg(target_os = "linux")]
pub fn disable_frame_sync(app: &AppHandle, gtk_window: &gtk::ApplicationWindow, probe: &Probe) {
    use gtk::prelude::*;
    match gtk_window
        .window()
        .and_then(|w| w.downcast::<gdkx11::X11Window>().ok())
    {
        Some(x11) => {
            x11.set_frame_sync_enabled(false);
            probe.set_frame_sync("disabled");
            crate::log(app, "frame sync disabled (X11)");
        }
        None => {
            probe.set_frame_sync("n/a");
            crate::log(app, "frame sync: not an X11 window");
        }
    }
}

#[cfg(target_os = "linux")]
fn current_tid() -> u64 {
    // SAFETY: gettid has no preconditions.
    unsafe { libc::gettid() as u64 }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_fresh_probe_reads_n_a_everywhere() {
        let p = Probe::new(true);
        let line = p.readout(None, None);
        assert!(line.starts_with("probe: loop tauri n/a/n/a glib n/a/n/a | gdk paint n/a (req n/a) n=0 |"), "{line}");
        assert!(line.ends_with("| unmapped | beat n/a | frame n/a"), "{line}");
        assert!(!p.stale(true));
        assert_eq!(p.gdk_paint_age(true), None);
        let fields = p.fields(None, None);
        assert_eq!(fields.len(), 15);
        assert!(fields.iter().any(|(k, v)| *k == "window_mapped" && v == "false"));
        assert!(fields.iter().any(|(k, v)| *k == "draw_thread_is_main" && v == "n/a"));
    }

    #[test]
    fn a_completed_round_trip_has_an_rtt_and_an_age() {
        let p = Probe::new(true);
        let sent = Instant::now() - Duration::from_millis(3);
        p.tauri_round_trip_done(sent);
        assert!(p.loop_tauri_rtt.get().unwrap() >= Duration::from_millis(3));
        assert!(p.loop_age().unwrap() < Duration::from_secs(1));
        assert!(!p.stale(true));
    }

    #[test]
    fn an_old_round_trip_is_stale_and_an_unmapped_window_never_is_a_paint_stall() {
        let p = Probe::new(true);
        // Backdate the epoch-relative stamp: a round-trip that completed at the epoch.
        p.loop_tauri_done.0.store(1, Ordering::Relaxed);
        assert!(p.loop_age().unwrap() < LOOP_STALE);
        let p = Probe {
            epoch: Instant::now() - LOOP_STALE - Duration::from_secs(1),
            ..Probe::new(true)
        };
        p.loop_tauri_done.0.store(1, Ordering::Relaxed);
        assert!(p.stale(true));
        // A very old after-paint counts only while mapped and the page reports frames.
        let p = Probe {
            epoch: Instant::now() - PAINT_STALE - Duration::from_secs(1),
            ..Probe::new(true)
        };
        p.after_paint.0.store(1, Ordering::Relaxed);
        assert_eq!(p.gdk_paint_age(true), None);
        p.mapped.store(true, Ordering::Relaxed);
        assert_eq!(p.gdk_paint_age(false), None);
        assert!(p.gdk_paint_age(true).unwrap() >= PAINT_STALE);
        assert!(p.stale(true));
    }

    #[test]
    fn probe_file_is_key_value_lines_and_replaces_the_previous_one() {
        let dir = std::env::temp_dir().join(format!("pg-probe-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        let p = Probe::new(true);
        write_file(&dir, &p, Some(Duration::from_millis(300)), None);
        write_file(&dir, &p, Some(Duration::from_millis(300)), None);
        let text = fs::read_to_string(dir.join("probe.txt")).unwrap();
        assert!(text.starts_with("written="), "{text}");
        assert!(text.contains("\nbeat_age_s=0.3\n"), "{text}");
        assert!(text.contains("\nframe_age_s=n/a\n"), "{text}");
        assert!(!dir.join("probe.txt.tmp").exists());
        let _ = fs::remove_dir_all(&dir);
    }
}
