//! Webview watchdog (v0.14.1, owner: "make sure there's a watchdog
//! monitoring system to ensure for the snapshot button that we always have
//! the option to hit it"; v0.14.2, owner on the Linux AppImage: "the
//! window moves and resizes, the content is frozen, some areas are black
//! and not redrawn" while the page's script kept beating).
//!
//! The page beats every 2 s and says how long ago its last animation frame
//! was painted. Two things can stall: the script (no beats at all) and the
//! painting (beats arrive, frames do not: the compositor is gone). The
//! platform can also tell us outright that the web process died
//! (crash_hooks.rs). Any stall writes the snapshot the button would have
//! written and records an incident for the next launch; then the shell
//! tries to get the window back on its own: reload the webview, and if
//! that does not bring frames back, ask (in a native dialog, which paints
//! without the webview) whether to restart the app.
//!
//! The decision is a pure state machine so it is unit-tested; lib.rs owns
//! the timer and the side effects.

use std::time::{Duration, Instant};

/// No beat for this long means the page's main thread is stuck (a healthy
/// page beats every 2 s; a long refresh on a big repository takes well
/// under 15 s once it is off the main thread).
pub const SCRIPT_THRESHOLD: Duration = Duration::from_secs(15);
/// Beats arrive but no animation frame was painted for this long while
/// the window is visible: the compositor is dead. Longer than the script
/// threshold because a frame can legitimately wait behind a big layout.
pub const PAINT_THRESHOLD: Duration = Duration::from_secs(20);
/// A stall this old gets the webview reloaded (a crash is reloaded at once).
pub const RELOAD_AFTER: Duration = Duration::from_secs(20);
/// Still stalled this long after the reload: ask the user to restart.
pub const ASK_AFTER: Duration = Duration::from_secs(30);
/// How often the shell looks.
pub const INTERVAL: Duration = Duration::from_secs(5);

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Stall {
    /// No heartbeat: the page's script is stuck.
    Script,
    /// Heartbeats but no frames: the page cannot paint.
    Paint,
    /// The platform reported the web process gone.
    Crash,
}

impl Stall {
    pub fn describe(self) -> &'static str {
        match self {
            Stall::Script => "script",
            Stall::Paint => "paint",
            Stall::Crash => "crash",
        }
    }
}

/// What the shell observed since the last step.
#[derive(Debug, Clone, Copy, Default)]
pub struct Observation {
    /// Time since the last heartbeat (None before the first one: a page
    /// that is still booting is not an incident).
    pub beat_age: Option<Duration>,
    /// Time since the page last painted a frame, as reported by the last
    /// heartbeat (None while the window is hidden or before the first beat).
    pub paint_age: Option<Duration>,
    /// The platform reported the web process crashed since the last step.
    pub crashed: bool,
}

/// The watchdog's memory between steps.
#[derive(Debug, Default)]
pub struct Status {
    pub stalled: Option<(Stall, Instant)>,
    pub reloaded_at: Option<Instant>,
    pub asked: bool,
}

impl Status {
    #[cfg(test)]
    pub fn is_stalled(&self) -> bool {
        self.stalled.is_some()
    }
}

#[derive(Debug, PartialEq, Eq)]
pub enum Action {
    None,
    /// A stall just started: log it, write the snapshot, record the incident.
    Stalled(Stall),
    /// Reload the webview.
    Reload,
    /// Show the native "restart?" dialog.
    AskRestart,
    /// Beats and frames are back: log how long it took.
    Recovered(Stall, Duration),
}

