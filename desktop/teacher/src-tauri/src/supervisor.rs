//! Supervisore dei sidecar (ADR-0002 §2.1-§2.5).
//!
//! Un solo thread, che vive quanto il guscio, avvia tutti i processi (vedi
//! `platform`: PDEATHSIG e' legato al thread), li sorveglia ogni 250 ms e li
//! ferma in ordine inverso. Ordine di avvio: backend → (health) → frontend →
//! (health) → cloudflared, se il tunnel e' attivo in `config/shell.json`.

use std::collections::HashMap;
use std::ffi::OsString;
use std::path::PathBuf;
use std::sync::mpsc::{self, Receiver, RecvTimeoutError, Sender};
use std::sync::{Arc, Mutex};
use std::thread::JoinHandle;
use std::time::{Duration, Instant};

use base64::Engine;
use serde::Serialize;

use crate::datadir::{DataDir, ShellConfig};
use crate::sidecar::{self, Exit, Proc, Spec};
use crate::{health, logs, pids, platform};

pub const DESKTOP_CONTRACT: u64 = 1;
const POLL: Duration = Duration::from_millis(250);
const FIRST_START_TIMEOUT: Duration = Duration::from_secs(180);
const START_TIMEOUT: Duration = Duration::from_secs(60);
const PORT_ATTEMPTS: usize = 3;
const MAX_RESTARTS: usize = 3;
const RESTART_WINDOW: Duration = Duration::from_secs(300);
const EXE_SUFFIX: &str = std::env::consts::EXE_SUFFIX;

pub struct Config {
    pub data: DataDir,
    pub resources: PathBuf,
    pub shell_exe: PathBuf,
    pub version: String,
    /// Backend without lifespan, only until the SQLite work (F1-05*) lands.
    pub minimal_backend: bool,
    pub report_file: Option<PathBuf>,
}

#[derive(Serialize, Clone, Default)]
pub struct SidecarStatus {
    pub name: String,
    pub state: String,
    pub pid: Option<u32>,
    pub port: Option<u16>,
    pub restarts: usize,
}

#[derive(Serialize, Clone, Default)]
pub struct Status {
    /// "preparing" | "ready" | "error" | "stopped"
    pub phase: String,
    pub message: Option<String>,
    /// "restore_backup" (exit 3) | "diagnostics" (repeated crashes, timeouts)
    pub hint: Option<String>,
    pub version: String,
    pub shell_pid: u32,
    pub data_dir: String,
    pub frontend_url: Option<String>,
    pub tunnel_url: Option<String>,
    pub cloudflared_pid: Option<u32>,
    pub sidecars: Vec<SidecarStatus>,
}

enum Command {
    Stop(Sender<()>),
}

pub struct Handle {
    commands: Sender<Command>,
    pub status: Arc<Mutex<Status>>,
    thread: Mutex<Option<JoinHandle<()>>>,
}

impl Handle {
    /// Stops every sidecar (reverse order) and waits for the supervisor thread.
    pub fn stop(&self) {
        let (reply, done) = mpsc::channel();
        if self.commands.send(Command::Stop(reply)).is_ok() {
            let _ = done.recv_timeout(Duration::from_secs(60));
        }
        if let Some(thread) = self.thread.lock().unwrap().take() {
            let _ = thread.join();
        }
    }

    pub fn snapshot(&self) -> Status {
        self.status.lock().unwrap().clone()
    }
}

pub fn start(config: Config) -> Handle {
    let status = Arc::new(Mutex::new(Status {
        phase: "preparing".into(),
        version: config.version.clone(),
        shell_pid: std::process::id(),
        data_dir: config.data.root.display().to_string(),
        ..Status::default()
    }));
    let (commands, receiver) = mpsc::channel();
    let shared = Arc::clone(&status);
    let thread = std::thread::Builder::new()
        .name("supervisor".into())
        .spawn(move || Supervisor::new(config, shared, receiver).run())
        .expect("supervisor thread");
    Handle { commands, status, thread: Mutex::new(Some(thread)) }
}

fn secret() -> String {
    let mut bytes = [0u8; 32];
    getrandom::fill(&mut bytes).expect("system random generator");
    base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(bytes)
}

