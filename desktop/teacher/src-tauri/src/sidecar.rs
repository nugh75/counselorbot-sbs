//! Avvio e arresto di un sidecar (ADR-0002 §2.3-§2.4).
//!
//! - stdout e stderr su file in `logs/`, mai su pipe lette dal guscio;
//! - stdin collegato alla pipe di vita: il guscio tiene aperto il lato di
//!   scrittura e non scrive mai; quando il guscio muore il sistema la chiude e il
//!   sidecar (o la lifeline) si ferma. Rust apre le pipe con CLOEXEC / non
//!   ereditabili, quindi un sidecar non tiene aperta la pipe di un altro;
//! - arresto: SIGTERM (Unix) e chiusura della pipe, attesa 10 s, poi kill.

use std::ffi::OsString;
use std::path::{Path, PathBuf};
use std::process::{Child, ChildStdin, Command, ExitStatus, Stdio};
use std::time::{Duration, Instant};

use crate::{logs, pids, platform};

pub const STOP_GRACE: Duration = Duration::from_secs(10);

pub struct Spec {
    pub name: &'static str,
    pub program: PathBuf,
    pub args: Vec<OsString>,
    pub env: Vec<(String, String)>,
    pub cwd: PathBuf,
    pub log_file: &'static str,
    /// The child reads stdin and stops at EOF (backend, frontend, lifeline).
    /// Without it (cloudflared on Windows) the stop is a plain kill.
    pub lifeline: bool,
}

pub struct Proc {
    pub name: &'static str,
    pub port: Option<u16>,
    pub record: Option<pids::Record>,
    child: Child,
    stdin: Option<ChildStdin>,
    lifeline: bool,
}

pub fn spawn(spec: &Spec, logs_dir: &Path, job: &platform::Job, port: Option<u16>) -> Result<Proc, String> {
    let log = logs::open(logs_dir, spec.log_file).map_err(|e| format!("log {}: {e}", spec.log_file))?;
    let log_err = log.try_clone().map_err(|e| e.to_string())?;
    let mut command = Command::new(&spec.program);
    command
        .args(&spec.args)
        .envs(spec.env.iter().map(|(k, v)| (k.as_str(), v.as_str())))
        .current_dir(&spec.cwd)
        .stdin(if spec.lifeline { Stdio::piped() } else { Stdio::null() })
        .stdout(log)
        .stderr(log_err);
    platform::prepare(&mut command);
    let mut child = command.spawn().map_err(|e| format!("{}: {e}", spec.program.display()))?;
    if let Err(error) = job.assign(&child) {
        let _ = child.kill();
        let _ = child.wait();
        return Err(format!("Job Object: {error}"));
    }
    let stdin = child.stdin.take();
    let record = pids::record(spec.name, child.id());
    logs::log(format!("{}: avviato pid {} porta {:?}", spec.name, child.id(), port));
    Ok(Proc { name: spec.name, port, record, child, stdin, lifeline: spec.lifeline })
}

impl Proc {
    pub fn pid(&self) -> u32 {
        self.child.id()
    }

    pub fn try_wait(&mut self) -> Option<ExitStatus> {
        self.child.try_wait().ok().flatten()
    }

    /// Normal stop: request, up to STOP_GRACE, then kill. Returns the exit status.
    pub fn stop(mut self) -> Option<ExitStatus> {
        if let Some(status) = self.try_wait() {
            return Some(status);
        }
        if self.lifeline {
            platform::request_stop(&self.child);
            drop(self.stdin.take());
            let deadline = Instant::now() + STOP_GRACE;
            while Instant::now() < deadline {
                if let Some(status) = self.try_wait() {
                    logs::log(format!("{}: fermato ({status})", self.name));
                    return Some(status);
                }
                std::thread::sleep(Duration::from_millis(100));
            }
            logs::log(format!("{}: nessuna risposta in {}s, kill", self.name, STOP_GRACE.as_secs()));
        }
        let _ = self.child.kill();
        let status = self.child.wait().ok();
        logs::log(format!("{}: terminato", self.name));
        status
    }
}

/// Exit codes of the backend (ADR-0002 §2.5).
#[derive(Debug, PartialEq, Clone, Copy)]
pub enum Exit {
    Requested,
    DataUnusable,
    PortInUse,
    Crash,
}

pub fn classify(status: ExitStatus) -> Exit {
    match status.code() {
        Some(0) => Exit::Requested,
        Some(3) => Exit::DataUnusable,
        Some(4) => Exit::PortInUse,
        _ => Exit::Crash,
    }
}
