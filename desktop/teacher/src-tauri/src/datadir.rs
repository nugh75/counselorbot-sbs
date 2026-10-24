//! Cartella dati dell'utente, layout 1 (ADR-0002 §1).
//!
//! Radice: `app_local_data_dir()` di Tauri (identificatore immutabile
//! `org.ai4educ.counselorbot.teacher`). Creata dal guscio con l'utente normale,
//! permessi solo-utente (0700 su Unix). `layout.json` cambia numero solo con una
//! migrazione eseguita qui prima di avviare i sidecar.

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

pub const LAYOUT: u32 = 1;
pub const APP: &str = "teacher";

const DIRS: &[&str] = &[
    "db",
    "uploads/portfolio",
    "uploads/tavolo",
    "uploads/tavolo-images",
    "uploads/idea-sources",
    "uploads/qsa",
    "uploads/pqbl",
    "rag/index",
    "rag/collections",
    "memory/sessions",
    "credentials",
    "logs",
    "backups",
    "run",
    "config",
];

#[derive(Serialize, Deserialize)]
struct LayoutFile {
    layout: u32,
    app: String,
    created_with: String,
}

#[derive(Clone)]
pub struct DataDir {
    pub root: PathBuf,
    /// The folder was created by this launch: first start, longer health timeouts.
    pub first_run: bool,
}

#[derive(Serialize, Deserialize, Clone, Default, PartialEq, Eq, Debug)]
#[serde(default)]
pub struct TunnelConfig {
    /// "off" (default), "quick" (prove), "named" (dominio del docente)
    pub mode: String,
    pub name: Option<String>,
    pub custom_domain: Option<String>,
    pub token: Option<String>,
}

/// `config/shell.json`: preferenze non segrete.
#[derive(Serialize, Deserialize, Clone, Default)]
#[serde(default)]
pub struct ShellConfig {
    pub frontend_port: Option<u16>,
    pub tunnel: TunnelConfig,
    pub updater_channel: Option<String>,
}

#[cfg(unix)]
fn user_only(path: &Path) -> std::io::Result<()> {
    use std::os::unix::fs::PermissionsExt;
    std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o700))
}

#[cfg(not(unix))]
fn user_only(_path: &Path) -> std::io::Result<()> {
    // %LOCALAPPDATA% is already private to the user.
    Ok(())
}

impl DataDir {
    pub fn prepare(root: PathBuf, version: &str) -> Result<DataDir, String> {
        let describe = |what: &str, path: &Path, e: std::io::Error| format!("{what} {}: {e}", path.display());
        std::fs::create_dir_all(&root).map_err(|e| describe("cartella dati", &root, e))?;
        user_only(&root).map_err(|e| describe("permessi", &root, e))?;
        let layout_path = root.join("layout.json");
        let first_run = !layout_path.exists();
        if first_run {
            let layout = LayoutFile { layout: LAYOUT, app: APP.into(), created_with: version.into() };
            let text = serde_json::to_string(&layout).unwrap_or_default();
            std::fs::write(&layout_path, text).map_err(|e| describe("scrittura", &layout_path, e))?;
        } else {
            let text = std::fs::read_to_string(&layout_path).map_err(|e| describe("lettura", &layout_path, e))?;
            let layout: LayoutFile =
                serde_json::from_str(&text).map_err(|e| format!("{} non valido: {e}", layout_path.display()))?;
            if layout.app != APP {
                return Err(format!("{}: cartella di un'altra app ({})", root.display(), layout.app));
            }
            if layout.layout > LAYOUT {
                return Err(format!(
                    "la cartella dati usa il layout {} (creata da una versione piu' recente, {}): aggiorna l'app",
                    layout.layout, layout.created_with
                ));
            }
        }
        for dir in DIRS {
            let path = root.join(dir);
            std::fs::create_dir_all(&path).map_err(|e| describe("cartella", &path, e))?;
        }
        user_only(&root.join("credentials")).map_err(|e| describe("permessi", &root, e))?;
        Ok(DataDir { root, first_run })
    }