/// Why a start did not succeed.
enum Failure {
    /// Shown to the teacher; no automatic retry.
    Fatal(String, Option<&'static str>),
    /// The user asked to quit while waiting.
    Stopping,
}

enum Wait {
    Ready(String),
    Exited(std::process::ExitStatus),
    Timeout,
    Stopping,
}

struct Supervisor {
    config: Config,
    shell: ShellConfig,
    job: platform::Job,
    shell_secret: String,
    frontend_secret: String,
    status: Arc<Mutex<Status>>,
    commands: Receiver<Command>,
    pending_stop: Option<Sender<()>>,
    backend: Option<Proc>,
    frontend: Option<Proc>,
    tunnel: Option<Proc>,
    tunnel_log_offset: u64,
    tunnel_started: Option<Instant>,
    crashes: HashMap<&'static str, Vec<Instant>>,
    version_error: Option<String>,
}

impl Supervisor {
    fn new(config: Config, status: Arc<Mutex<Status>>, commands: Receiver<Command>) -> Supervisor {
        let shell = config.data.load_config();
        Supervisor {
            config,
            shell,
            job: platform::Job::new().expect("Job Object"),
            shell_secret: secret(),
            frontend_secret: secret(),
            status,
            commands,
            pending_stop: None,
            backend: None,
            frontend: None,
            tunnel: None,
            tunnel_log_offset: 0,
            tunnel_started: None,
            crashes: HashMap::new(),
            version_error: None,
        }
    }

    fn run(mut self) {
        let stopped = pids::cleanup(&self.config.data.run());
        if !stopped.is_empty() {
            logs::log(format!("pulizia: fermati i processi rimasti dal lancio precedente: {stopped:?}"));
        }
        match self.start_all() {
            Ok(()) => match self.version_error.clone() {
                Some(message) => self.set_phase("error", Some(message), None),
                None => self.set_phase("ready", None, None),
            },
            Err(Failure::Fatal(message, hint)) => self.fail(message, hint),
            Err(Failure::Stopping) => {}
        }
        loop {
            if let Some(reply) = self.pending_stop.take() {
                self.stop_all();
                let _ = reply.send(());
                return;
            }
            match self.commands.recv_timeout(POLL) {
                Ok(Command::Stop(reply)) => self.pending_stop = Some(reply),
                Err(RecvTimeoutError::Timeout) => self.watch(),
                Err(RecvTimeoutError::Disconnected) => {
                    self.stop_all();
                    return;
                }
            }
        }
    }

    // ---- start ----

    fn start_all(&mut self) -> Result<(), Failure> {
        self.start_backend()?;
        self.ensure_frontend()?;
        if self.version_error.is_none() {
            self.start_tunnel()?;
        }
        Ok(())
    }

    fn timeout(&self) -> Duration {
        if self.config.data.first_run {
            FIRST_START_TIMEOUT
        } else {
            START_TIMEOUT
        }
    }

    /// Records a crash; false once the budget (3 in 5 minutes) is spent.
    fn may_restart(&mut self, name: &'static str) -> bool {
        let now = Instant::now();
        let crashes = self.crashes.entry(name).or_default();
        crashes.retain(|at| now.duration_since(*at) < RESTART_WINDOW);
        if crashes.len() >= MAX_RESTARTS {
            return false;
        }
        crashes.push(now);
        true
    }

    fn wait_ready(&mut self, proc: &mut Proc, probe: &dyn Fn(u16) -> Result<String, String>) -> Wait {
        let started = Instant::now();
        let timeout = self.timeout();
        loop {
            if let Ok(Command::Stop(reply)) = self.commands.try_recv() {
                self.pending_stop = Some(reply);
                return Wait::Stopping;
            }
            if let Some(status) = proc.try_wait() {
                return Wait::Exited(status);
            }
            if let Ok(body) = probe(proc.port.unwrap_or(0)) {
                return Wait::Ready(body);
            }
            if started.elapsed() > timeout {
                return Wait::Timeout;
            }
            std::thread::sleep(POLL);
        }
    }

