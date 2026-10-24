//! Pulizia al riavvio (ADR-0002 §2.4 punto 4).
//!
//! `run/sidecars.json` registra PID, nome dell'eseguibile e ora di avvio dei
//! sidecar avviati dal guscio; `run/cloudflared.json` lo scrive la lifeline per
//! il suo figlio. Al lancio successivo il guscio termina i processi rimasti solo
//! se PID, nome e ora di avvio coincidono: mai un PID riciclato da un altro programma.

use std::path::Path;
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use sysinfo::{Pid, ProcessRefreshKind, ProcessesToUpdate, Signal, System};

pub const SIDECARS_FILE: &str = "sidecars.json";
pub const CLOUDFLARED_FILE: &str = "cloudflared.json";

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct Record {
    pub name: String,
    pub pid: u32,
    /// Process name as the system reports it (truncated on Linux: compare like with like).
    pub exe: String,
    /// Process start time, seconds since the epoch.
    pub started: u64,
}

fn system_for(pids: &[u32]) -> System {
    let mut system = System::new();
    let pids: Vec<Pid> = pids.iter().map(|pid| Pid::from_u32(*pid)).collect();
    system.refresh_processes_specifics(ProcessesToUpdate::Some(&pids), true, ProcessRefreshKind::nothing());
    system
}

/// Identity of a live process, read right after spawning it.
pub fn record(name: &str, pid: u32) -> Option<Record> {
    let system = system_for(&[pid]);
    let process = system.process(Pid::from_u32(pid))?;
    Some(Record {
        name: name.to_string(),
        pid,
        exe: process.name().to_string_lossy().into_owned(),
        started: process.start_time(),
    })
}

fn matches(system: &System, record: &Record) -> bool {
    system
        .process(Pid::from_u32(record.pid))
        .map(|p| p.name().to_string_lossy() == record.exe.as_str() && p.start_time() == record.started)
        .unwrap_or(false)
}

pub fn alive(record: &Record) -> bool {
    matches(&system_for(&[record.pid]), record)
}

pub fn write(dir: &Path, file: &str, records: &[Record]) -> std::io::Result<()> {
    std::fs::write(dir.join(file), serde_json::to_string_pretty(records).unwrap_or_default())
}

pub fn read(dir: &Path, file: &str) -> Vec<Record> {
    std::fs::read_to_string(dir.join(file))
        .ok()
        .and_then(|text| serde_json::from_str::<Vec<Record>>(&text).ok())
        .unwrap_or_default()
}

/// Stops what a previous launch left running; returns the names it stopped.
pub fn cleanup(dir: &Path) -> Vec<String> {
    let records: Vec<Record> = [SIDECARS_FILE, CLOUDFLARED_FILE].iter().flat_map(|file| read(dir, file)).collect();
    let system = system_for(&records.iter().map(|r| r.pid).collect::<Vec<_>>());
    let leftovers: Vec<&Record> = records.iter().filter(|r| matches(&system, r)).collect();
    for record in &leftovers {
        if let Some(process) = system.process(Pid::from_u32(record.pid)) {
            // SIGTERM first (a clean stop for the backend's database), SIGKILL below.
            if process.kill_with(Signal::Term).is_none() {
                process.kill();
            }
        }
    }
    let deadline = Instant::now() + Duration::from_secs(5);
    while Instant::now() < deadline && leftovers.iter().any(|r| alive(r)) {
        std::thread::sleep(Duration::from_millis(100));
    }
    let system = system_for(&leftovers.iter().map(|r| r.pid).collect::<Vec<_>>());
    for record in &leftovers {
        if matches(&system, record) {
            if let Some(process) = system.process(Pid::from_u32(record.pid)) {
                process.kill();
            }
        }
    }
    let _ = std::fs::remove_file(dir.join(SIDECARS_FILE));
    let _ = std::fs::remove_file(dir.join(CLOUDFLARED_FILE));
    leftovers.iter().map(|r| r.name.clone()).collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::process::{Command, Stdio};

    fn sleeper() -> std::process::Child {
        #[cfg(windows)]
        let mut command = {
            let mut c = Command::new("powershell");
            c.args(["-NoProfile", "-Command", "Start-Sleep -Seconds 60"]);
            c
        };
        #[cfg(not(windows))]
        let mut command = {
            let mut c = Command::new("sleep");
            c.arg("60");
            c
        };
        command.stdin(Stdio::null()).stdout(Stdio::null()).spawn().unwrap()
    }

    fn temp(name: &str) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!("cb-pids-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn cleanup_stops_a_matching_leftover() {
        let dir = temp("match");
        let mut child = sleeper();
        let record = record("backend", child.id()).unwrap();
        write(&dir, SIDECARS_FILE, &[record.clone()]).unwrap();
        assert_eq!(cleanup(&dir), vec!["backend".to_string()]);
        let deadline = Instant::now() + Duration::from_secs(10);
        while child.try_wait().unwrap().is_none() && Instant::now() < deadline {
            std::thread::sleep(Duration::from_millis(50));
        }
        assert!(child.try_wait().unwrap().is_some());
        assert!(!dir.join(SIDECARS_FILE).exists());
        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn cleanup_spares_a_recycled_pid() {
        let dir = temp("recycled");
        let mut child = sleeper();
        let mut record = record("backend", child.id()).unwrap();
        // Same PID, different start time: another program now owns it.
        record.started -= 3600;
        write(&dir, SIDECARS_FILE, &[record.clone()]).unwrap();
        let mut renamed = record.clone();
        renamed.started += 3600;
        renamed.exe = "someone-else".into();
        write(&dir, CLOUDFLARED_FILE, &[renamed]).unwrap();
        assert!(cleanup(&dir).is_empty());
        assert!(child.try_wait().unwrap().is_none());
        child.kill().unwrap();
        child.wait().unwrap();
        std::fs::remove_dir_all(&dir).unwrap();
    }
}