    pub fn path(&self, relative: &str) -> PathBuf {
        self.root.join(relative)
    }

    pub fn logs(&self) -> PathBuf {
        self.path("logs")
    }

    pub fn run(&self) -> PathBuf {
        self.path("run")
    }

    pub fn database_url(&self) -> String {
        // sqlite:///C:/Users/... on Windows: SQLAlchemy wants forward slashes.
        let file = self.path("db/counselorbot.sqlite3").to_string_lossy().replace('\\', "/");
        format!("sqlite:///{file}")
    }

    /// Path variables of ADR-0002 §1.2, always set (F0-01 B5).
    pub fn backend_env(&self) -> Vec<(String, String)> {
        let p = |relative: &str| self.path(relative).to_string_lossy().into_owned();
        vec![
            ("DATABASE_URL".into(), self.database_url()),
            ("DATA_DIR".into(), p("uploads")),
            ("PORTFOLIO_STORAGE_DIR".into(), p("uploads/portfolio")),
            ("TAVOLO_STORAGE_DIR".into(), p("uploads/tavolo")),
            ("TAVOLO_IMAGES_STORAGE_DIR".into(), p("uploads/tavolo-images")),
            ("IDEA_SOURCES_STORAGE_DIR".into(), p("uploads/idea-sources")),
            ("QSA_PDF_STORAGE_DIR".into(), p("uploads/qsa")),
            ("PQBL_STORAGE_DIR".into(), p("uploads/pqbl")),
            ("RAG_INDEX_DIR".into(), p("rag/index")),
            ("RAG_DYNAMIC_COLLECTIONS_DIR".into(), p("rag/collections")),
            ("SESSION_MEMORY_DIR".into(), p("memory/sessions")),
            ("STRATEGY_MEMORY_FILE".into(), p("memory/strategy_memory.json")),
            ("PERSONAL_API_CREDENTIALS_DIR".into(), p("credentials")),
        ]
    }

    pub fn load_config(&self) -> ShellConfig {
        std::fs::read_to_string(self.path("config/shell.json"))
            .ok()
            .and_then(|text| serde_json::from_str(&text).ok())
            .unwrap_or_default()
    }

    pub fn save_config(&self, config: &ShellConfig) -> std::io::Result<()> {
        let text = serde_json::to_string_pretty(config).unwrap_or_default();
        std::fs::write(self.path("config/shell.json"), text)
    }

    /// Reads Cloudflare tunnel token checking in order:
    /// 1. CLOUDFLARE_TUNNEL_TOKEN environment variable
    /// 2. credentials/cloudflared_token file (user-only permissions)
    /// 3. token property in TunnelConfig
    pub fn read_tunnel_token(&self, config: &TunnelConfig) -> Option<String> {
        if let Ok(tok) = std::env::var("CLOUDFLARE_TUNNEL_TOKEN") {
            let trimmed = tok.trim();
            if !trimmed.is_empty() {
                return Some(trimmed.to_string());
            }
        }
        let cred_file = self.path("credentials/cloudflared_token");
        if let Ok(tok) = std::fs::read_to_string(&cred_file) {
            let trimmed = tok.trim();
            if !trimmed.is_empty() {
                return Some(trimmed.to_string());
            }
        }
        if let Some(tok) = &config.token {
            let trimmed = tok.trim();
            if !trimmed.is_empty() {
                return Some(trimmed.to_string());
            }
        }
        None
    }