    fn backend_spec(&self, port: u16) -> Spec {
        let backend_dir = self.config.resources.join("backend");
        let bundled = backend_dir.join("_internal");
        let docs = bundled.join("docs-counselorbot").to_string_lossy().into_owned();
        let mut env = vec![
            ("COUNSELORBOT_PROFILE".to_string(), "teacher-pc".to_string()),
            ("AUTH_PROVIDER".into(), "local".into()),
            ("HOST".into(), "127.0.0.1".into()),
            ("PORT".into(), port.to_string()),
            ("COUNSELORBOT_SHELL_SECRET".into(), self.shell_secret.clone()),
            ("COUNSELORBOT_FRONTEND_SECRET".into(), self.frontend_secret.clone()),
            ("OLLAMA_PRELOAD".into(), "false".into()),
            ("COUNSELORBOT_DOCS_DIR".into(), docs.clone()),
            ("RAG_DOCS_DIR".into(), docs),
            ("PYTHONUNBUFFERED".into(), "1".into()),
        ];
        env.extend(self.config.data.backend_env());
        if let Some(origin) = &self.status.lock().unwrap().tunnel_url {
            env.push(("COUNSELORBOT_PUBLIC_ORIGIN".into(), origin.clone()));
        }
        let native = self.config.resources.join("native").join("bin");
        if native.is_dir() {
            env.push(("NATIVE_BIN_DIR".into(), native.to_string_lossy().into_owned()));
        }
        let mut args: Vec<OsString> = vec!["--lifeline".into()];
        if self.config.minimal_backend {
            args.push("--minimal".into());
        }
        Spec {
            name: "backend",
            program: backend_dir.join(format!("counselorbot-backend{EXE_SUFFIX}")),
            args,
            env,
            cwd: self.config.data.root.clone(),
            log_file: "backend.log",
            lifeline: true,
        }
    }

    fn start_backend(&mut self) -> Result<(), Failure> {
        let secret = self.shell_secret.clone();
        let probe = move |port: u16| -> Result<String, String> {
            let (status, body) = health::get(port, "/health", &[])?;
            if status != 200 {
                return Err(format!("health {status}"));
            }
            // Same secret: the backend on this port is the one this shell started.
            let (ping, _) = health::get(port, "/internal/ping", &[("X-CounselorBot-Shell-Secret", &secret)])?;
            if ping != 200 {
                return Err(format!("internal {ping}"));
            }
            Ok(body)
        };
        for _ in 0..PORT_ATTEMPTS {
            let port = health::free_port().map_err(|e| Failure::Fatal(format!("porta: {e}"), None))?;
            let spec = self.backend_spec(port);
            let mut proc = sidecar::spawn(&spec, &self.config.data.logs(), &self.job, Some(port))
                .map_err(|e| Failure::Fatal(format!("avvio del backend: {e}"), Some("diagnostics")))?;
            self.write_pids(Some(&proc));
            match self.wait_ready(&mut proc, &probe) {
                Wait::Ready(body) => {
                    self.check_version(&body);
                    self.backend = Some(proc);
                    self.publish();
                    return Ok(());
                }
                Wait::Exited(status) => match sidecar::classify(status) {
                    Exit::PortInUse => {
                        logs::log(format!("backend: porta {port} occupata, nuovo tentativo"));
                        continue;
                    }
                    Exit::DataUnusable => {
                        return Err(Failure::Fatal(
                            "Cartella dati o database inutilizzabile (permessi, disco pieno o database danneggiato)."
                                .into(),
                            Some("restore_backup"),
                        ))
                    }
                    Exit::Requested => {
                        return Err(Failure::Fatal(
                            "Il backend si e' fermato durante l'avvio.".into(),
                            Some("diagnostics"),
                        ))
                    }
                    Exit::Crash => {
                        logs::log(format!("backend: uscito durante l'avvio ({status})"));
                        if self.may_restart("backend") {
                            continue;
                        }
                        return Err(Failure::Fatal("Il backend si chiude a ogni avvio.".into(), Some("diagnostics")));
                    }
                },
                Wait::Timeout => {
                    proc.stop();
                    return Err(Failure::Fatal(
                        format!("Il backend non risponde dopo {} s.", self.timeout().as_secs()),
                        Some("diagnostics"),
                    ));
                }
                Wait::Stopping => {
                    proc.stop();
                    return Err(Failure::Stopping);
                }
            }
        }
        Err(Failure::Fatal("Nessuna porta libera per il backend dopo 3 tentativi.".into(), Some("diagnostics")))
    }

