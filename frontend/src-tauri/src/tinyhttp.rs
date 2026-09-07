//! A minimal HTTP/1.1 GET for the engine on localhost (v0.14.1), used by the
//! diagnostic snapshot so the shell can ask the engine for facts even when
//! the webview is frozen. std only: no client crate to configure, and the
//! engine is always plain HTTP on 127.0.0.1. Handles the two body framings
//! Kestrel uses: Content-Length and chunked (the /health landmine in
//! docs/agents/memories/engine-port.md).

use std::io::{Read, Write};
use std::net::{SocketAddr, TcpStream};
use std::time::Duration;

pub fn get(port: u16, path: &str, token: &str, timeout: Duration) -> Result<String, String> {
    let addr: SocketAddr = format!("127.0.0.1:{port}")
        .parse()
        .map_err(|e| format!("bad address: {e}"))?;
    let mut stream =
        TcpStream::connect_timeout(&addr, timeout).map_err(|e| format!("connect: {e}"))?;
    stream
        .set_read_timeout(Some(timeout))
        .map_err(|e| format!("timeout: {e}"))?;
    stream
        .set_write_timeout(Some(timeout))
        .map_err(|e| format!("timeout: {e}"))?;
    let request = format!(
        "GET {path} HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nAuthorization: Bearer {token}\r\nAccept: application/json\r\nConnection: close\r\n\r\n"
    );
    stream
        .write_all(request.as_bytes())
        .map_err(|e| format!("write: {e}"))?;
    let mut raw = Vec::new();
    // Connection: close, so EOF ends the response; the read timeout bounds it.
    let _ = stream.read_to_end(&mut raw);
    parse_response(&raw)
}

/// Status line + headers + body framing. Returns the body as UTF-8 (lossy)
/// for 2xx; an error naming the status otherwise.
pub fn parse_response(raw: &[u8]) -> Result<String, String> {
    let split = find(raw, b"\r\n\r\n").ok_or("no header terminator")?;
    let head = String::from_utf8_lossy(&raw[..split]);
    let body = &raw[split + 4..];
    let mut lines = head.split("\r\n");
    let status_line = lines.next().unwrap_or("");
    let status: u16 = status_line
        .split_whitespace()
        .nth(1)
        .and_then(|s| s.parse().ok())
        .ok_or_else(|| format!("bad status line: {status_line}"))?;
    let mut chunked = false;
    let mut length: Option<usize> = None;
    for line in lines {
        let Some((name, value)) = line.split_once(':') else {
            continue;
        };
        let name = name.trim().to_ascii_lowercase();
        let value = value.trim();
        if name == "transfer-encoding" && value.to_ascii_lowercase().contains("chunked") {
            chunked = true;
        } else if name == "content-length" {
            length = value.parse().ok();
        }
    }
    let body = if chunked {
        decode_chunked(body)
    } else if let Some(n) = length {
        body[..n.min(body.len())].to_vec()
    } else {
        body.to_vec()
    };
    let text = String::from_utf8_lossy(&body).into_owned();
    if (200..300).contains(&status) {
        Ok(text)
    } else {
        Err(format!(
            "http {status}: {}",
            text.chars().take(200).collect::<String>()
        ))
    }
}

/// Chunked transfer decoding: `<hex size>[;ext]\r\n<data>\r\n` until a zero
/// chunk. Tolerates a truncated tail (returns what arrived).
pub fn decode_chunked(mut body: &[u8]) -> Vec<u8> {
    let mut out = Vec::new();
    loop {
        let Some(nl) = find(body, b"\r\n") else { break };
        let size_line = String::from_utf8_lossy(&body[..nl]);
        let size_hex = size_line.split(';').next().unwrap_or("").trim();
        let Ok(size) = usize::from_str_radix(size_hex, 16) else {
            break;
        };
        body = &body[nl + 2..];
        if size == 0 {
            break;
        }
        let take = size.min(body.len());
        out.extend_from_slice(&body[..take]);
        body = &body[take..];
        if body.starts_with(b"\r\n") {
            body = &body[2..];
        }
    }
    out
}

fn find(haystack: &[u8], needle: &[u8]) -> Option<usize> {
    haystack.windows(needle.len()).position(|w| w == needle)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn decodes_chunked_bodies() {
        let raw = b"HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nTransfer-Encoding: chunked\r\n\r\n5\r\n{\"a\":\r\n2\r\n1}\r\n0\r\n\r\n";
        assert_eq!(parse_response(raw).unwrap(), "{\"a\":1}");
    }

    #[test]
    fn honours_content_length_and_status() {
        let raw = b"HTTP/1.1 200 OK\r\nContent-Length: 2\r\n\r\n{}extra";
        assert_eq!(parse_response(raw).unwrap(), "{}");
        let raw = b"HTTP/1.1 401 Unauthorized\r\nContent-Length: 0\r\n\r\n";
        assert!(parse_response(raw).unwrap_err().starts_with("http 401"));
    }

    #[test]
    fn truncated_chunk_returns_what_arrived() {
        assert_eq!(decode_chunked(b"a\r\nhello"), b"hello".to_vec());
    }
}
