// PowerGit's stdio-to-local-endpoint MCP bridge. Keep this module std-only:
// it runs before Tauri (and, on Linux, GTK/WebKit) is initialized.

use std::io::{self, Read, Write};
use std::sync::mpsc;
use std::thread;

const NOT_RUNNING: &str = "PowerGit is not running — start it, then retry";

pub fn endpoint() -> String {
    endpoint_from(
        std::env::var("USERNAME").ok().as_deref(),
        std::env::var("POWERGIT_MCP_ENDPOINT").ok().as_deref(),
        std::env::var("POWERGIT_DATA_DIR").ok().as_deref(),
        std::env::var("XDG_DATA_HOME").ok().as_deref(),
        std::env::var("HOME").ok().as_deref(),
    )
}

fn endpoint_from(
    username: Option<&str>,
    endpoint_override: Option<&str>,
    data_dir: Option<&str>,
    xdg: Option<&str>,
    home: Option<&str>,
) -> String {
    if let Some(value) = endpoint_override.filter(|value| !value.is_empty()) {
        return value.to_owned();
    }

    #[cfg(windows)]
    {
        let _ = (data_dir, xdg, home);
        let user = username.unwrap_or_default().to_ascii_lowercase();
        let safe_user: String = user
            .chars()
            .map(|c| {
                if c.is_ascii_lowercase() || c.is_ascii_digit() || c == '_' || c == '-' {
                    c
                } else {
                    '_'
                }
            })
            .collect();
        format!(r"\\.\pipe\PowerGit.mcp.{safe_user}")
    }

    #[cfg(not(windows))]
    {
        use std::path::PathBuf;

        let _ = username;
        let base = data_dir
            .filter(|value| !value.is_empty())
            .map(PathBuf::from)
            .or_else(|| {
                xdg.filter(|value| !value.is_empty())
                    .map(|value| PathBuf::from(value).join("PowerGit"))
            })
            .or_else(|| {
                home.filter(|value| !value.is_empty())
                    .map(|value| PathBuf::from(value).join(".local/share/PowerGit"))
            })
            .unwrap_or_else(|| PathBuf::from(".local/share/PowerGit"));
        base.join("mcp.sock").to_string_lossy().into_owned()
    }
}

/// Copy bytes in both directions and return successfully when either side closes.
pub fn pump<R, W, CIn, COut>(input: R, output: W, conn_in: CIn, conn_out: COut) -> i32
where
    R: Read + Send + 'static,
    W: Write + Send + 'static,
    CIn: Read + Send + 'static,
    COut: Write + Send + 'static,
{
    let (finished_tx, finished_rx) = mpsc::channel();
    let input_finished = finished_tx.clone();
    thread::spawn(move || {
        let mut input = input;
        let mut conn_out = conn_out;
        let _ = io::copy(&mut input, &mut conn_out);
        let _ = conn_out.flush();
        let _ = input_finished.send(());
    });
    thread::spawn(move || {
        let mut conn_in = conn_in;
        let mut output = output;
        let _ = io::copy(&mut conn_in, &mut output);
        let _ = output.flush();
        let _ = finished_tx.send(());
    });
    let _ = finished_rx.recv();
    0
}

#[cfg(unix)]
struct ShutdownWriter(std::os::unix::net::UnixStream);

#[cfg(unix)]
impl Write for ShutdownWriter {
    fn write(&mut self, bytes: &[u8]) -> io::Result<usize> {
        self.0.write(bytes)
    }

    fn flush(&mut self) -> io::Result<()> {
        self.0.flush()
    }
}

#[cfg(unix)]
impl Drop for ShutdownWriter {
    fn drop(&mut self) {
        let _ = self.0.shutdown(std::net::Shutdown::Write);
    }
}

pub fn run() -> i32 {
    #[cfg(windows)]
    {
        run_windows(&endpoint())
    }

    #[cfg(unix)]
    {
        use std::os::unix::net::UnixStream;

        let connection = match UnixStream::connect(endpoint()) {
            Ok(connection) => connection,
            Err(_) => {
                eprintln!("{NOT_RUNNING}");
                return 2;
            }
        };
        let reader = match connection.try_clone() {
            Ok(reader) => reader,
            Err(_) => {
                eprintln!("{NOT_RUNNING}");
                return 2;
            }
        };
        pump(
            io::stdin(),
            io::stdout(),
            reader,
            ShutdownWriter(connection),
        )
    }

    #[cfg(not(any(windows, unix)))]
    {
        eprintln!("{NOT_RUNNING}");
        2
    }
}