    fn check_version(&mut self, body: &str) {
        let health: serde_json::Value = serde_json::from_str(body).unwrap_or_default();
        let version = health["version"].as_str().unwrap_or("?");
        let contract = health["desktop_contract"].as_u64().unwrap_or(0);
        if version != self.config.version || contract != DESKTOP_CONTRACT {
            let message = format!(
                "Backend {version} (contratto {contract}) diverso dal guscio {} (contratto {DESKTOP_CONTRACT}): tunnel non pubblicato.",
                self.config.version
            );
            logs::log(&message);
            self.version_error = Some(message);
        } else {
            self.version_error = None;
        }
        // A restart may load a different backend. Never leave an existing
        // tunnel published after the version/contract check fails.
        if self.version_error.is_some() {
            if let Some(tunnel) = self.tunnel.take() {
                tunnel.stop();
            }
            self.status.lock().unwrap().tunnel_url = None;
        }
    }

    fn frontend_spec(&self, port: u16, backend_port: u16) -> Spec {
        let frontend_dir = self.config.resources.join("frontend");
        Spec {
            name: "frontend",
            program: self.config.resources.join("node").join(format!("node{EXE_SUFFIX}")),
            args: vec![frontend_dir.join("server-wrapper.js").into_os_string(), "--lifeline".into()],
            env: vec![
                ("NODE_ENV".into(), "production".into()),
                ("NEXT_TELEMETRY_DISABLED".into(), "1".into()),
                ("HOSTNAME".into(), "127.0.0.1".into()),
                ("PORT".into(), port.to_string()),
                ("BACKEND_ORIGIN".into(), format!("http://127.0.0.1:{backend_port}")),
                ("COUNSELORBOT_FRONTEND_SECRET".into(), self.frontend_secret.clone()),
            ],
            cwd: frontend_dir,
            log_file: "frontend.log",
            lifeline: true,
        }
    }

    /// Saved port if free (a stable bookmark for the teacher), else a new one, saved.
    fn frontend_port(&mut self, avoid: Option<u16>) -> Result<u16, Failure> {
        if let Some(saved) = self.shell.frontend_port {
            if Some(saved) != avoid && health::is_free(saved) {
                return Ok(saved);
            }
        }
        let port = health::free_port().map_err(|e| Failure::Fatal(format!("porta: {e}"), None))?;
        self.shell.frontend_port = Some(port);
        if let Err(error) = self.config.data.save_config(&self.shell) {
            logs::log(format!("config/shell.json non salvato: {error}"));
        }
        Ok(port)
    }

    fn ensure_frontend(&mut self) -> Result<(), Failure> {
        let backend_port = self.backend.as_ref().and_then(|b| b.port).unwrap_or(0);
        let probe = |port: u16| -> Result<String, String> {
            let (status, _) = health::get(port, "/", &[])?;
            if status < 500 {
                Ok(String::new())
            } else {
                Err(format!("frontend {status}"))
            }
        };
        let mut avoid = None;
        for _ in 0..PORT_ATTEMPTS {
            let port = self.frontend_port(avoid)?;
            let spec = self.frontend_spec(port, backend_port);
            let mut proc = sidecar::spawn(&spec, &self.config.data.logs(), &self.job, Some(port))
                .map_err(|e| Failure::Fatal(format!("avvio del frontend: {e}"), Some("diagnostics")))?;
            self.write_pids(Some(&proc));
            match self.wait_ready(&mut proc, &probe) {
                Wait::Ready(_) => {
                    self.frontend = Some(proc);
                    self.publish();
                    return Ok(());
                }
                Wait::Exited(status) if sidecar::classify(status) == Exit::PortInUse => {
                    logs::log(format!("frontend: porta {port} occupata, nuovo tentativo"));
                    avoid = Some(port);
                    self.shell.frontend_port = None;
                }
                Wait::Exited(status) => {
                    logs::log(format!("frontend: uscito durante l'avvio ({status})"));
                    if !self.may_restart("frontend") {
                        return Err(Failure::Fatal("Il frontend si chiude a ogni avvio.".into(), Some("diagnostics")));
                    }
                }
                Wait::Timeout => {
                    proc.stop();
                    return Err(Failure::Fatal("Il frontend non risponde.".into(), Some("diagnostics")));
                }
                Wait::Stopping => {
                    proc.stop();
                    return Err(Failure::Stopping);
                }
            }
        }
        Err(Failure::Fatal("Il frontend non parte dopo 3 tentativi.".into(), Some("diagnostics")))
    }

