//! Applicazione Tauri: cartella dati, istanza unica, supervisore, pannello.

use std::fs::{File, TryLockError};
use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;

use tauri::{AppHandle, Manager, RunEvent, State, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_opener::OpenerExt;

use crate::datadir::DataDir;
use crate::supervisor::{self, Handle, Status};
use crate::{diagnostics, logs, platform};

#[derive(Clone, Copy, PartialEq)]
pub enum Mode {
    Window,
    Headless,
    Smoke,
}

struct Shell {
    supervisor: Arc<Handle>,
    data_root: PathBuf,
    version: String,
    // Held for the whole run: the OS releases it even if the shell is killed.
    _lock: File,
}

#[tauri::command]
fn shell_status(shell: State<'_, Shell>) -> Status {
    shell.supervisor.snapshot()
}

#[tauri::command]
fn open_in_browser(app: AppHandle, shell: State<'_, Shell>) -> Result<(), String> {
    let url = shell.supervisor.snapshot().frontend_url.ok_or("CounselorBot non e' ancora pronto")?;
    app.opener().open_url(url, None::<&str>).map_err(|e| e.to_string())
}

#[tauri::command]
fn export_diagnostics(app: AppHandle, shell: State<'_, Shell>) -> Result<String, String> {
    let target = app.path().download_dir().unwrap_or_else(|_| shell.data_root.clone());
    diagnostics::export(&shell.data_root, &shell.version, &target).map(|p| p.display().to_string())
}

#[tauri::command]
fn quit(app: AppHandle) {
    app.exit(0);
}

/// `run/shell.lock`: a second shell on the same data folder must not start.
fn lock_instance(data: &DataDir) -> Result<File, String> {
    let path = data.run().join("shell.lock");
    let file = File::options().create(true).truncate(false).write(true).open(&path).map_err(|e| e.to_string())?;
    match file.try_lock() {
        Ok(()) => Ok(file),
        Err(TryLockError::WouldBlock) => Err("CounselorBot Docente e' gia' aperto".into()),
        Err(TryLockError::Error(e)) => Err(format!("{}: {e}", path.display())),
    }
}

fn setup(app: &AppHandle, mode: Mode) -> Result<(), Box<dyn std::error::Error>> {
    let version = app.package_info().version.to_string();
    // Only explicit test modes can override the data root; lifecycle checks must
    // never touch the teacher's installed app data.
    let root =
        if mode != Mode::Window { std::env::var_os("COUNSELORBOT_TEST_DATA_DIR").map(PathBuf::from) } else { None };
    let data = DataDir::prepare(root.unwrap_or(app.path().app_local_data_dir()?), &version)?;
    logs::init_shell_log(&data.logs())?;
    let lock = lock_instance(&data)?;
    logs::log(format!("guscio {version} avviato, cartella dati {}", data.root.display()));
    let config = supervisor::Config {
        data: data.clone(),
        resources: platform::resource_path(app.path().resource_dir()?),
        shell_exe: std::env::current_exe()?,
        version: version.clone(),
        minimal_backend: std::env::var("COUNSELORBOT_BACKEND_MINIMAL").as_deref() == Ok("1"),
        report_file: std::env::var_os("COUNSELORBOT_REPORT_FILE").map(PathBuf::from),
    };
    let handle = Arc::new(supervisor::start(config));
    app.manage(Shell { supervisor: Arc::clone(&handle), data_root: data.root.clone(), version, _lock: lock });
    match mode {
        Mode::Window => {
            WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
                .title("CounselorBot Docente")
                .inner_size(560.0, 520.0)
                .build()?;
        }
        Mode::Headless => {}
        Mode::Smoke => {
            let app = app.clone();
            let report = std::env::var_os("COUNSELORBOT_REPORT_FILE").map(PathBuf::from);
            std::thread::spawn(move || {
                let status = loop {
                    let status = handle.snapshot();
                    let tunnel_pending = status.sidecars.iter().any(|s| s.name == "cloudflared" && s.pid.is_some())
                        && status.tunnel_url.is_none();
                    if status.phase != "preparing" && !(status.phase == "ready" && tunnel_pending) {
                        break status;
                    }
                    std::thread::sleep(Duration::from_millis(250));
                };
                logs::log(format!("smoke: {} {:?}", status.phase, status.message));
                if let Some(report) = report {
                    let _ = std::fs::write(
                        report.with_extension("ready.json"),
                        serde_json::to_vec_pretty(&status).unwrap(),
                    );
                }
                app.exit(if status.phase == "ready" { 0 } else { 1 });
            });
        }
    }
    Ok(())
}

pub fn run(mode: Mode) {
    let mut builder = tauri::Builder::default().plugin(tauri_plugin_opener::init());
    if mode == Mode::Window {
        // Focus the open window instead of starting a second shell. Not in the test
        // modes: on Linux the plugin needs a D-Bus session, absent on CI runners.
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }));
    }
    let app = builder
        .invoke_handler(tauri::generate_handler![shell_status, open_in_browser, export_diagnostics, quit])
        .setup(move |app| {
            setup(app.handle(), mode).map_err(|error| {
                logs::log(format!("avvio non riuscito: {error}"));
                error
            })
        })
        .build(tauri::generate_context!())
        .expect("errore nella creazione dell'app");
    app.run(|handle, event| {
        if let RunEvent::Exit = event {
            if let Some(shell) = handle.try_state::<Shell>() {
                // Normal stop: cloudflared → frontend → backend, 10 s each at most.
                shell.supervisor.stop();
                logs::log("guscio chiuso");
            }
        }
    });
}