pub fn step(obs: Observation, status: &mut Status, now: Instant) -> Action {
    let script = obs.beat_age.is_some_and(|a| a >= SCRIPT_THRESHOLD);
    let paint = obs.paint_age.is_some_and(|a| a >= PAINT_THRESHOLD);
    let stalled_now = obs.crashed || script || paint;

    match status.stalled {
        None if !stalled_now => Action::None,
        None => {
            let kind = if obs.crashed {
                Stall::Crash
            } else if script {
                Stall::Script
            } else {
                Stall::Paint
            };
            status.stalled = Some((kind, now));
            Action::Stalled(kind)
        }
        Some((kind, since)) if !stalled_now => {
            let took = now.saturating_duration_since(since);
            *status = Status::default();
            Action::Recovered(kind, took)
        }
        Some((kind, since)) => match status.reloaded_at {
            None => {
                let due = kind == Stall::Crash || now.saturating_duration_since(since) >= RELOAD_AFTER;
                if due {
                    status.reloaded_at = Some(now);
                    Action::Reload
                } else {
                    Action::None
                }
            }
            Some(reloaded) if !status.asked && now.saturating_duration_since(reloaded) >= ASK_AFTER => {
                status.asked = true;
                Action::AskRestart
            }
            Some(_) => Action::None,
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn obs(beat: u64, paint: Option<u64>) -> Observation {
        Observation {
            beat_age: Some(Duration::from_secs(beat)),
            paint_age: paint.map(Duration::from_secs),
            crashed: false,
        }
    }

    #[test]
    fn a_page_that_never_beat_is_not_an_incident() {
        let mut s = Status::default();
        assert_eq!(step(Observation::default(), &mut s, Instant::now()), Action::None);
        assert!(!s.is_stalled());
    }

    #[test]
    fn script_silence_is_reported_once_then_reloaded_then_asked() {
        let t0 = Instant::now();
        let mut s = Status::default();
        assert_eq!(step(obs(3, Some(0)), &mut s, t0), Action::None);
        assert_eq!(step(obs(15, Some(0)), &mut s, t0), Action::Stalled(Stall::Script));
        assert_eq!(step(obs(20, Some(0)), &mut s, t0 + Duration::from_secs(5)), Action::None);
        assert_eq!(step(obs(35, Some(0)), &mut s, t0 + RELOAD_AFTER), Action::Reload);
        assert_eq!(step(obs(40, Some(0)), &mut s, t0 + RELOAD_AFTER + Duration::from_secs(5)), Action::None);
        assert_eq!(
            step(obs(70, Some(0)), &mut s, t0 + RELOAD_AFTER + ASK_AFTER),
            Action::AskRestart
        );
        // Asked once; keeps quiet afterwards.
        assert_eq!(
            step(obs(80, Some(0)), &mut s, t0 + RELOAD_AFTER + ASK_AFTER * 2),
            Action::None
        );
    }

    #[test]
    fn frames_stopping_while_script_beats_is_a_paint_stall() {
        let t0 = Instant::now();
        let mut s = Status::default();
        assert_eq!(step(obs(1, Some(19)), &mut s, t0), Action::None);
        assert_eq!(step(obs(1, Some(20)), &mut s, t0), Action::Stalled(Stall::Paint));
    }

    #[test]
    fn a_hidden_window_does_not_count_as_a_paint_stall() {
        let mut s = Status::default();
        assert_eq!(step(obs(1, None), &mut s, Instant::now()), Action::None);
    }

    #[test]
    fn a_crash_reloads_on_the_spot() {
        let t0 = Instant::now();
        let mut s = Status::default();
        let crashed = Observation {
            beat_age: Some(Duration::from_secs(1)),
            paint_age: Some(Duration::ZERO),
            crashed: true,
        };
        assert_eq!(step(crashed, &mut s, t0), Action::Stalled(Stall::Crash));
        assert_eq!(step(crashed, &mut s, t0 + INTERVAL), Action::Reload);
    }

    #[test]
    fn beats_and_frames_resuming_recover_with_the_duration() {
        let t0 = Instant::now();
        let mut s = Status::default();
        assert_eq!(step(obs(1, Some(25)), &mut s, t0), Action::Stalled(Stall::Paint));
        assert_eq!(step(obs(1, Some(30)), &mut s, t0 + RELOAD_AFTER), Action::Reload);
        assert_eq!(
            step(obs(1, Some(0)), &mut s, t0 + Duration::from_secs(40)),
            Action::Recovered(Stall::Paint, Duration::from_secs(40))
        );
        assert!(!s.is_stalled());
        assert!(s.reloaded_at.is_none());
    }
}
