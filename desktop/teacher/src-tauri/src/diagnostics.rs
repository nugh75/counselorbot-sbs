//! «Esporta diagnostica» (ADR-0002 §2.3): zip di `logs/`, `layout.json` e
//! versione. Mai il database, le credenziali o `run/`.

use std::io::Write;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use zip::write::SimpleFileOptions;

pub fn export(data_root: &Path, version: &str, target_dir: &Path) -> Result<PathBuf, String> {
    let stamp = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0);
    std::fs::create_dir_all(target_dir).map_err(|e| e.to_string())?;
    let target = target_dir.join(format!("counselorbot-diagnostica-{stamp}.zip"));
    let file = std::fs::File::create(&target).map_err(|e| format!("{}: {e}", target.display()))?;
    let mut zip = zip::ZipWriter::new(file);
    let options = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);
    let mut add = |name: &str, path: &Path| -> Result<(), String> {
        let bytes = std::fs::read(path).map_err(|e| format!("{}: {e}", path.display()))?;
        zip.start_file(name, options).map_err(|e| e.to_string())?;
        zip.write_all(&bytes).map_err(|e| e.to_string())
    };
    let layout = data_root.join("layout.json");
    if layout.exists() {
        add("layout.json", &layout)?;
    }
    if let Ok(entries) = std::fs::read_dir(data_root.join("logs")) {
        let mut paths: Vec<PathBuf> = entries.flatten().map(|e| e.path()).filter(|p| p.is_file()).collect();
        paths.sort();
        for path in paths {
            let name = format!("logs/{}", path.file_name().unwrap_or_default().to_string_lossy());
            add(&name, &path)?;
        }
    }
    zip.start_file("version.txt", options).map_err(|e| e.to_string())?;
    zip.write_all(format!("{version}\n{} {}\n", std::env::consts::OS, std::env::consts::ARCH).as_bytes())
        .map_err(|e| e.to_string())?;
    zip.finish().map_err(|e| e.to_string())?;
    Ok(target)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn zip_has_logs_layout_and_version_but_never_the_database() {
        let root = std::env::temp_dir().join(format!("cb-diag-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&root);
        for dir in ["logs", "db", "credentials"] {
            std::fs::create_dir_all(root.join(dir)).unwrap();
        }
        std::fs::write(root.join("layout.json"), "{}").unwrap();
        std::fs::write(root.join("logs/backend.log"), "ok").unwrap();
        std::fs::write(root.join("db/counselorbot.sqlite3"), "secret data").unwrap();
        std::fs::write(root.join("credentials/key"), "secret key").unwrap();
        let zip_path = export(&root, "1.2.3", &root.join("out")).unwrap();
        let archive = zip::ZipArchive::new(std::fs::File::open(zip_path).unwrap()).unwrap();
        let mut names: Vec<&str> = archive.file_names().collect();
        names.sort();
        assert_eq!(names, vec!["layout.json", "logs/backend.log", "version.txt"]);
        std::fs::remove_dir_all(&root).unwrap();
    }
}