/// Windows: the pipe is opened with overlapped I/O through tokio. A
/// synchronous handle (std's `File` on `\\.\pipe\…`) serialises ReadFile
/// and WriteFile: the thread parked in the pipe→stdout read holds the
/// handle and every stdin→pipe write waits behind it, so the very first
/// `initialize` never reached the engine (found with the mcp-probe on
/// 2026-09-18). Overlapped reads and writes proceed independently.
#[cfg(windows)]
fn run_windows(name: &str) -> i32 {
    use std::time::{Duration, Instant};
    use tokio::io::{copy, split, stdin, stdout, AsyncWriteExt};
    use tokio::net::windows::named_pipe::ClientOptions;

    let runtime = match tokio::runtime::Builder::new_multi_thread()
        .worker_threads(2)
        .enable_all()
        .build()
    {
        Ok(runtime) => runtime,
        Err(_) => {
            eprintln!("{NOT_RUNNING}");
            return 2;
        }
    };
    runtime.block_on(async {
        let deadline = Instant::now() + Duration::from_secs(1);
        let client = loop {
            match ClientOptions::new().open(name) {
                Ok(client) => break client,
                // 2 = not found (no engine yet), 231 = every instance busy
                // (the engine is between accept and the next instance).
                Err(error)
                    if matches!(error.raw_os_error(), Some(2) | Some(231))
                        && Instant::now() < deadline =>
                {
                    tokio::time::sleep(Duration::from_millis(40)).await;
                }
                Err(_) => {
                    eprintln!("{NOT_RUNNING}");
                    return 2;
                }
            }
        };
        let (mut from_pipe, mut to_pipe) = split(client);
        let mut tasks = tokio::task::JoinSet::new();
        tasks.spawn(async move {
            let mut input = stdin();
            let _ = copy(&mut input, &mut to_pipe).await;
            let _ = to_pipe.shutdown().await;
        });
        tasks.spawn(async move {
            let mut output = stdout();
            let _ = copy(&mut from_pipe, &mut output).await;
            let _ = output.flush().await;
        });
        // Either side closing ends the bridge, as on Unix.
        let _ = tasks.join_next().await;
        0
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::net::{Shutdown, TcpListener, TcpStream};
    use std::sync::{mpsc::Receiver, Arc, Mutex};

    #[derive(Clone)]
    struct SharedOutput(Arc<Mutex<Vec<u8>>>);

    impl Write for SharedOutput {
        fn write(&mut self, bytes: &[u8]) -> io::Result<usize> {
            self.0.lock().unwrap().extend_from_slice(bytes);
            Ok(bytes.len())
        }

        fn flush(&mut self) -> io::Result<()> {
            Ok(())
        }
    }

    struct ReadUntilOutput {
        sent: bool,
        output_seen: Receiver<()>,
    }

    impl Read for ReadUntilOutput {
        fn read(&mut self, bytes: &mut [u8]) -> io::Result<usize> {
            if !self.sent {
                self.sent = true;
                bytes[..6].copy_from_slice(b"hello\n");
                return Ok(6);
            }
            let _ = self.output_seen.recv();
            Ok(0)
        }
    }

    #[test]
    fn endpoint_override_wins() {
        assert_eq!(
            endpoint_from(
                Some("someone"),
                Some("custom-endpoint"),
                Some("data"),
                Some("xdg"),
                Some("home")
            ),
            "custom-endpoint"
        );
    }

    #[cfg(windows)]
    #[test]
    fn windows_endpoint_sanitizes_the_username() {
        assert_eq!(
            endpoint_from(Some("Con Stantin"), None, None, None, None),
            r"\\.\pipe\PowerGit.mcp.con_stantin"
        );
    }

    #[cfg(not(windows))]
    #[test]
    fn unix_endpoint_prefers_explicit_data_dir() {
        assert_eq!(
            endpoint_from(
                None,
                None,
                Some("/var/powergit"),
                Some("/xdg"),
                Some("/home/me")
            ),
            "/var/powergit/mcp.sock"
        );
    }

    #[cfg(not(windows))]
    #[test]
    fn unix_endpoint_uses_xdg_data_home() {
        assert_eq!(
            endpoint_from(None, None, None, Some("/xdg"), Some("/home/me")),
            "/xdg/PowerGit/mcp.sock"
        );
    }

    #[cfg(not(windows))]
    #[test]
    fn unix_endpoint_falls_back_to_home() {
        assert_eq!(
            endpoint_from(None, None, None, None, Some("/home/me")),
            "/home/me/.local/share/PowerGit/mcp.sock"
        );
    }

    #[test]
    fn pump_copies_bytes_from_the_connection_and_returns_when_it_closes() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        let peer = thread::spawn(move || {
            let (mut socket, _) = listener.accept().unwrap();
            let mut received = [0; 6];
            socket.read_exact(&mut received).unwrap();
            assert_eq!(&received, b"hello\n");
            socket.write_all(&received).unwrap();
            socket.shutdown(Shutdown::Both).unwrap();
        });
        let connection = TcpStream::connect(address).unwrap();
        let reader = connection.try_clone().unwrap();
        let bytes = Arc::new(Mutex::new(Vec::new()));
        let (output_seen_tx, output_seen_rx) = mpsc::channel();
        let output = SharedOutput(bytes.clone());
        let gated_output = NotifyOnWrite(output, Some(output_seen_tx));

        assert_eq!(
            pump(
                ReadUntilOutput {
                    sent: false,
                    output_seen: output_seen_rx,
                },
                gated_output,
                reader,
                connection
            ),
            0
        );
        peer.join().unwrap();
        assert_eq!(*bytes.lock().unwrap(), b"hello\n");
    }

    struct NotifyOnWrite(SharedOutput, Option<mpsc::Sender<()>>);

    impl Write for NotifyOnWrite {
        fn write(&mut self, bytes: &[u8]) -> io::Result<usize> {
            let written = self.0.write(bytes)?;
            if let Some(sender) = self.1.take() {
                let _ = sender.send(());
            }
            Ok(written)
        }

        fn flush(&mut self) -> io::Result<()> {
            self.0.flush()
        }
    }
}
