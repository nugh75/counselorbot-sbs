//! Porte locali e sonde HTTP (ADR-0002 §2.1-§2.2). Tutto su 127.0.0.1.

use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::time::Duration;

/// A free port on 127.0.0.1: bind on port 0, read it, close, hand it to the child.
pub fn free_port() -> std::io::Result<u16> {
    Ok(TcpListener::bind("127.0.0.1:0")?.local_addr()?.port())
}

pub fn is_free(port: u16) -> bool {
    TcpListener::bind(("127.0.0.1", port)).is_ok()
}

/// Minimal HTTP/1.0 GET: enough for local probes, no HTTP client crate needed.
pub fn get(port: u16, path: &str, headers: &[(&str, &str)]) -> Result<(u16, String), String> {
    let address = std::net::SocketAddr::from(([127, 0, 0, 1], port));
    let mut stream = TcpStream::connect_timeout(&address, Duration::from_secs(2)).map_err(|e| e.to_string())?;
    stream.set_read_timeout(Some(Duration::from_secs(10))).ok();
    let mut request = format!("GET {path} HTTP/1.0\r\nHost: 127.0.0.1:{port}\r\n");
    for (name, value) in headers {
        request.push_str(&format!("{name}: {value}\r\n"));
    }
    request.push_str("\r\n");
    stream.write_all(request.as_bytes()).map_err(|e| e.to_string())?;
    let mut raw = Vec::new();
    stream.read_to_end(&mut raw).map_err(|e| e.to_string())?;
    let raw = String::from_utf8_lossy(&raw);
    let (head, body) = raw.split_once("\r\n\r\n").unwrap_or((&raw, ""));
    let status = head
        .split_whitespace()
        .nth(1)
        .and_then(|code| code.parse().ok())
        .ok_or_else(|| "risposta HTTP non valida".to_string())?;
    Ok((status, body.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn free_port_is_bindable_and_probe_reads_status() {
        let port = free_port().unwrap();
        assert!(is_free(port));
        let listener = TcpListener::bind(("127.0.0.1", port)).unwrap();
        assert!(!is_free(port));
        let server = std::thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            let mut buffer = [0u8; 1024];
            let read = stream.read(&mut buffer).unwrap();
            let request = String::from_utf8_lossy(&buffer[..read]).to_string();
            stream.write_all(b"HTTP/1.1 200 OK\r\nContent-Type: application/json\r\n\r\n{\"status\":\"ok\"}").unwrap();
            request
        });
        let (status, body) = get(port, "/health", &[("X-Test", "1")]).unwrap();
        assert_eq!(status, 200);
        assert_eq!(body, "{\"status\":\"ok\"}");
        assert!(server.join().unwrap().contains("X-Test: 1\r\n"));
    }
}