    fn start_tunnel(&mut self) -> Result<(), Failure> {
        let mode = self.shell.tunnel.mode.clone();
        if mode == "named" {
            return Err(Failure::Fatal(
                "Il tunnel nominativo richiede la configurazione prevista in F1-10.".into(),
                None,
            ));
        }
        if mode != "quick" {
            return Ok(());
        }
        let port = self.frontend.as_ref().and_then(|f| f.port).unwrap_or(0);
        let url = format!("http://127.0.0.1:{port}");
        let cloudflared = self.config.resources.join("cloudflared").join(format!("cloudflared{EXE_SUFFIX}"));
        let mut tunnel_args: Vec<OsString> = vec!["tunnel".into(), "--no-autoupdate".into()];
        tunnel_args.extend(["--url".into(), url.into()]);
        let spec = if cfg!(windows) {
            // The Job Object stops cloudflared with the shell: no lifeline needed.
            Spec {
                name: "cloudflared",
                program: cloudflared,
                args: tunnel_args,
                env: vec![],
                cwd: self.config.data.root.clone(),
                log_file: "cloudflared.log",
                lifeline: false,
            }
        } else {
            let pid_file = self.config.data.run().join(pids::CLOUDFLARED_FILE);
            let mut args: Vec<OsString> = vec!["--lifeline".into(), "--pid-file".into(), pid_file.into(), "--".into()];
            args.push(cloudflared.into_os_string());
            args.extend(tunnel_args);
            Spec {
                name: "cloudflared",
                program: self.config.shell_exe.clone(),
                args,
                env: vec![],
                cwd: self.config.data.root.clone(),
                log_file: "cloudflared.log",
                lifeline: true,
            }
        };
        self.tunnel_log_offset =
            std::fs::metadata(self.config.data.logs().join("cloudflared.log")).map(|m| m.len()).unwrap_or(0);
        let proc = sidecar::spawn(&spec, &self.config.data.logs(), &self.job, None)
            .map_err(|e| Failure::Fatal(format!("avvio di cloudflared: {e}"), Some("diagnostics")))?;
        // A rotation at spawn starts a new file.
        if std::fs::metadata(self.config.data.logs().join("cloudflared.log")).map(|m| m.len()).unwrap_or(0)
            < self.tunnel_log_offset
        {
            self.tunnel_log_offset = 0;
        }
        self.tunnel = Some(proc);
        self.tunnel_started = Some(Instant::now());
        self.status.lock().unwrap().tunnel_url = None;
        self.publish();
        Ok(())
    }

    // ---- watch ----

    fn watch(&mut self) {
        if self.status.lock().unwrap().phase == "error" && self.backend.is_none() {
            return;
        }
        if let Some(status) = self.backend.as_mut().and_then(|p| p.try_wait()) {
            self.backend = None;
            logs::log(format!("backend: uscito ({status})"));
            match sidecar::classify(status) {
                Exit::Requested => self.fail("Il backend si e' fermato.".into(), Some("diagnostics")),
                Exit::DataUnusable => self.fail(
                    "Cartella dati o database inutilizzabile (permessi, disco pieno o database danneggiato).".into(),
                    Some("restore_backup"),
                ),
                Exit::PortInUse | Exit::Crash => {
                    if self.may_restart("backend") {
                        self.restart_after_backend();
                    } else {
                        self.fail("Il backend si e' chiuso 3 volte in 5 minuti.".into(), Some("diagnostics"));
                    }
                }
            }
            return;
        }
        if let Some(status) = self.frontend.as_mut().and_then(|p| p.try_wait()) {
            self.frontend = None;
            logs::log(format!("frontend: uscito ({status})"));
            if self.may_restart("frontend") {
                self.restart_frontend();
            } else {
                self.fail("Il frontend si e' chiuso 3 volte in 5 minuti.".into(), Some("diagnostics"));
            }
            return;
        }
        if let Some(status) = self.tunnel.as_mut().and_then(|p| p.try_wait()) {
            self.tunnel = None;
            logs::log(format!("cloudflared: uscito ({status})"));
            if self.may_restart("cloudflared") {
                if let Err(Failure::Fatal(message, hint)) = self.start_tunnel() {
                    self.fail(message, hint);
                }
            } else {
                self.fail("Il tunnel si e' chiuso 3 volte in 5 minuti.".into(), Some("diagnostics"));
            }
            return;
        }
        if self.read_tunnel_url() {
            // ADR-0002 §2.1: the public origin changes with every quick tunnel.
            // Restart the backend with it, and the frontend with its new port.
            self.restart_after_backend();
        } else if self.shell.tunnel.mode == "quick"
            && self.status.lock().unwrap().tunnel_url.is_none()
            && self.tunnel_started.is_some_and(|at| at.elapsed() > self.timeout())
        {
            self.fail("Il quick tunnel non ha restituito un URL entro il timeout.".into(), Some("diagnostics"));
        }
    }

