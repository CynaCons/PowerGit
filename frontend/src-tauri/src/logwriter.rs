//! Log writes that never block the caller (v0.15.4).
//!
//! Owner, 2026-09-09: "when the crash happens, even the developper panels
//! does not refresh!!!" The WebKit inspector is a separate web view driven by
//! the *same* GTK main loop as the window, so an inspector that also stops
//! updating says the main loop is stuck — not the page.
//!
//! Which made our own logging suspect. Every line went through
//! `Mutex<Option<File>>` and did `writeln!` + `flush()` on whichever thread
//! called it, and one of those callers is the `RunEvent` closure — the run
//! loop itself, on the main thread, on every window focus change. Meanwhile
//! the sidecar's stdout task takes the same lock for every line the engine
//! prints, and the engine prints per-request lines by the thousand. A focus
//! change could therefore park the main loop behind another thread's flush.
//!
//! So the files move to a thread of their own. `Logger::write` is a channel
//! send: no lock held across I/O, no syscall on the caller's thread, and the
//! main loop cannot be parked behind a disk write. Sends never block — the
//! channel is unbounded — and a dead writer thread degrades to dropped lines
//! rather than a hang, which is the right trade for a diagnostic.

use std::fs::File;
use std::io::Write;
use std::sync::mpsc::{channel, Sender};
use std::sync::Mutex;

/// Which file a line belongs to.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Target {
    /// engine.log — the shell's own notes and the sidecar's output.
    Engine,
    /// frontend.log — the page's diagnostic ring.
    Frontend,
}

enum Message {
    Line(Target, String),
    /// Flush both files and answer, so shutdown and snapshots see everything.
    Sync(Sender<()>),
}

pub struct Logger {
    tx: Mutex<Option<Sender<Message>>>,
}

impl Logger {
    /// Takes ownership of the two files and starts the writer thread.
    pub fn start(engine: Option<File>, frontend: Option<File>) -> Logger {
        if engine.is_none() && frontend.is_none() {
            return Logger {
                tx: Mutex::new(None),
            };
        }
        let (tx, rx) = channel::<Message>();
        std::thread::Builder::new()
            .name("powergit-log".into())
            .spawn(move || {
                let mut engine = engine;
                let mut frontend = frontend;
                while let Ok(message) = rx.recv() {
                    match message {
                        Message::Line(target, line) => {
                            let file = match target {
                                Target::Engine => engine.as_mut(),
                                Target::Frontend => frontend.as_mut(),
                            };
                            if let Some(file) = file {
                                let _ = writeln!(file, "{line}");
                                // Flushing per line is what makes the log
                                // survive a hard kill; it costs the writer
                                // thread, which is the point of having one.
                                let _ = file.flush();
                            }
                        }
                        Message::Sync(reply) => {
                            if let Some(f) = engine.as_mut() {
                                let _ = f.flush();
                            }
                            if let Some(f) = frontend.as_mut() {
                                let _ = f.flush();
                            }
                            let _ = reply.send(());
                        }
                    }
                }
            })
            .ok();
        Logger {
            tx: Mutex::new(Some(tx)),
        }
    }

    /// A logger that writes nowhere, for tests and for a missing log dir.
    pub fn disabled() -> Logger {
        Logger {
            tx: Mutex::new(None),
        }
    }

    /// Queues one line. Returns without touching the disk.
    pub fn write(&self, target: Target, line: impl Into<String>) {
        let line = line.into();
        // A poisoned lock must not take the app down over a log line.
        let Ok(guard) = self.tx.lock() else { return };
        if let Some(tx) = guard.as_ref() {
            let _ = tx.send(Message::Line(target, line));
        }
    }

    /// Waits until everything queued so far is on disk, at most `timeout`.
    ///
    /// Only for the paths that must not lose lines: writing a snapshot, and
    /// shutting down. Never call it from the main loop.
    pub fn sync(&self, timeout: std::time::Duration) {
        let Ok(guard) = self.tx.lock() else { return };
        let Some(tx) = guard.as_ref() else { return };
        let (reply, done) = channel();
        if tx.send(Message::Sync(reply)).is_ok() {
            let _ = done.recv_timeout(timeout);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Read;
    use std::time::Duration;

    fn temp_file(name: &str) -> (std::path::PathBuf, File) {
        let path = std::env::temp_dir().join(format!("pg-log-{name}-{}.log", std::process::id()));
        let _ = std::fs::remove_file(&path);
        let file = File::options()
            .create(true)
            .append(true)
            .open(&path)
            .expect("temp log");
        (path, file)
    }

    fn read(path: &std::path::Path) -> String {
        let mut s = String::new();
        File::open(path)
            .expect("read log")
            .read_to_string(&mut s)
            .expect("utf8");
        s
    }

    #[test]
    fn lines_reach_their_own_file() {
        let (engine_path, engine) = temp_file("engine");
        let (frontend_path, frontend) = temp_file("frontend");
        let logger = Logger::start(Some(engine), Some(frontend));

        logger.write(Target::Engine, "sidecar started");
        logger.write(Target::Frontend, "window blur");
        logger.sync(Duration::from_secs(5));

        assert_eq!(read(&engine_path).trim(), "sidecar started");
        assert_eq!(read(&frontend_path).trim(), "window blur");
    }

    #[test]
    fn order_is_kept_within_a_target() {
        let (path, file) = temp_file("order");
        let logger = Logger::start(Some(file), None);
        for i in 0..50 {
            logger.write(Target::Engine, format!("line {i}"));
        }
        logger.sync(Duration::from_secs(5));

        let text = read(&path);
        let lines: Vec<&str> = text.lines().collect();
        assert_eq!(lines.len(), 50);
        assert_eq!(lines[0], "line 0");
        assert_eq!(lines[49], "line 49");
    }

    #[test]
    fn a_write_does_not_wait_for_the_disk() {
        // The property the main loop depends on: `write` queues and returns.
        // A real flush is milliseconds; 50 of them must not add up here.
        let (_, file) = temp_file("fast");
        let logger = Logger::start(Some(file), None);
        let start = std::time::Instant::now();
        for i in 0..50 {
            logger.write(Target::Engine, format!("line {i}"));
        }
        assert!(
            start.elapsed() < Duration::from_millis(100),
            "queueing 50 lines took {:?}",
            start.elapsed()
        );
    }

    #[test]
    fn a_disabled_logger_accepts_and_drops() {
        let logger = Logger::disabled();
        logger.write(Target::Engine, "nowhere");
        logger.sync(Duration::from_millis(50));
    }

    #[test]
    fn a_target_with_no_file_drops_without_disturbing_the_other() {
        let (path, file) = temp_file("one-sided");
        let logger = Logger::start(Some(file), None);
        logger.write(Target::Frontend, "no frontend log here");
        logger.write(Target::Engine, "kept");
        logger.sync(Duration::from_secs(5));
        assert_eq!(read(&path).trim(), "kept");
    }
}
