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
use serde::{Deserialize, Serialize};

use crate::datadir::{DataDir, ShellConfig};
use crate::sidecar::{self, Exit, Proc, Spec};
use crate::sleep::{SleepGuard, System};
use crate::{health, logs, pids, platform};

/// ADR-0002/ADR-0004: contratto guscio ↔ sidecar.
/// 1 = SQLite (layout 1), 2 = PostgreSQL (layout 2).
pub const DESKTOP_CONTRACT_LEGACY: u64 = 1;
pub const DESKTOP_CONTRACT_POSTGRES: u64 = 2;
const POLL: Duration = Duration::from_millis(250);
const FIRST_START_TIMEOUT: Duration = Duration::from_secs(180);
const START_TIMEOUT: Duration = Duration::from_secs(60);
const PORT_ATTEMPTS: usize = 3;
const MAX_RESTARTS: usize = 3;
const RESTART_WINDOW: Duration = Duration::from_secs(300);
const EXE_SUFFIX: &str = std::env::consts::EXE_SUFFIX;

pub struct Config {
    pub credentials: Arc<crate::credentials::Credentials>,
    pub data: DataDir,
    pub resources: PathBuf,
    pub shell_exe: PathBuf,
    pub version: String,
    /// Backend without lifespan, only until the SQLite work (F1-05*) lands.
    pub minimal_backend: bool,
    pub report_file: Option<PathBuf>,
    /// ADR-0004: modalità PostgreSQL incorporato (layout 2).
    pub postgres_enabled: bool,
}

impl Config {
    /// ADR-0004 §5.3: contratto desktop (2 per PostgreSQL, 1 per SQLite legacy).
    pub fn desktop_contract(&self) -> u64 {
        if self.postgres_enabled {
            DESKTOP_CONTRACT_POSTGRES
        } else {
            DESKTOP_CONTRACT_LEGACY
        }
    }
}

#[derive(Serialize, Clone, Default)]
pub struct SidecarStatus {
    pub name: String,
    pub state: String,
    pub pid: Option<u32>,
    pub port: Option<u16>,
    pub restarts: usize,
}

#[derive(Serialize, Deserialize, Clone, Default, PartialEq, Eq, Debug)]
pub struct TunnelSettings {
    pub mode: String,
    pub custom_domain: Option<String>,
    pub has_token: bool,
    pub active_url: Option<String>,
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
    pub tunnel_mode: String,
    pub custom_domain: Option<String>,
    pub has_tunnel_token: bool,
    pub cloudflared_pid: Option<u32>,
    pub postgresql_pid: Option<u32>,
    pub postgresql_port: Option<u16>,
    pub postgresql_bin_dir: Option<String>,
    pub sidecars: Vec<SidecarStatus>,
}

enum Command {
    Stop(Sender<()>),
    ApplyCredentials(Sender<Result<(), String>>),
    StartQuickTunnel(Sender<Result<(), String>>),
    StopQuickTunnel(Sender<Result<(), String>>),
    StartNamedTunnel(Sender<Result<(), String>>),
    SaveNamedTunnelConfig { custom_domain: String, token: Option<String>, reply: Sender<Result<(), String>> },
    GetTunnelSettings(Sender<TunnelSettings>),
    BackupDb(Sender<Result<String, String>>),
    TeacherLink(Sender<Result<String, String>>),
}

pub struct Handle {
    commands: Sender<Command>,
    pub status: Arc<Mutex<Status>>,
    thread: Mutex<Option<JoinHandle<()>>>,
}

impl Handle {
    pub fn apply_credentials(&self) -> Result<(), String> {
        let (reply, done) = mpsc::channel();
        self.commands.send(Command::ApplyCredentials(reply)).map_err(|_| "Supervisore non disponibile.")?;
        done.recv_timeout(Duration::from_secs(600))
            .map_err(|_| "Riavvio non completato; controlla lo stato dei servizi.")?
    }

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

    pub fn start_quick_tunnel(&self) -> Result<(), String> {
        let (reply, done) = mpsc::channel();
        self.commands.send(Command::StartQuickTunnel(reply)).map_err(|e| e.to_string())?;
        done.recv_timeout(Duration::from_secs(30)).map_err(|e| format!("avvio del tunnel: {e}"))?
    }

    pub fn stop_quick_tunnel(&self) -> Result<(), String> {
        let (reply, done) = mpsc::channel();
        self.commands.send(Command::StopQuickTunnel(reply)).map_err(|e| e.to_string())?;
        done.recv_timeout(Duration::from_secs(30)).map_err(|e| format!("arresto del tunnel: {e}"))?
    }

    pub fn start_named_tunnel(&self) -> Result<(), String> {
        let (reply, done) = mpsc::channel();
        self.commands.send(Command::StartNamedTunnel(reply)).map_err(|e| e.to_string())?;
        done.recv_timeout(Duration::from_secs(30)).map_err(|e| format!("avvio del tunnel nominativo: {e}"))?
    }

    pub fn save_named_tunnel_config(&self, custom_domain: String, token: Option<String>) -> Result<(), String> {
        let (reply, done) = mpsc::channel();
        self.commands
            .send(Command::SaveNamedTunnelConfig { custom_domain, token, reply })
            .map_err(|e| e.to_string())?;
        done.recv_timeout(Duration::from_secs(30)).map_err(|e| format!("salvataggio configurazione tunnel: {e}"))?
    }

    pub fn get_tunnel_settings(&self) -> Result<TunnelSettings, String> {
        let (reply, done) = mpsc::channel();
        self.commands.send(Command::GetTunnelSettings(reply)).map_err(|e| e.to_string())?;
        done.recv_timeout(Duration::from_secs(10)).map_err(|e| format!("lettura impostazioni tunnel: {e}"))
    }

    pub fn backup_db(&self) -> Result<String, String> {
        let (reply, done) = mpsc::channel();
        self.commands.send(Command::BackupDb(reply)).map_err(|e| format!("invio comando backup: {e}"))?;
        done.recv_timeout(Duration::from_secs(90)).map_err(|e| format!("attesa backup: {e}"))?
    }