    /// A new backend has a new port: the frontend restarts with the new BACKEND_ORIGIN.
    fn restart_after_backend(&mut self) {
        self.set_phase("preparing", None, None);
        if let Some(frontend) = self.frontend.take() {
            frontend.stop();
        }
        if let Some(backend) = self.backend.take() {
            backend.stop();
        }
        let result = self.start_backend().and_then(|_| self.after_frontend_restart());
        self.settle(result);
    }

    fn restart_frontend(&mut self) {
        self.set_phase("preparing", None, None);
        let result = self.after_frontend_restart();
        self.settle(result);
    }

    fn after_frontend_restart(&mut self) -> Result<(), Failure> {
        let before = self.shell.frontend_port;
        self.ensure_frontend()?;
        // cloudflared points at the frontend port: follow it if it moved.
        if self.shell.frontend_port != before || (self.tunnel.is_none() && self.version_error.is_none()) {
            if let Some(tunnel) = self.tunnel.take() {
                tunnel.stop();
            }
            if self.version_error.is_none() {
                self.start_tunnel()?;
            }
        }
        Ok(())
    }

    fn settle(&mut self, result: Result<(), Failure>) {
        match result {
            Ok(()) => match self.version_error.clone() {
                Some(message) => self.set_phase("error", Some(message), None),
                None => self.set_phase("ready", None, None),
            },
            Err(Failure::Fatal(message, hint)) => self.fail(message, hint),
            Err(Failure::Stopping) => {}
        }
    }

    fn read_tunnel_url(&mut self) -> bool {
        if self.tunnel.is_none()
            || self.shell.tunnel.mode != "quick"
            || self.status.lock().unwrap().tunnel_url.is_some()
        {
            return false;
        }
        let Ok(text) = std::fs::read(self.config.data.logs().join("cloudflared.log")) else { return false };
        let start = (self.tunnel_log_offset as usize).min(text.len());
        let text = String::from_utf8_lossy(&text[start..]);
        if let Some(url) = find_quick_tunnel_url(&text) {
            logs::log(format!("cloudflared: tunnel {url}"));
            self.status.lock().unwrap().tunnel_url = Some(url);
            return true;
        }
        false
    }

    // ---- stop ----

    fn stop_all(&mut self) {
        logs::log("arresto dei sidecar");
        for proc in [self.tunnel.take(), self.frontend.take(), self.backend.take()].into_iter().flatten() {
            proc.stop();
        }
        let _ = std::fs::remove_file(self.config.data.run().join(pids::SIDECARS_FILE));
        self.set_phase("stopped", None, None);
    }

    fn fail(&mut self, message: String, hint: Option<&'static str>) {
        logs::log(format!("errore: {message}"));
        for proc in [self.tunnel.take(), self.frontend.take(), self.backend.take()].into_iter().flatten() {
            proc.stop();
        }
        self.set_phase("error", Some(message), hint);
    }

    // ---- status ----

    fn set_phase(&mut self, phase: &str, message: Option<String>, hint: Option<&'static str>) {
        {
            let mut status = self.status.lock().unwrap();
            status.phase = phase.into();
            status.message = message;
            status.hint = hint.map(String::from);
        }
        self.publish();
    }

