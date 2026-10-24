//! Log su file in `logs/` (ADR-0002 §2.3): i sidecar scrivono stdout e stderr
//! direttamente su file, mai su pipe lette dal guscio. Rotazione a cura del
//! guscio quando apre un file: 5 file da 10 MB (`x.log`, `x.log.1` ... `x.log.4`).
//! Nessun segreto nei log: il guscio non scrive mai l'ambiente dei sidecar.

use std::fs::{File, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use std::time::SystemTime;

pub const MAX_BYTES: u64 = 10 * 1024 * 1024;
pub const KEEP: usize = 5;

fn numbered(path: &Path, n: usize) -> PathBuf {
    let mut name = path.as_os_str().to_owned();
    name.push(format!(".{n}"));
    PathBuf::from(name)
}

/// Shifts `x.log` to `x.log.1` (and so on) once it reaches MAX_BYTES.
pub fn rotate_if_full(path: &Path) -> std::io::Result<()> {
    let full = path.metadata().map(|m| m.len() >= MAX_BYTES).unwrap_or(false);
    if !full {
        return Ok(());
    }
    let _ = std::fs::remove_file(numbered(path, KEEP - 1));
    for n in (1..KEEP - 1).rev() {
        let from = numbered(path, n);
        if from.exists() {
            std::fs::rename(&from, numbered(path, n + 1))?;
        }
    }
    std::fs::rename(path, numbered(path, 1))
}

/// Opens `dir/name` for appending, rotating it first when full.
pub fn open(dir: &Path, name: &str) -> std::io::Result<File> {
    let path = dir.join(name);
    rotate_if_full(&path)?;
    OpenOptions::new().create(true).append(true).open(path)
}

static SHELL_LOG: OnceLock<Mutex<File>> = OnceLock::new();

pub fn init_shell_log(dir: &Path) -> std::io::Result<()> {
    let file = open(dir, "shell.log")?;
    let _ = SHELL_LOG.set(Mutex::new(file));
    Ok(())
}

/// One line in `shell.log` (and on stderr for development).
pub fn log(message: impl AsRef<str>) {
    let line = format!("{} {}\n", humantime::format_rfc3339_seconds(SystemTime::now()), message.as_ref());
    eprint!("{line}");
    if let Some(file) = SHELL_LOG.get() {
        if let Ok(mut file) = file.lock() {
            let _ = file.write_all(line.as_bytes());
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rotation_keeps_five_files() {
        let dir = std::env::temp_dir().join(format!("cb-logs-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("backend.log");
        for round in 0..7 {
            std::fs::write(&path, vec![b'0' + round; MAX_BYTES as usize]).unwrap();
            drop(open(&dir, "backend.log").unwrap());
        }
        // The newest full file moved to .1, the oldest beyond .4 were dropped.
        assert_eq!(std::fs::metadata(&path).unwrap().len(), 0);
        assert_eq!(std::fs::read(numbered(&path, 1)).unwrap()[0], b'6');
        assert_eq!(std::fs::read(numbered(&path, 4)).unwrap()[0], b'3');
        assert!(!numbered(&path, 5).exists());
        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn small_files_are_appended_to() {
        let dir = std::env::temp_dir().join(format!("cb-logs-small-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("shell.log"), b"old\n").unwrap();
        open(&dir, "shell.log").unwrap().write_all(b"new\n").unwrap();
        assert_eq!(std::fs::read(dir.join("shell.log")).unwrap(), b"old\nnew\n");
        assert!(!numbered(&dir.join("shell.log"), 1).exists());
        std::fs::remove_dir_all(&dir).unwrap();
    }
}