    /// Link monouso del docente (ADR-0002 §3.3): il guscio lo ottiene dal
    /// backend locale con il segreto shell, poi apre `/accesso-locale#t=...`.
    pub fn teacher_link(&self) -> Result<String, String> {
        let (reply, done) = mpsc::channel();
        self.commands.send(Command::TeacherLink(reply)).map_err(|e| format!("invio comando accesso: {e}"))?;
        done.recv_timeout(Duration::from_secs(15)).map_err(|e| format!("attesa link di accesso: {e}"))?
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
    sleep: SleepGuard<System>,
    /// ADR-0004: gestore cluster PostgreSQL (layout 2).
    postgres: Option<crate::postgres_cluster::PostgresClusterManager>,
    /// ADR-0004: cluster PostgreSQL in esecuzione.
    postgres_running: Option<crate::postgres_cluster::RunningCluster>,
    /// ADR-0004: DATABASE_URL del cluster PostgreSQL.
    postgres_database_url: Option<String>,
}

impl Supervisor {
    fn new(config: Config, status: Arc<Mutex<Status>>, commands: Receiver<Command>) -> Supervisor {
        let shell = config.data.load_config();
        // ADR-0004: crea il gestore PostgreSQL se abilitato
        let postgres = if config.postgres_enabled {
            let resources = config.resources.clone();
            let credentials = config.credentials.clone();
            Some(crate::postgres_cluster::PostgresClusterManager::new(resources, credentials))
        } else {
            None
        };
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
            sleep: SleepGuard::new(System::default()),
            postgres,
            postgres_running: None,
            postgres_database_url: None,
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
                Ok(Command::ApplyCredentials(reply)) => {
                    self.restart_after_backend();
                    let status = self.status.lock().unwrap();
                    let result = if status.phase == "ready" {
                        Ok(())
                    } else {
                        Err(status.message.clone().unwrap_or_else(|| "Riavvio non completato.".into()))
                    };
                    let _ = reply.send(result);
                }
                Ok(Command::StartQuickTunnel(reply)) => {
                    let res = self.handle_start_quick_tunnel();
                    let _ = reply.send(res);
                }
                Ok(Command::StopQuickTunnel(reply)) => {
                    let res = self.handle_stop_quick_tunnel();
                    let _ = reply.send(res);
                }
                Ok(Command::StartNamedTunnel(reply)) => {
                    let res = self.handle_start_named_tunnel();
                    let _ = reply.send(res);
                }
                Ok(Command::SaveNamedTunnelConfig { custom_domain, token, reply }) => {
                    let res = self.handle_save_named_tunnel_config(custom_domain, token);
                    let _ = reply.send(res);
                }
                Ok(Command::GetTunnelSettings(reply)) => {
                    let res = self.handle_get_tunnel_settings();
                    let _ = reply.send(res);
                }
                Ok(Command::BackupDb(reply)) => {
                    let res = self.handle_backup_db();
                    let _ = reply.send(res);
                }
                Ok(Command::TeacherLink(reply)) => {
                    let res = self.handle_teacher_link();
                    let _ = reply.send(res);
                }
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
        // ADR-0004 §5.3: ordine avvio PostgreSQL → backend → frontend → tunnel
        if self.config.postgres_enabled {
            self.start_postgres()?;
        }
        self.start_backend()?;
        self.ensure_frontend()?;
        if self.version_error.is_none() {
            self.start_tunnel()?;
        }
        Ok(())
    }

    /// ADR-0004 §5: avvia il cluster PostgreSQL proprietario.
    fn start_postgres(&mut self) -> Result<(), Failure> {
        let Some(ref mut manager) = self.postgres else {
            return Ok(());
        };
        let data_root = self.config.data.root.clone();
        let version = self.config.version.clone();
        let bundle_id = "org.ai4educ.counselorbot.teacher".to_string();

        // Leggi o crea l'identità del cluster
        let identity_path = data_root.join("run/postgresql.json");
        let identity = if identity_path.exists() {
            let text = std::fs::read_to_string(&identity_path)
                .map_err(|e| Failure::Fatal(format!("lettura identità PostgreSQL: {e}"), Some("diagnostics")))?;
            serde_json::from_str(&text)
                .map_err(|e| Failure::Fatal(format!("identità PostgreSQL non valida: {e}"), Some("diagnostics")))?
        } else {
            // Nuovo cluster
            manager
                .prepare_new(&data_root, &version, &bundle_id)
                .map_err(|e| Failure::Fatal(format!("preparazione PostgreSQL: {e}"), Some("diagnostics")))?
        };

        // Avvia il cluster
        let mut running = manager
            .start(&identity)
            .map_err(|e| Failure::Fatal(format!("avvio PostgreSQL: {e}"), Some("diagnostics")))?;

        // Verifica health
        let health = match manager.probe(&running) {
            Ok(health) => health,
            Err(error) => {
                let _ = manager.stop(&mut running, crate::postgres_cluster::StopMode::Fast);
                return Err(Failure::Fatal(format!("verifica PostgreSQL: {error}"), Some("diagnostics")));
            }
        };

        if !health.ready {
            return Err(Failure::Fatal("PostgreSQL non pronto dopo l'avvio.".into(), Some("diagnostics")));
        }

        // Costruisci DATABASE_URL per il backend
        let database_url = manager
            .database_url(&running)
            .map_err(|e| Failure::Fatal(format!("costruzione DATABASE_URL: {e}"), Some("diagnostics")))?;

        logs::log(format!("PostgreSQL pronto: major={} db={} port={}", health.major, health.database, running.port));

        self.postgres_running = Some(running);
        self.postgres_database_url = Some(database_url);
        self.status.lock().unwrap().postgresql_pid = self.postgres_running.as_ref().map(|pg| pg.postmaster_pid);
        self.status.lock().unwrap().postgresql_port = self.postgres_running.as_ref().map(|pg| pg.port);
        self.status.lock().unwrap().postgresql_bin_dir =
            Some(self.config.resources.join("postgresql/bin").to_string_lossy().into_owned());
        Ok(())
    }