    /// Saves the tunnel token into credentials/cloudflared_token (with 0600 on unix).
    pub fn save_tunnel_token(&self, token: &str) -> std::io::Result<()> {
        let cred_file = self.path("credentials/cloudflared_token");
        let trimmed = token.trim();
        if trimmed.is_empty() {
            if cred_file.exists() {
                let _ = std::fs::remove_file(&cred_file);
            }
            return Ok(());
        }
        std::fs::write(&cred_file, trimmed)?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let _ = std::fs::set_permissions(&cred_file, std::fs::Permissions::from_mode(0o600));
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("cb-data-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        dir
    }

    #[test]
    fn creates_layout_1_and_every_folder() {
        let root = temp("new");
        let data = DataDir::prepare(root.clone(), "1.2.3").unwrap();
        assert!(data.first_run);
        let layout: serde_json::Value =
            serde_json::from_str(&std::fs::read_to_string(root.join("layout.json")).unwrap()).unwrap();
        assert_eq!(layout, serde_json::json!({"layout": 1, "app": "teacher", "created_with": "1.2.3"}));
        for dir in DIRS {
            assert!(root.join(dir).is_dir(), "{dir}");
        }
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            assert_eq!(std::fs::metadata(&root).unwrap().permissions().mode() & 0o777, 0o700);
            assert_eq!(std::fs::metadata(root.join("credentials")).unwrap().permissions().mode() & 0o777, 0o700);
        }
        // Second launch: same folder, not a first run, layout untouched.
        let again = DataDir::prepare(root.clone(), "1.2.4").unwrap();
        assert!(!again.first_run);
        assert!(std::fs::read_to_string(root.join("layout.json")).unwrap().contains("1.2.3"));
        std::fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn refuses_a_newer_layout_or_another_app() {
        let root = temp("newer");
        std::fs::create_dir_all(&root).unwrap();
        std::fs::write(root.join("layout.json"), r#"{"layout": 2, "app": "teacher", "created_with": "9.0.0"}"#)
            .unwrap();
        assert!(DataDir::prepare(root.clone(), "1.0.0").is_err());
        std::fs::write(root.join("layout.json"), r#"{"layout": 1, "app": "student", "created_with": "1.0.0"}"#)
            .unwrap();
        assert!(DataDir::prepare(root.clone(), "1.0.0").is_err());
        std::fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn database_url_and_paths_point_inside_the_folder() {
        let root = temp("env");
        let data = DataDir::prepare(root.clone(), "1.0.0").unwrap();
        assert!(data.database_url().starts_with("sqlite:///"));
        assert!(data.database_url().ends_with("/db/counselorbot.sqlite3"));
        assert!(!data.database_url().contains('\\'));
        for (name, value) in data.backend_env() {
            if name != "DATABASE_URL" {
                assert!(PathBuf::from(&value).starts_with(&root), "{name}={value}");
            }
        }
        std::fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn shell_config_round_trips_with_defaults() {
        let root = temp("config");
        let data = DataDir::prepare(root.clone(), "1.0.0").unwrap();
        assert_eq!(data.load_config().frontend_port, None);
        let mut config = data.load_config();
        config.frontend_port = Some(31234);
        config.tunnel.mode = "named".into();
        config.tunnel.custom_domain = Some("https://counselor.tuascuola.it".into());
        config.tunnel.token = Some("mock-token-abc".into());
        data.save_config(&config).unwrap();
        let loaded = data.load_config();
        assert_eq!(loaded.frontend_port, Some(31234));
        assert_eq!(loaded.tunnel.mode, "named");
        assert_eq!(loaded.tunnel.custom_domain.as_deref(), Some("https://counselor.tuascuola.it"));
        assert_eq!(loaded.tunnel.token.as_deref(), Some("mock-token-abc"));

        // Token resolution precedence
        assert_eq!(data.read_tunnel_token(&loaded.tunnel).as_deref(), Some("mock-token-abc"));
        data.save_tunnel_token("file-token-xyz").unwrap();
        assert_eq!(data.read_tunnel_token(&loaded.tunnel).as_deref(), Some("file-token-xyz"));

        // Clean up token file
        data.save_tunnel_token("").unwrap();
        assert_eq!(data.read_tunnel_token(&loaded.tunnel).as_deref(), Some("mock-token-abc"));

        std::fs::remove_dir_all(&root).unwrap();
    }
}
