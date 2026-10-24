//! Offline diagnostics (ADR-0002 §2.3). Free text is untrusted, including old
//! logs, paths and filenames: only timestamps, levels and typed layout survive.
//! No backend/model dependency: exporting must work after a sidecar crash.

use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use zip::write::SimpleFileOptions;

const OMITTED: &str = "[CONTENUTO_LOG_OMESSO]";
const REDACTION_ERROR: &str = "[ERRORE_REDAZIONE]";
const MAX_BYTES: u64 = 10 * 1024 * 1024;

fn version_number(version: &str) -> &str {
    let parts: Vec<_> = version.split('.').collect();
    if parts.len() == 3 && parts.iter().all(|p| !p.is_empty() && p.len() <= 8 && p.bytes().all(|b| b.is_ascii_digit()))
    {
        version
    } else {
        REDACTION_ERROR
    }
}

fn sanitize_log(bytes: &[u8]) -> String {
    let Ok(text) = std::str::from_utf8(bytes) else { return REDACTION_ERROR.into() };
    text.lines()
        .map(|line| {
            let mut tokens = line.split_whitespace();
            let timestamp = tokens
                .next()
                .and_then(|t| humantime::parse_rfc3339(t).ok())
                .map(|t| format!("{} ", humantime::format_rfc3339(t)))
                .unwrap_or_default();
            let level = line
                .split_whitespace()
                .take(4)
                .find_map(|token| match token.trim_matches(|c| matches!(c, '[' | ']' | ':')) {
                    "TRACE" => Some("TRACE "),
                    "DEBUG" => Some("DEBUG "),
                    "INFO" => Some("INFO "),
                    "WARN" | "WARNING" => Some("WARNING "),
                    "ERROR" => Some("ERROR "),
                    "CRITICAL" => Some("CRITICAL "),
                    _ => None,
                })
                .unwrap_or_default();
            format!("{timestamp}{level}{OMITTED}\n")
        })
        .collect()
}

fn sanitize_layout(bytes: &[u8]) -> String {
    let Ok(value) = serde_json::from_slice::<serde_json::Value>(bytes) else { return REDACTION_ERROR.into() };
    let Some(layout) = value.get("layout").and_then(|v| v.as_u64()) else { return REDACTION_ERROR.into() };
    if value.get("app").and_then(|v| v.as_str()) != Some("teacher") {
        return REDACTION_ERROR.into();
    }
    let version = value.get("created_with").and_then(|v| v.as_str()).unwrap_or("");
    serde_json::json!({"layout": layout, "app": "teacher", "created_with": version_number(version)}).to_string()
}

fn read_regular(path: &Path) -> Option<Vec<u8>> {
    // No symlink directories or files; never follow a link into credentials/DB.
    if path.parent()?.symlink_metadata().ok()?.file_type().is_symlink() {
        return None;
    }
    if !path.symlink_metadata().ok()?.file_type().is_file() {
        return None;
    }
    let file = std::fs::File::open(path).ok()?;
    let mut bytes = Vec::new();
    file.take(MAX_BYTES + 1).read_to_end(&mut bytes).ok()?;
    if bytes.len() as u64 > MAX_BYTES {
        return None;
    }
    Some(bytes)
}

