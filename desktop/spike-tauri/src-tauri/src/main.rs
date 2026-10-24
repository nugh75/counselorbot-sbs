// Spike F0-01: a Tauri shell that starts the packaged backend and shows /auth/me.
//
// The backend is a PyInstaller onedir folder shipped as resources (backend/),
// started with std::process on a free 127.0.0.1 port and killed on exit.
// `--smoke` skips the window: it waits for the backend, writes the report to
// SPIKE_REPORT_FILE and exits (used by CI on runners without a usable display).
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use serde_json::{json, Value};
use tauri::{AppHandle, Manager, RunEvent, WebviewUrl, WebviewWindowBuilder};

struct Backend {
    child: Mutex<Option<Child>>,
    port: u16,
    started: Instant,
    log: PathBuf,
}

fn free_port() -> u16 {
    TcpListener::bind("127.0.0.1:0")
        .and_then(|listener| listener.local_addr())
        .map(|addr| addr.port())
        .expect("no free local port")
}

/// Minimal HTTP/1.0 GET: enough for a local health probe, no HTTP crate needed.
fn http_get(port: u16, path: &str) -> Result<(u16, String), String> {
    let mut stream = TcpStream::connect(("127.0.0.1", port)).map_err(|e| e.to_string())?;
    stream.set_read_timeout(Some(Duration::from_secs(60))).ok();
    write!(stream, "GET {path} HTTP/1.0\r\nHost: 127.0.0.1\r\n\r\n").map_err(|e| e.to_string())?;
    let mut raw = String::new();
    stream.read_to_string(&mut raw).map_err(|e| e.to_string())?;
    let (head, body) = raw.split_once("\r\n\r\n").ok_or("malformed response")?;
    let status = head
        .split_whitespace()
        .nth(1)
        .and_then(|code| code.parse().ok())
        .ok_or("missing status")?;
    Ok((status, body.to_string()))
}

fn spawn_backend(app: &AppHandle) -> Result<Backend, String> {
    let exe_name = if cfg!(windows) { "counselorbot-backend.exe" } else { "counselorbot-backend" };
    let exe = app.path().resource_dir().map_err(|e| e.to_string())?.join("backend").join(exe_name);
    let data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&data_dir).map_err(|e| e.to_string())?;
    let log = data_dir.join("backend.log");
    let log_file = std::fs::File::create(&log).map_err(|e| e.to_string())?;
    let port = free_port();
    let mut command = Command::new(&exe);
    command
        .args(["--port", &port.to_string(), "--data-dir"])
        .arg(&data_dir)
        .stdin(Stdio::null())
        .stdout(log_file.try_clone().map_err(|e| e.to_string())?)
        .stderr(log_file);
    #[cfg(windows)]
    {
        // The backend is a console program: without this flag Windows opens a console window.
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    }
    let child = command.spawn().map_err(|e| format!("{}: {e}", exe.display()))?;
    Ok(Backend { child: Mutex::new(Some(child)), port, started: Instant::now(), log })
}

/// Waits for the backend, then returns /auth/me and the spike diagnostics.
fn probe(backend: &Backend) -> Value {
    let deadline = Duration::from_secs(300);
    let mut auth_me = Err("not started".to_string());
    while backend.started.elapsed() < deadline {
        auth_me = http_get(backend.port, "/auth/me");
        if auth_me.is_ok() {
            break;
        }
        if let Some(child) = backend.child.lock().unwrap().as_mut() {
            if let Ok(Some(status)) = child.try_wait() {
                auth_me = Err(format!("backend exited: {status}"));
                break;
            }
        }
        std::thread::sleep(Duration::from_millis(250));
    }
    let ready_seconds = backend.started.elapsed().as_secs_f64();
    let as_json = |result: Result<(u16, String), String>| match result {
        Ok((status, body)) => json!({ "status": status, "body": serde_json::from_str::<Value>(&body).unwrap_or(Value::String(body)) }),
        Err(error) => json!({ "error": error }),
    };
    let info = if auth_me.is_ok() { as_json(http_get(backend.port, "/spike/info")) } else { Value::Null };
    json!({
        "ok": matches!(auth_me, Ok((200, _))),
        "port": backend.port,
        "ready_seconds": (ready_seconds * 10.0).round() / 10.0,
        "auth_me": as_json(auth_me),
        "spike_info": info,
        "backend_log": backend.log.display().to_string(),
    })
}

fn write_report(report: &Value, gui: bool) {
    if let Ok(path) = std::env::var("SPIKE_REPORT_FILE") {
        let mut report = report.clone();
        report["gui"] = Value::Bool(gui);
        let _ = std::fs::write(path, serde_json::to_string_pretty(&report).unwrap_or_default());
    }
}

#[tauri::command]
async fn backend_status(app: AppHandle) -> Value {
    eprintln!("spike: page called backend_status");
    let report = tauri::async_runtime::spawn_blocking(move || probe(&app.state::<Backend>()))
        .await
        .unwrap_or_else(|e| json!({ "ok": false, "error": e.to_string() }));
    write_report(&report, true);
    report
}

fn main() {
    let smoke = std::env::args().any(|arg| arg == "--smoke");
    let app = tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![backend_status])
        .on_page_load(|webview, payload| {
            eprintln!("spike: page load {:?} {} in {}", payload.event(), payload.url(), webview.label());
        })
        .setup(move |app| {
            let backend = spawn_backend(app.handle())?;
            app.manage(backend);
            if smoke {
                let handle = app.handle().clone();
                std::thread::spawn(move || {
                    let report = probe(&handle.state::<Backend>());
                    write_report(&report, false);
                    handle.exit(if report["ok"].as_bool() == Some(true) { 0 } else { 1 });
                });
            } else {
                WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
                    .title("CounselorBot — spike F0-01")
                    .inner_size(820.0, 640.0)
                    .build()?;
                eprintln!("spike: window created");
            }
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building the spike app");
    app.run(|handle, event| {
        if let (RunEvent::Exit, Some(backend)) = (event, handle.try_state::<Backend>()) {
            if let Some(mut child) = backend.child.lock().unwrap().take() {
                let _ = child.kill();
                let _ = child.wait();
            }
        }
    });
}