    fn write_pids(&self, starting: Option<&Proc>) {
        let records: Vec<pids::Record> =
            [self.backend.as_ref(), self.frontend.as_ref(), self.tunnel.as_ref(), starting]
                .into_iter()
                .flatten()
                .filter_map(|p| p.record.clone())
                .collect();
        if let Err(error) = pids::write(&self.config.data.run(), pids::SIDECARS_FILE, &records) {
            logs::log(format!("run/sidecars.json non scritto: {error}"));
        }
    }

    fn publish(&mut self) {
        self.write_pids(None);
        let cloudflared_pid = if cfg!(windows) {
            self.tunnel.as_ref().map(|t| t.pid())
        } else {
            pids::read(&self.config.data.run(), pids::CLOUDFLARED_FILE).first().map(|r| r.pid)
        };
        let describe = |name: &str, proc: Option<&Proc>, restarts: usize| SidecarStatus {
            name: name.into(),
            state: if proc.is_some() { "running".into() } else { "stopped".into() },
            pid: proc.map(|p| p.pid()),
            port: proc.and_then(|p| p.port),
            restarts,
        };
        let restarts = |name: &str| self.crashes.get(name).map(Vec::len).unwrap_or(0);
        let sidecars = vec![
            describe("backend", self.backend.as_ref(), restarts("backend")),
            describe("frontend", self.frontend.as_ref(), restarts("frontend")),
            describe("cloudflared", self.tunnel.as_ref(), restarts("cloudflared")),
        ];
        let snapshot = {
            let mut status = self.status.lock().unwrap();
            status.frontend_url = self.frontend.as_ref().and_then(|f| f.port).map(|p| format!("http://127.0.0.1:{p}"));
            status.cloudflared_pid = cloudflared_pid;
            status.sidecars = sidecars;
            status.clone()
        };
        if let Some(file) = &self.config.report_file {
            let _ = std::fs::write(file, serde_json::to_string_pretty(&snapshot).unwrap_or_default());
        }
    }
}

/// First `https://<name>.trycloudflare.com` in cloudflared's log.
pub fn find_quick_tunnel_url(text: &str) -> Option<String> {
    text.match_indices("https://").find_map(|(start, _)| {
        let rest = &text[start..];
        let end = rest.find(|c: char| c.is_whitespace() || c == '|' || c == '"').unwrap_or(rest.len());
        let url = &rest[..end];
        let host = &url["https://".len()..];
        (host.ends_with(".trycloudflare.com") && host != "api.trycloudflare.com").then(|| url.to_string())
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn supervisor(name: &str) -> Supervisor {
        let root = std::env::temp_dir().join(format!("cb-supervisor-{name}-{}", std::process::id()));
        let data = DataDir::prepare(root, "1.2.3").unwrap();
        let (_, receiver) = mpsc::channel();
        Supervisor::new(
            Config {
                resources: data.path("resources"),
                shell_exe: std::env::current_exe().unwrap(),
                data,
                version: "1.2.3".into(),
                minimal_backend: true,
                report_file: None,
            },
            Arc::new(Mutex::new(Status::default())),
            receiver,
        )
    }

    #[test]
    fn sidecar_environment_obeys_the_frozen_contract() {
        let supervisor = supervisor("env");
        let backend = supervisor.backend_spec(32101);
        let frontend = supervisor.frontend_spec(32102, 32101);
        let env =
            |spec: &Spec, name: &str| spec.env.iter().find(|(key, _)| key == name).map(|(_, value)| value.clone());
        assert_eq!(env(&backend, "HOST").as_deref(), Some("127.0.0.1"));
        assert_eq!(env(&frontend, "HOSTNAME").as_deref(), Some("127.0.0.1"));
        assert_eq!(env(&frontend, "BACKEND_ORIGIN").as_deref(), Some("http://127.0.0.1:32101"));
        assert_eq!(env(&backend, "AUTH_PROVIDER").as_deref(), Some("local"));
        assert_eq!(env(&backend, "COUNSELORBOT_PROFILE").as_deref(), Some("teacher-pc"));
        assert_eq!(env(&backend, "OLLAMA_PRELOAD").as_deref(), Some("false"));
        assert!(env(&frontend, "COUNSELORBOT_SHELL_SECRET").is_none());
        assert_eq!(env(&backend, "COUNSELORBOT_FRONTEND_SECRET"), env(&frontend, "COUNSELORBOT_FRONTEND_SECRET"));
        assert!(backend.lifeline && frontend.lifeline);
        supervisor.status.lock().unwrap().tunnel_url = Some("https://fixture.trycloudflare.com".into());
        assert_eq!(
            env(&supervisor.backend_spec(32103), "COUNSELORBOT_PUBLIC_ORIGIN").as_deref(),
            Some("https://fixture.trycloudflare.com")
        );
        std::fs::remove_dir_all(&supervisor.config.data.root).unwrap();
    }

    #[test]
    fn version_and_contract_mismatch_prevent_tunnel_publication() {
        let mut supervisor = supervisor("version");
        supervisor.check_version(r#"{"version":"1.2.3","desktop_contract":1}"#);
        assert!(supervisor.version_error.is_none());
        for health in
            [r#"{"version":"9.0.0","desktop_contract":1}"#, r#"{"version":"1.2.3","desktop_contract":2}"#, "invalid"]
        {
            supervisor.status.lock().unwrap().tunnel_url = Some("https://fixture.trycloudflare.com".into());
            supervisor.check_version(health);
            assert!(supervisor.version_error.is_some());
            assert!(supervisor.status.lock().unwrap().tunnel_url.is_none());
        }
        std::fs::remove_dir_all(&supervisor.config.data.root).unwrap();
    }

    #[test]
    fn crash_budget_allows_three_restarts_in_five_minutes() {
        let mut supervisor = supervisor("budget");
        for _ in 0..3 {
            assert!(supervisor.may_restart("backend"));
        }
        assert!(!supervisor.may_restart("backend"));
        assert!(supervisor.may_restart("frontend"));
        supervisor.crashes.insert("backend", vec![Instant::now() - RESTART_WINDOW]);
        assert!(supervisor.may_restart("backend"));
        assert_eq!(supervisor.crashes["backend"].len(), 1);
        std::fs::remove_dir_all(&supervisor.config.data.root).unwrap();
    }

    #[test]
    fn mismatch_stops_an_already_running_tunnel() {
        let mut supervisor = supervisor("running-mismatch");
        let (program, args) = if cfg!(windows) {
            ("powershell", vec!["-NoProfile", "-Command", "Start-Sleep -Seconds 60"])
        } else {
            ("sleep", vec!["60"])
        };
        let spec = Spec {
            name: "cloudflared",
            program: program.into(),
            args: args.into_iter().map(OsString::from).collect(),
            env: vec![],
            cwd: supervisor.config.data.root.clone(),
            log_file: "cloudflared.log",
            lifeline: false,
        };
        let tunnel = sidecar::spawn(&spec, &supervisor.config.data.logs(), &supervisor.job, None).unwrap();
        let record = tunnel.record.clone().unwrap();
        assert!(pids::alive(&record));
        supervisor.tunnel = Some(tunnel);
        supervisor.check_version(r#"{"version":"9.0.0","desktop_contract":1}"#);
        assert!(supervisor.tunnel.is_none());
        assert!(!pids::alive(&record));
        std::fs::remove_dir_all(&supervisor.config.data.root).unwrap();
    }

    #[test]
    fn quick_tunnel_url_is_read_from_the_log() {
        let log = "2026-10-24T10:00:00Z INF Requesting new quick Tunnel on trycloudflare.com...\n\
                   2026-10-24T10:00:02Z INF |  https://brave-lion-example.trycloudflare.com                      |\n";
        assert_eq!(find_quick_tunnel_url(log).as_deref(), Some("https://brave-lion-example.trycloudflare.com"));
        assert_eq!(find_quick_tunnel_url("ERR failed to request https://api.trycloudflare.com/tunnel"), None);
        assert_eq!(find_quick_tunnel_url("nothing yet"), None);
    }

    #[test]
    fn secrets_are_32_random_bytes_base64url() {
        let a = secret();
        let b = secret();
        assert_eq!(a.len(), 43);
        assert_ne!(a, b);
        assert!(a.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_'));
    }
}
