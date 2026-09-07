//! Webview watchdog (v0.14.1, owner: "make sure there's a watchdog
//! monitoring system to ensure for the snapshot button that we always have
//! the option to hit it"). The webview beats every 2 s; when beats stop for
//! `THRESHOLD` the shell declares it unresponsive, writes the snapshot the
//! button would have written, and records an incident for the next launch.
//! The decision is a pure function so it is unit-tested; lib.rs owns the
//! timer and the side effects.

use std::time::Duration;

/// No beat for this long means the page's main thread is stuck (a healthy
/// page beats every 2 s; a long refresh on a big repository takes well
/// under 15 s once it is off the main thread).
pub const THRESHOLD: Duration = Duration::from_secs(15);
/// How often the shell looks.
pub const INTERVAL: Duration = Duration::from_secs(5);

#[derive(Debug, PartialEq, Eq)]
pub enum Transition {
    None,
    BecameUnresponsive,
    Recovered,
}

/// `beat_age`: time since the last heartbeat (None before the first one:
/// a page that is still booting is not an incident). `unresponsive`: the
/// state recorded by the previous step.
pub fn step(beat_age: Option<Duration>, unresponsive: bool) -> Transition {
    match (beat_age, unresponsive) {
        (None, _) => Transition::None,
        (Some(age), false) if age >= THRESHOLD => Transition::BecameUnresponsive,
        (Some(age), true) if age < THRESHOLD => Transition::Recovered,
        _ => Transition::None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_page_that_never_beat_is_not_an_incident() {
        assert_eq!(step(None, false), Transition::None);
    }

    #[test]
    fn silence_past_the_threshold_is_reported_once() {
        assert_eq!(step(Some(Duration::from_secs(3)), false), Transition::None);
        assert_eq!(step(Some(THRESHOLD), false), Transition::BecameUnresponsive);
        assert_eq!(step(Some(THRESHOLD * 3), true), Transition::None);
    }

    #[test]
    fn beats_resuming_recover() {
        assert_eq!(
            step(Some(Duration::from_secs(1)), true),
            Transition::Recovered
        );
    }
}