pub fn export(data_root: &Path, version: &str, target_dir: &Path) -> Result<PathBuf, String> {
    let stamp = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_nanos()).unwrap_or(0);
    std::fs::create_dir_all(target_dir).map_err(|_| "Creazione cartella diagnostica fallita")?;
    let target = target_dir.join(format!("counselorbot-diagnostica-{stamp}.zip"));
    let file = std::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&target)
        .map_err(|_| "Creazione diagnostica fallita")?;
    let result = (|| -> Result<(), zip::result::ZipError> {
        let mut zip = zip::ZipWriter::new(file);
        let options = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);
        let mut add = |name: &str, text: &str| -> Result<(), zip::result::ZipError> {
            zip.start_file(name, options)?;
            zip.write_all(text.as_bytes())?;
            Ok(())
        };
        let layout = data_root.join("layout.json");
        if layout.exists() {
            let text = read_regular(&layout).map(|b| sanitize_layout(&b)).unwrap_or(REDACTION_ERROR.into());
            add("layout.json", &text)?;
        }
        // Filenames themselves can contain PII. Include only shell-owned names.
        for base in ["shell.log", "backend.log", "frontend.log", "cloudflared.log"] {
            for rotation in 0..5 {
                let name = if rotation == 0 { base.into() } else { format!("{base}.{rotation}") };
                let path = data_root.join("logs").join(&name);
                if path.exists() {
                    let text = read_regular(&path).map(|b| sanitize_log(&b)).unwrap_or(REDACTION_ERROR.into());
                    add(&format!("logs/{name}"), &text)?;
                }
            }
        }
        add(
            "version.txt",
            &format!("{}\n{} {}\n", version_number(version), std::env::consts::OS, std::env::consts::ARCH),
        )?;
        zip.finish()?;
        Ok(())
    })();
    if result.is_err() {
        let _ = std::fs::remove_file(&target);
        return Err("Esportazione diagnostica fallita".into());
    }
    Ok(target)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn zip_sanitizes_all_entries_and_never_includes_database_or_unknown_names() {
        let root = std::env::temp_dir().join(format!("cb-diag-{}", std::process::id()));
        std::fs::create_dir_all(root.join("logs")).unwrap();
        std::fs::create_dir_all(root.join("db")).unwrap();
        let pii = "Mario Rossi mario.rossi@example.test +39 3471234567 RSSMRA80A01H501U Liceo Volta C1=9";
        std::fs::write(
            root.join("layout.json"),
            serde_json::json!({"layout": 1, "app": "teacher", "created_with": "1.2.3", "path": pii}).to_string(),
        )
        .unwrap();
        std::fs::write(root.join("logs/backend.log"), format!("2026-10-24T12:30:00Z INFO {pii}\n{pii}")).unwrap();
        std::fs::write(root.join("logs/frontend.log.4"), pii).unwrap();
        std::fs::write(root.join("logs/Mario Rossi.log"), pii).unwrap();
        std::fs::write(root.join("db/counselorbot.sqlite3"), pii).unwrap();
        let zip_path = export(&root, pii, &root.join("out")).unwrap();
        let mut archive = zip::ZipArchive::new(std::fs::File::open(zip_path).unwrap()).unwrap();
        let mut names: Vec<String> = archive.file_names().map(String::from).collect();
        names.sort();
        assert_eq!(names, vec!["layout.json", "logs/backend.log", "logs/frontend.log.4", "version.txt"]);
        for name in names {
            let mut text = String::new();
            archive.by_name(&name).unwrap().read_to_string(&mut text).unwrap();
            for secret in pii.split_whitespace() {
                assert!(!text.contains(secret), "{name}");
            }
            if name == "logs/backend.log" {
                assert!(text.contains("2026-10-24T12:30:00Z INFO"));
                assert!(text.contains(OMITTED));
            }
        }
        // The original local log remains untouched.
        assert!(std::fs::read_to_string(root.join("logs/backend.log")).unwrap().contains(pii));
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn malformed_inputs_are_closed() {
        assert_eq!(sanitize_log(&[0xff]), REDACTION_ERROR);
        assert_eq!(sanitize_layout(b"invalid JSON with private data"), REDACTION_ERROR);
        assert_eq!(sanitize_layout(br#"{"layout":1,"app":"private name"}"#), REDACTION_ERROR);
        assert_eq!(version_number("1.2.3\nprivate name"), REDACTION_ERROR);
    }

    #[cfg(unix)]
    #[test]
    fn symlinks_are_not_read() {
        let root = std::env::temp_dir().join(format!("cb-diag-links-{}", std::process::id()));
        std::fs::create_dir_all(&root).unwrap();
        std::fs::write(root.join("private"), "private data").unwrap();
        std::os::unix::fs::symlink(root.join("private"), root.join("backend.log")).unwrap();
        assert!(read_regular(&root.join("backend.log")).is_none());
        std::fs::remove_dir_all(root).unwrap();
    }
}