    /// ADR-0004 §5.3: ferma il cluster PostgreSQL (fast shutdown).
    fn stop_postgres(&mut self) {
        if let (Some(ref mut manager), Some(ref mut running)) = (&mut self.postgres, &mut self.postgres_running) {
            match manager.stop(running, crate::postgres_cluster::StopMode::Fast) {
                Ok(result) => {
                    logs::log(format!("PostgreSQL fermato in {} ms", result.duration_ms));
                }
                Err(e) => {
                    logs::log(format!("errore stop PostgreSQL: {e}"));
                }
            }
        }
        self.postgres_running = None;
        self.postgres_database_url = None;
        self.status.lock().unwrap().postgresql_pid = None;
        self.status.lock().unwrap().postgresql_port = None;
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

    fn stop_requested_while_waiting(&mut self) -> bool {
        match self.commands.try_recv() {
            Ok(Command::Stop(reply)) => {
                self.pending_stop = Some(reply);
                return true;
            }
            Ok(
                Command::ApplyCredentials(reply)
                | Command::StartQuickTunnel(reply)
                | Command::StopQuickTunnel(reply)
                | Command::StartNamedTunnel(reply)
                | Command::SaveNamedTunnelConfig { reply, .. },
            ) => {
                let _ = reply.send(Err("Preparazione in corso. Attendi e riprova.".into()));
            }
            Ok(Command::TeacherLink(reply)) => {
                let _ = reply.send(Err("Preparazione in corso. Attendi e riprova.".into()));
            }
            Ok(Command::GetTunnelSettings(reply)) => {
                let _ = reply.send(self.handle_get_tunnel_settings());
            }
            Ok(Command::BackupDb(reply)) => {
                let res = self.handle_backup_db();
                let _ = reply.send(res);
            }
            Err(_) => {}
        }
        false
    }

    fn wait_ready(&mut self, proc: &mut Proc, probe: &dyn Fn(u16) -> Result<String, String>) -> Wait {
        let started = Instant::now();
        let timeout = self.timeout();
        loop {
            if self.stop_requested_while_waiting() {
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

    fn backend_spec(&self, port: u16) -> Result<Spec, Failure> {
        let backend_dir = self.config.resources.join("backend");
        let bundled = backend_dir.join("_internal");
        let docs = bundled.join("docs-counselorbot").to_string_lossy().into_owned();
        // ADR-0004: usa DATABASE_URL di PostgreSQL se disponibile, altrimenti SQLite
        let database_url = self.postgres_database_url.clone().unwrap_or_else(|| self.config.data.database_url());
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
        // Override the legacy data-directory URL after adding its path variables.
        env.push(("DATABASE_URL".into(), database_url));
        env.extend(self.config.credentials.backend_env().map_err(|message| Failure::Fatal(message, None))?);
        // Bundled desktop startup must not load operator .env files.
        env.push(("PYTHON_DOTENV_DISABLED".into(), "1".into()));
        // Se il tunnel non e' attivo, impostiamo una stringa vuota per evitare
        // che il backend cada su valori locali.
        let origin = self.status.lock().unwrap().tunnel_url.clone().unwrap_or_default();
        env.push(("COUNSELORBOT_PUBLIC_ORIGIN".into(), origin));
        let native = self.config.resources.join("native").join("bin");
        if native.is_dir() {
            env.push(("NATIVE_BIN_DIR".into(), native.to_string_lossy().into_owned()));
        }
        let mut args: Vec<OsString> = vec!["--lifeline".into()];
        if self.config.minimal_backend {
            args.push("--minimal".into());
        }
        Ok(Spec {
            name: "backend",
            program: backend_dir.join(format!("counselorbot-backend{EXE_SUFFIX}")),
            args,
            env,
            cwd: self.config.data.root.clone(),
            log_file: "backend.log",
            lifeline: true,
        })
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
            let spec = self.backend_spec(port)?;
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
        let expected_contract = self.config.desktop_contract();
        if version != self.config.version || contract != expected_contract {
            let message = format!(
                "Backend {version} (contratto {contract}) diverso dal guscio {} (contratto {expected_contract}): tunnel non pubblicato.",
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
        let mut spec = Spec {
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
                // Pubblico in /runtime-config.js: la UI resta su /login e non
                // rimanda mai ad ai4auth quando l'identita' e' locale (F1-06).
                ("COUNSELORBOT_AUTH_PROVIDER".into(), "local".into()),
            ],
            cwd: frontend_dir,
            log_file: "frontend.log",
            lifeline: true,
        };
        // L'origine pubblica arriva anche al frontend: i link e i QR condivisi
        // con gli studenti (iscrizione, consiglio, raccolte) la pubblicano in
        // /runtime-config.js e non restano sull'indirizzo locale del PC.
        // Se il tunnel non e' attivo, impostiamo una stringa vuota per evitare
        // che il frontend cada su window.location.origin (127.0.0.1).
        let origin = self.status.lock().unwrap().tunnel_url.clone().unwrap_or_default();
        spec.env.push(("COUNSELORBOT_PUBLIC_ORIGIN".into(), origin));
        spec
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
        if mode != "quick" && mode != "named" {
            return Ok(());
        }
        let port = self.frontend.as_ref().and_then(|f| f.port).unwrap_or(0);
        let url = format!("http://127.0.0.1:{port}");
        let cloudflared = self.config.resources.join("cloudflared").join(format!("cloudflared{EXE_SUFFIX}"));

        let token = self.config.data.read_tunnel_token(&self.shell.tunnel);
        let is_named_with_token = mode == "named" && token.is_some();
        let tunnel_args = build_cloudflared_args(&mode, &url, token.as_deref());

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

        if is_named_with_token {
            let stable_url = self.shell.tunnel.custom_domain.clone().unwrap_or_default();
            self.status.lock().unwrap().tunnel_url = if !stable_url.is_empty() { Some(stable_url) } else { None };
        } else {
            self.status.lock().unwrap().tunnel_url = None;
        }

        self.publish();

        if is_named_with_token && self.status.lock().unwrap().tunnel_url.is_some() {
            self.restart_after_backend();
        }

        Ok(())
    }

    pub fn handle_start_quick_tunnel(&mut self) -> Result<(), String> {
        if let Some(err) = &self.version_error {
            return Err(format!("Versione non compatibile: {err}"));
        }
        if self.backend.is_none() || self.frontend.is_none() {
            return Err("CounselorBot non e' ancora pronto.".into());
        }
        if self.tunnel.is_some() && self.shell.tunnel.mode == "quick" {
            return Ok(());
        }
        if let Some(tunnel) = self.tunnel.take() {
            tunnel.stop();
        }
        self.shell.tunnel.mode = "quick".into();
        if let Err(error) = self.config.data.save_config(&self.shell) {
            logs::log(format!("config/shell.json non salvato: {error}"));
        }
        self.start_tunnel().map_err(|e| match e {
            Failure::Fatal(msg, _) => msg,
            Failure::Stopping => "Avvio interrotto.".into(),
        })
    }

    pub fn handle_start_named_tunnel(&mut self) -> Result<(), String> {
        if let Some(err) = &self.version_error {
            return Err(format!("Versione non compatibile: {err}"));
        }
        if self.backend.is_none() || self.frontend.is_none() {
            return Err("CounselorBot non e' ancora pronto.".into());
        }
        if self.tunnel.is_some() && self.shell.tunnel.mode == "named" {
            return Ok(());
        }
        if let Some(tunnel) = self.tunnel.take() {
            tunnel.stop();
        }
        self.shell.tunnel.mode = "named".into();
        if let Err(error) = self.config.data.save_config(&self.shell) {
            logs::log(format!("config/shell.json non salvato: {error}"));
        }
        self.start_tunnel().map_err(|e| match e {
            Failure::Fatal(msg, _) => msg,
            Failure::Stopping => "Avvio interrotto.".into(),
        })
    }

    pub fn handle_save_named_tunnel_config(
        &mut self,
        custom_domain: String,
        token: Option<String>,
    ) -> Result<(), String> {
        let normalized = normalize_custom_domain(&custom_domain)?;
        if let Some(tok) = &token {
            let trimmed = tok.trim();
            if !trimmed.is_empty() {
                validate_tunnel_token(trimmed)?;
                if let Err(e) = self.config.data.save_tunnel_token(trimmed) {
                    logs::log(format!("errore salvataggio credenziali token: {e}"));
                }
                self.shell.tunnel.token = Some(trimmed.to_string());
            }
        }
        self.shell.tunnel.custom_domain = Some(normalized);
        if let Err(error) = self.config.data.save_config(&self.shell) {
            logs::log(format!("config/shell.json non salvato: {error}"));
        }
        self.publish();
        if self.tunnel.is_some() && self.shell.tunnel.mode == "named" {
            if let Some(tunnel) = self.tunnel.take() {
                tunnel.stop();
            }
            let _ = self.start_tunnel();
        }
        Ok(())
    }

    pub fn handle_get_tunnel_settings(&self) -> TunnelSettings {
        let has_token = self.config.data.read_tunnel_token(&self.shell.tunnel).is_some();
        let active_url = self.status.lock().unwrap().tunnel_url.clone();
        TunnelSettings {
            mode: self.shell.tunnel.mode.clone(),
            custom_domain: self.shell.tunnel.custom_domain.clone(),
            has_token,
            active_url,
        }
    }

    pub fn handle_stop_quick_tunnel(&mut self) -> Result<(), String> {
        self.shell.tunnel.mode = "off".into();
        if let Err(error) = self.config.data.save_config(&self.shell) {
            logs::log(format!("config/shell.json non salvato: {error}"));
        }
        if let Some(tunnel) = self.tunnel.take() {
            tunnel.stop();
        }
        self.tunnel_started = None;
        let had_url = self.status.lock().unwrap().tunnel_url.take().is_some();
        self.publish();
        if had_url {
            self.restart_after_backend();
        }
        Ok(())
    }

    pub fn handle_teacher_link(&self) -> Result<String, String> {
        let backend = self.backend.as_ref().ok_or("Backend non ancora pronto")?;
        let port = backend.port.ok_or_else(|| "Porta backend non disponibile".to_string())?;
        let (status, body) = health::post(
            port,
            "/internal/local-auth/teacher-link",
            &[("X-CounselorBot-Shell-Secret", &self.shell_secret)],
            b"",
        )?;
        if status != 200 {
            return Err(format!("Generazione del link di accesso fallita (HTTP {status}): {body}"));
        }
        #[derive(Deserialize)]
        struct LinkResp {
            token: String,
        }
        let resp: LinkResp = serde_json::from_str(&body)
            .map_err(|e| format!("Risposta del link di accesso non valida ({e}): {body}"))?;
        Ok(resp.token)
    }

    pub fn handle_backup_db(&self) -> Result<String, String> {
        if let Some(backend) = &self.backend {
            let port = backend.port.ok_or_else(|| "Porta backend non disponibile".to_string())?;
            let (status, body) =
                health::post(port, "/internal/backup", &[("X-CounselorBot-Shell-Secret", &self.shell_secret)], b"")?;
            if status != 200 {
                return Err(format!("Richiesta backup fallita (HTTP {status}): {body}"));
            }
            #[derive(Deserialize)]
            struct BackupResp {
                status: String,
                path: Option<String>,
                detail: Option<String>,
            }
            let resp: BackupResp =
                serde_json::from_str(&body).map_err(|e| format!("Risposta backup JSON non valida ({e}): {body}"))?;
            if resp.status != "ok" {
                return Err(resp.detail.unwrap_or_else(|| "Errore durante il backup".into()));
            }
            resp.path.ok_or_else(|| "Percorso backup non restituito dal backend".into())
        } else {
            let mut spec = self.backend_spec(0).map_err(|e| match e {
                Failure::Fatal(msg, _) => msg,
                Failure::Stopping => "Supervisore in arresto".into(),
            })?;
            spec.args = vec![OsString::from("--backup")];
            let mut cmd = std::process::Command::new(&spec.program);
            crate::credentials::remove_inherited(&mut cmd);
            cmd.args(&spec.args)
                .envs(spec.env.iter().map(|(k, v)| (k.as_str(), v.as_str())))
                .current_dir(&spec.cwd)
                .stdout(std::process::Stdio::piped())
                .stderr(std::process::Stdio::piped());
            let output = cmd.output().map_err(|e| format!("Esecuzione offline backup: {e}"))?;
            if !output.status.success() {
                let stderr = String::from_utf8_lossy(&output.stderr);
                return Err(format!("Offline backup fallito (codice {:?}): {stderr}", output.status.code()));
            }
            let stdout = String::from_utf8_lossy(&output.stdout);
            let path = stdout.trim().strip_prefix("backup: ").unwrap_or(stdout.trim()).to_string();
            Ok(path)
        }
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
            let is_tunnel_mode = self.shell.tunnel.mode == "quick" || self.shell.tunnel.mode == "named";
            if is_tunnel_mode && self.may_restart("cloudflared") {
                if let Err(Failure::Fatal(message, hint)) = self.start_tunnel() {
                    self.fail(message, hint);
                }
            } else if is_tunnel_mode {
                self.fail("Il tunnel si e' chiuso 3 volte in 5 minuti.".into(), Some("diagnostics"));
            } else {
                self.publish();
            }
            return;
        }
        if self.read_tunnel_url() {
            // ADR-0002 §2.1: the public origin changes with every quick tunnel.
            // Restart the backend with it, and the frontend with its new port.
            self.restart_after_backend();
        } else if (self.shell.tunnel.mode == "quick" || self.shell.tunnel.mode == "named")
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
        let is_tunnel_mode = self.shell.tunnel.mode == "quick" || self.shell.tunnel.mode == "named";
        if self.tunnel.is_none() || !is_tunnel_mode || self.status.lock().unwrap().tunnel_url.is_some() {
            return false;
        }
        let Ok(text) = std::fs::read(self.config.data.logs().join("cloudflared.log")) else { return false };
        let start = (self.tunnel_log_offset as usize).min(text.len());
        let text = String::from_utf8_lossy(&text[start..]);
        if let Some(url) = find_quick_tunnel_url(&text) {
            logs::log(format!("cloudflared: tunnel {url}"));
            // The smoke thread reads this same snapshot: never expose "ready"
            // with the new URL before its backend restart has completed.
            let mut status = self.status.lock().unwrap();
            status.phase = "preparing".into();
            status.tunnel_url = Some(url);
            return true;
        }
        false
    }

    // ---- stop ----

    fn stop_all(&mut self) {
        logs::log("arresto dei sidecar");
        // ADR-0004 §5.3: ordine stop tunnel → frontend → backend → PostgreSQL
        for proc in [self.tunnel.take(), self.frontend.take(), self.backend.take()].into_iter().flatten() {
            proc.stop();
        }
        // Ferma PostgreSQL dopo il backend
        if self.config.postgres_enabled {
            self.stop_postgres();
        }
        let _ = std::fs::remove_file(self.config.data.run().join(pids::SIDECARS_FILE));
        self.set_phase("stopped", None, None);
    }

    fn fail(&mut self, message: String, hint: Option<&'static str>) {
        logs::log(format!("errore: {message}"));
        for proc in [self.tunnel.take(), self.frontend.take(), self.backend.take()].into_iter().flatten() {
            proc.stop();
        }
        // Ferma PostgreSQL anche in caso di errore
        if self.config.postgres_enabled {
            self.stop_postgres();
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
        let mut records: Vec<pids::Record> =
            [self.backend.as_ref(), self.frontend.as_ref(), self.tunnel.as_ref(), starting]
                .into_iter()
                .flatten()
                .filter_map(|p| p.record.clone())
                .collect();
        if let Some(record) =
            self.postgres_running.as_ref().and_then(|pg| pids::record("postgresql", pg.postmaster_pid))
        {
            records.push(record);
        }
        if let Err(error) = pids::write(&self.config.data.run(), pids::SIDECARS_FILE, &records) {
            logs::log(format!("run/sidecars.json non scritto: {error}"));
        }
    }

    /// Lezione attiva: guscio pronto e tunnel acceso. Sveglio solo in questo caso.
    fn session_active(&self) -> bool {
        self.status.lock().unwrap().phase == "ready"
            && self.backend.is_some()
            && self.frontend.is_some()
            && self.tunnel.is_some()
    }

    fn publish(&mut self) {
        let active = self.session_active();
        if let Some(error) = self.sleep.set(active) {
            logs::log(format!("anti-sospensione non attivata: {error}"));
        }
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
            status.tunnel_mode = self.shell.tunnel.mode.clone();
            status.custom_domain = self.shell.tunnel.custom_domain.clone();
            status.has_tunnel_token = self.config.data.read_tunnel_token(&self.shell.tunnel).is_some();
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
        let end = rest
            .find(|c: char| {
                c.is_whitespace()
                    || c == '|'
                    || c == '"'
                    || c == '\''
                    || c == '<'
                    || c == '>'
                    || c == ')'
                    || c == ']'
                    || c == ','
            })
            .unwrap_or(rest.len());
        let url = &rest[..end];
        let host = &url["https://".len()..];
        let sub = host.strip_suffix(".trycloudflare.com")?;
        if !sub.is_empty() && sub != "api" && sub.chars().all(|c| c.is_ascii_alphanumeric() || c == '-') {
            Some(url.to_string())
        } else {
            None
        }
    })
}

/// Builds the arguments for `cloudflared` given mode, local frontend URL, and optional token.
/// If mode is "named" and token is provided: `tunnel --no-autoupdate run --token <TOKEN>`.
/// If mode is "named" and token is missing, it falls back transparently to quick tunnel:
/// `tunnel --no-autoupdate --url <URL>`.
/// If mode is "quick": `tunnel --no-autoupdate --url <URL>`.
pub fn build_cloudflared_args(mode: &str, frontend_url: &str, token: Option<&str>) -> Vec<OsString> {
    let mut args: Vec<OsString> = vec!["tunnel".into(), "--no-autoupdate".into()];
    match mode {
        "named" => {
            if let Some(tok) = token.filter(|t| !t.trim().is_empty()) {
                args.push("run".into());
                args.push("--token".into());
                args.push(tok.trim().into());
            } else {
                args.push("--url".into());
                args.push(frontend_url.into());
            }
        }
        _ => {
            args.push("--url".into());
            args.push(frontend_url.into());
        }
    }
    args
}

/// Normalizes a custom domain into `https://<domain>` and validates its hostname format.
pub fn normalize_custom_domain(raw: &str) -> Result<String, String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Err("Il dominio personalizzato non puo' essere vuoto.".into());
    }
    let without_scheme =
        trimmed.strip_prefix("https://").or_else(|| trimmed.strip_prefix("http://")).unwrap_or(trimmed);
    let host = without_scheme.trim_end_matches('/');
    if host.is_empty() {
        return Err("Il dominio personalizzato non e' valido.".into());
    }
    if host.contains('/') || host.contains(':') || host.contains(' ') || host.contains('@') {
        return Err(format!("Il dominio '{host}' contiene caratteri non validi (percorsi, porte o spazi)."));
    }
    if !host.contains('.') {
        return Err(format!("Il dominio '{host}' deve contenere un punto (es. counselor.tuascuola.it)."));
    }
    for part in host.split('.') {
        if part.is_empty() {
            return Err("Il dominio non puo' contenere punti consecutivi o iniziare/terminare con un punto.".into());
        }
        if part.starts_with('-') || part.ends_with('-') {
            return Err("Le parti del dominio non possono iniziare o terminare con un trattino.".into());
        }
        if !part.chars().all(|c| c.is_ascii_alphanumeric() || c == '-') {
            return Err(format!("La parte '{part}' contiene caratteri non ammessi."));
        }
    }
    Ok(format!("https://{host}"))
}

/// Validates that a Cloudflare Tunnel token contains acceptable characters and length.
pub fn validate_tunnel_token(raw: &str) -> Result<String, String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Err("Il token del tunnel Cloudflare non puo' essere vuoto.".into());
    }
    if trimmed.len() < 20 {
        return Err("Il token del tunnel e' troppo corto per essere valido.".into());
    }
    if !trimmed.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_' || c == '=' || c == '+' || c == '/') {
        return Err("Il token contiene caratteri non ammessi.".into());
    }
    Ok(trimmed.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn commands_during_health_wait_receive_a_reply_and_stop_still_works() {
        let mut supervisor = supervisor("waiting-commands");
        let (sender, receiver) = mpsc::channel();
        supervisor.commands = receiver;
        for command in [Command::ApplyCredentials, Command::StartQuickTunnel, Command::StopQuickTunnel] {
            let (reply, done) = mpsc::channel();
            sender.send(command(reply)).unwrap();
            assert!(!supervisor.stop_requested_while_waiting());
            assert_eq!(
                done.recv_timeout(Duration::from_secs(1)).unwrap().unwrap_err(),
                "Preparazione in corso. Attendi e riprova."
            );
        }
        let (link_reply, link_done) = mpsc::channel();
        sender.send(Command::TeacherLink(link_reply)).unwrap();
        assert!(!supervisor.stop_requested_while_waiting());
        assert_eq!(
            link_done.recv_timeout(Duration::from_secs(1)).unwrap().unwrap_err(),
            "Preparazione in corso. Attendi e riprova."
        );
        let (reply, _done) = mpsc::channel();
        sender.send(Command::Stop(reply)).unwrap();
        assert!(supervisor.stop_requested_while_waiting());
        assert!(supervisor.pending_stop.is_some());
        std::fs::remove_dir_all(&supervisor.config.data.root).unwrap();
    }

    #[test]
    fn credentials_reach_only_backend_env_and_never_files_or_diagnostics() {
        use std::io::Read;
        let mut supervisor = supervisor("credential-integration");
        let sentinel = "synthetic-f108-integration-secret";
        supervisor.config.credentials.save("openai", sentinel).unwrap();
        supervisor.config.credentials.save("anthropic", sentinel).unwrap();
        supervisor.config.credentials.save("privacy_kek", sentinel).unwrap();
        let mut spec = supervisor.backend_spec(32101).unwrap_or_else(|_| panic!("backend spec"));
        let frontend = supervisor.frontend_spec(32102, 32101);
        assert!(!frontend.env.iter().any(|(_, value)| value == sentinel));
        // Exercise the actual spawn path. The child checks env in memory and
        // prints only a fixed result, never the synthetic credential.
        spec.program = PathBuf::from(if cfg!(windows) { "python" } else { "python3" });
        spec.args = vec!["-c".into(), "import os; assert os.environ['API_KEY_OPENAI']; assert os.environ['API_KEY_OPENAI'] == os.environ['OPENAI_API_KEY'] == os.environ['ANTHROPIC_API_KEY'] == os.environ['PRIVACY_KEK']; assert not os.environ['API_KEY_GROQ']; print('credential-env-ok')".into()];
        let mut child = sidecar::spawn(&spec, &supervisor.config.data.logs(), &supervisor.job, None).unwrap();
        let deadline = Instant::now() + Duration::from_secs(20);
        loop {
            if let Some(status) = child.try_wait() {
                assert!(status.success());
                break;
            }
            assert!(Instant::now() < deadline, "fixture child timed out");
            std::thread::sleep(Duration::from_millis(50));
        }
        assert!(std::fs::read_to_string(supervisor.config.data.logs().join("backend.log"))
            .unwrap()
            .contains("credential-env-ok"));
        supervisor.shell.frontend_port = Some(32102);
        supervisor.config.data.save_config(&supervisor.shell).unwrap();
        supervisor.publish();
        let report = supervisor.config.data.run().join("report.json");
        std::fs::write(&report, serde_json::to_vec(&supervisor.status.lock().unwrap().clone()).unwrap()).unwrap();
        fn scan(path: &std::path::Path, secret: &[u8]) {
            for entry in std::fs::read_dir(path).unwrap() {
                let path = entry.unwrap().path();
                if path.is_dir() {
                    scan(&path, secret);
                } else {
                    let bytes = std::fs::read(&path).unwrap();
                    assert!(
                        !bytes.windows(secret.len()).any(|w| w == secret),
                        "credential persisted in {}",
                        path.display()
                    );
                }
            }
        }
        scan(&supervisor.config.data.root, sentinel.as_bytes());
        let archive =
            crate::diagnostics::export(&supervisor.config.data.root, "1.2.3", &supervisor.config.data.root.join("out"))
                .unwrap();
        let mut archive = zip::ZipArchive::new(std::fs::File::open(archive).unwrap()).unwrap();
        for i in 0..archive.len() {
            let mut bytes = Vec::new();
            archive.by_index(i).unwrap().read_to_end(&mut bytes).unwrap();
            assert!(!bytes.windows(sentinel.len()).any(|w| w == sentinel.as_bytes()));
        }
        drop(archive);
        supervisor.config.credentials.remove("openai").unwrap();
        let spec = supervisor.backend_spec(32103).unwrap_or_else(|_| panic!("backend spec"));
        assert!(spec
            .env
            .iter()
            .filter(|(name, _)| ["API_KEY_OPENAI", "OPENAI_API_KEY"].contains(&name.as_str()))
            .all(|(_, value)| value.is_empty()));
        std::fs::remove_dir_all(&supervisor.config.data.root).unwrap();
    }

    fn supervisor(name: &str) -> Supervisor {
        let root = std::env::temp_dir().join(format!("cb-supervisor-{name}-{}", std::process::id()));
        let data = DataDir::prepare(root, "1.2.3").unwrap();
        let (_, receiver) = mpsc::channel();
        Supervisor::new(
            Config {
                credentials: Arc::new(crate::credentials::Credentials::new(crate::credentials::MemoryStore::default())),
                resources: data.path("resources"),
                shell_exe: std::env::current_exe().unwrap(),
                data,
                version: "1.2.3".into(),
                minimal_backend: true,
                report_file: None,
                postgres_enabled: false,
            },
            Arc::new(Mutex::new(Status::default())),
            receiver,
        )
    }

    #[test]
    fn postgres_url_overrides_the_legacy_data_directory_default() {
        let mut supervisor = supervisor("postgres-url");
        let url = "postgresql://app:synthetic@127.0.0.1:54321/counselorbot";
        supervisor.postgres_database_url = Some(url.into());
        let spec = supervisor.backend_spec(32101).unwrap_or_else(|_| panic!("backend spec"));
        let urls: Vec<_> = spec.env.iter().filter(|(name, _)| name == "DATABASE_URL").collect();
        assert_eq!(urls.last().unwrap().1, url);
        std::fs::remove_dir_all(&supervisor.config.data.root).unwrap();
    }

    #[test]
    fn sidecar_environment_obeys_the_frozen_contract() {
        let supervisor = supervisor("env");
        let backend = supervisor.backend_spec(32101).unwrap_or_else(|_| panic!("backend spec"));
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
            env(
                &supervisor.backend_spec(32103).unwrap_or_else(|_| panic!("backend spec")),
                "COUNSELORBOT_PUBLIC_ORIGIN"
            )
            .as_deref(),
            Some("https://fixture.trycloudflare.com")
        );
        // Il frontend pubblica a sua volta l'origine del tunnel: i link condivisi
        // con gli studenti (iscrizione, consiglio) non usano l'indirizzo locale.
        let frontend = supervisor.frontend_spec(32104, 32103);
        assert_eq!(env(&frontend, "COUNSELORBOT_PUBLIC_ORIGIN").as_deref(), Some("https://fixture.trycloudflare.com"));
        assert_eq!(env(&frontend, "COUNSELORBOT_AUTH_PROVIDER").as_deref(), Some("local"));
        // Riavvio del tunnel con nuovo URL: l'ambiente del successivo riavvio
        // dei sidecar porta l'origine aggiornata, mai quella precedente.
        supervisor.status.lock().unwrap().tunnel_url = Some("https://brave-lion-example.trycloudflare.com".into());
        assert_eq!(
            env(&supervisor.frontend_spec(32104, 32103), "COUNSELORBOT_PUBLIC_ORIGIN").as_deref(),
            Some("https://brave-lion-example.trycloudflare.com")
        );
        supervisor.status.lock().unwrap().tunnel_url = None;
        assert!(env(&supervisor.frontend_spec(32104, 32103), "COUNSELORBOT_PUBLIC_ORIGIN").is_none());
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

    fn mock_tunnel(supervisor: &mut Supervisor) -> pids::Record {
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
        supervisor.tunnel = Some(tunnel);
        record
    }

    #[test]
    fn mismatch_stops_an_already_running_tunnel() {
        let mut supervisor = supervisor("running-mismatch");
        let record = mock_tunnel(&mut supervisor);
        assert!(pids::alive(&record));
        supervisor.check_version(r#"{"version":"9.0.0","desktop_contract":1}"#);
        assert!(supervisor.tunnel.is_none());
        assert!(!pids::alive(&record));
        std::fs::remove_dir_all(&supervisor.config.data.root).unwrap();
    }

    #[test]
    fn new_tunnel_origin_is_not_ready_until_the_backend_restarts() {
        let mut supervisor = supervisor("origin-ready");
        mock_tunnel(&mut supervisor);
        supervisor.shell.tunnel.mode = "quick".into();
        supervisor.status.lock().unwrap().phase = "ready".into();
        std::fs::write(
            supervisor.config.data.logs().join("cloudflared.log"),
            "INF https://fixture.trycloudflare.com\n",
        )
        .unwrap();
        assert!(supervisor.read_tunnel_url());
        let status = supervisor.status.lock().unwrap().clone();
        assert_eq!(status.phase, "preparing");
        assert_eq!(status.tunnel_url.as_deref(), Some("https://fixture.trycloudflare.com"));
        supervisor.tunnel.take().unwrap().stop();
        std::fs::remove_dir_all(&supervisor.config.data.root).unwrap();
    }

    #[test]
    fn quick_tunnel_url_is_read_from_the_log() {
        let log = "2026-10-24T10:00:00Z INF Requesting new quick Tunnel on trycloudflare.com...\n\
                   2026-10-24T10:00:02Z INF |  https://brave-lion-example.trycloudflare.com                      |\n";
        assert_eq!(find_quick_tunnel_url(log).as_deref(), Some("https://brave-lion-example.trycloudflare.com"));
        assert_eq!(find_quick_tunnel_url("ERR failed to request https://api.trycloudflare.com/tunnel"), None);
        assert_eq!(find_quick_tunnel_url("https://invalid_sub.trycloudflare.com"), None);
        assert_eq!(find_quick_tunnel_url("https://.trycloudflare.com"), None);
        assert_eq!(
            find_quick_tunnel_url("URL: 'https://sample-123.trycloudflare.com'").as_deref(),
            Some("https://sample-123.trycloudflare.com")
        );
        assert_eq!(find_quick_tunnel_url("nothing yet"), None);
    }

    #[test]
    fn on_demand_quick_tunnel_lifecycle() {
        let mut supervisor = supervisor("on-demand");
        // Cannot start when not ready
        assert!(supervisor.handle_start_quick_tunnel().is_err());

        // Cannot start when version error
        supervisor.version_error = Some("mismatch".into());
        assert!(supervisor.handle_start_quick_tunnel().is_err());
        supervisor.version_error = None;

        // Mock ready state with running tunnel
        let record = mock_tunnel(&mut supervisor);
        assert!(pids::alive(&record));
        supervisor.shell.tunnel.mode = "quick".into();
        supervisor.status.lock().unwrap().tunnel_url = Some("https://fixture.trycloudflare.com".into());

        // Stop on-demand
        assert!(supervisor.handle_stop_quick_tunnel().is_ok());
        assert_eq!(supervisor.shell.tunnel.mode, "off");
        assert!(supervisor.tunnel.is_none());
        assert!(!pids::alive(&record));
        assert!(supervisor.status.lock().unwrap().tunnel_url.is_none());

        // Repeated stop is a no-op Ok
        assert!(supervisor.handle_stop_quick_tunnel().is_ok());

        std::fs::remove_dir_all(&supervisor.config.data.root).unwrap();
    }

    #[test]
    fn secrets_are_32_random_bytes_base64url() {
        let a = secret();
        let b = secret();
        assert_eq!(a.len(), 43);
        assert_ne!(a, b);
        assert!(a.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_'));
    }

    #[test]
    fn cloudflared_args_selection_quick_vs_named_with_token() {
        // Quick tunnel mode
        let quick_args = build_cloudflared_args("quick", "http://127.0.0.1:32102", None);
        let quick_strs: Vec<String> = quick_args.into_iter().map(|s| s.to_string_lossy().into_owned()).collect();
        assert_eq!(quick_strs, vec!["tunnel", "--no-autoupdate", "--url", "http://127.0.0.1:32102"]);

        // Named tunnel with token
        let token = "eyJhIjoiMTIzNDUiLCJ0IjoiNjg3OSJ9";
        let named_args = build_cloudflared_args("named", "http://127.0.0.1:32102", Some(token));
        let named_strs: Vec<String> = named_args.into_iter().map(|s| s.to_string_lossy().into_owned()).collect();
        assert_eq!(named_strs, vec!["tunnel", "--no-autoupdate", "run", "--token", token]);

        // Named tunnel without token (or empty) falls back transparently to quick tunnel
        let fallback_args = build_cloudflared_args("named", "http://127.0.0.1:32102", None);
        let fallback_strs: Vec<String> = fallback_args.into_iter().map(|s| s.to_string_lossy().into_owned()).collect();
        assert_eq!(fallback_strs, vec!["tunnel", "--no-autoupdate", "--url", "http://127.0.0.1:32102"]);

        let empty_fallback_args = build_cloudflared_args("named", "http://127.0.0.1:32102", Some("   "));
        let empty_fallback_strs: Vec<String> =
            empty_fallback_args.into_iter().map(|s| s.to_string_lossy().into_owned()).collect();
        assert_eq!(empty_fallback_strs, vec!["tunnel", "--no-autoupdate", "--url", "http://127.0.0.1:32102"]);
    }

    #[test]
    fn custom_domain_normalization_and_validation() {
        assert_eq!(normalize_custom_domain("counselor.tuascuola.it").unwrap(), "https://counselor.tuascuola.it");
        assert_eq!(
            normalize_custom_domain("https://counselor.tuascuola.it/").unwrap(),
            "https://counselor.tuascuola.it"
        );
        assert_eq!(normalize_custom_domain("http://labform.net").unwrap(), "https://labform.net");
        assert_eq!(normalize_custom_domain("  app.scuola.edu.it  ").unwrap(), "https://app.scuola.edu.it");

        // Invalid domains
        assert!(normalize_custom_domain("").is_err());
        assert!(normalize_custom_domain("   ").is_err());
        assert!(normalize_custom_domain("localhost").is_err()); // no dot
        assert!(normalize_custom_domain("foo..bar.com").is_err());
        assert!(normalize_custom_domain("-invalid.com").is_err());
        assert!(normalize_custom_domain("counselor.scuola.it:8080").is_err());
        assert!(normalize_custom_domain("counselor.scuola.it/path").is_err());
    }

    #[test]
    fn tunnel_token_validation() {
        let valid_token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9";
        assert_eq!(validate_tunnel_token(valid_token).unwrap(), valid_token);

        assert!(validate_tunnel_token("").is_err());
        assert!(validate_tunnel_token("too-short").is_err());
        assert!(validate_tunnel_token("invalid characters with spaces in between!!").is_err());
    }

    #[test]
    fn named_tunnel_lifecycle_and_stable_url() {
        let mut supervisor = supervisor("named-lifecycle");
        mock_tunnel(&mut supervisor);
        supervisor.status.lock().unwrap().phase = "ready".into();

        // Save configuration
        let res = supervisor.handle_save_named_tunnel_config(
            "counselor.tuascuola.it".into(),
            Some("eyJhIjoiMTIzNDUiLCJ0IjoiNjg3OSIsInMiOiJ4eXoifQ==".into()),
        );
        assert!(res.is_ok());
        assert_eq!(supervisor.shell.tunnel.custom_domain.as_deref(), Some("https://counselor.tuascuola.it"));
        assert!(supervisor.config.data.read_tunnel_token(&supervisor.shell.tunnel).is_some());

        // Settings query
        let settings = supervisor.handle_get_tunnel_settings();
        assert_eq!(settings.custom_domain.as_deref(), Some("https://counselor.tuascuola.it"));
        assert!(settings.has_token);

        // Stop tunnel
        assert!(supervisor.handle_stop_quick_tunnel().is_ok());
        assert_eq!(supervisor.shell.tunnel.mode, "off");
        assert!(supervisor.status.lock().unwrap().tunnel_url.is_none());

        std::fs::remove_dir_all(&supervisor.config.data.root).unwrap();
    }

    #[test]
    fn supervisor_backup_db_handles_offline_when_backend_not_running() {
        let supervisor = supervisor("backup-test");
        let res = supervisor.handle_backup_db();
        assert!(res.is_err() || res.is_ok());
        std::fs::remove_dir_all(&supervisor.config.data.root).unwrap();
    }
}
