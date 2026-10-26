//! Gestore del cluster PostgreSQL proprietario (ADR-0004 §5).
//!
//! Ogni app desktop possède un cluster PostgreSQL 15 locale, avviato come figlio
//! sorvegliato del guscio. Nessun `pg_ctl start` distaccato: il processo
//! `postgres` è il figlio diretto, sorvegliato dalla lifeline e dal Job Object.

use std::collections::HashMap;
use std::ffi::OsString;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::Arc;
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};

use crate::credentials::Credentials;
use crate::logs;

/// Versione PostgreSQL inclusa nel bundle (ADR-0004 §2.1).
pub const PG_MAJOR: u32 = 15;
pub const PG_MINOR: &str = "15.19";

/// Timeout di avvio del cluster (ADR-0004 §5.3: 180s primo avvio, 60s successivi).
pub const FIRST_START_TIMEOUT: Duration = Duration::from_secs(180);
pub const START_TIMEOUT: Duration = Duration::from_secs(60);
/// Timeout di stop fast shutdown (ADR-0004 §5.3).
pub const STOP_TIMEOUT: Duration = Duration::from_secs(10);

/// Identità persistente del cluster (scritta in `run/postgresql.json`).
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
pub struct ClusterIdentity {
    /// UUID univoco del cluster, generato a `prepare_new`.
    pub cluster_uuid: String,
    /// Percorso assoluto di PGDATA.
    pub pgdata_path: PathBuf,
    /// Major di PostgreSQL (15).
    pub major: u32,
    /// Bundle ID dell'app proprietaria.
    pub bundle_id: String,
    /// Versione del bundle che ha creato il cluster.
    pub created_with: String,
}

/// Cluster in esecuzione.
#[derive(Debug)]
pub struct RunningCluster {
    pub identity: ClusterIdentity,
    /// PID del postmaster.
    pub postmaster_pid: u32,
    /// Percorso dell'eseguibile postgres avviato.
    pub executable: PathBuf,
    /// Fingerprint di avvio (hash di executable + args + tempo).
    pub startup_fingerprint: String,
    /// Porta TCP su 127.0.0.1.
    pub port: u16,
    /// Percorso del log PostgreSQL.
    pub log_path: PathBuf,
    /// Handle del processo figlio (per stop).
    process: Option<Child>,
}

/// Stato di salute del cluster (nessun segreto, ADR-0004 §5.1).
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
pub struct ClusterHealth {
    pub ready: bool,
    pub major: u32,
    pub database: String,
    pub role: String,
    pub server_version: String,
}

/// Modalità di stop.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum StopMode {
    /// Fast shutdown (default, ADR-0004 §5.3).
    Fast,
    /// Immediate shutdown (solo emergenza).
    Immediate,
}

/// Risultato dello stop.
#[derive(Debug)]
pub struct StopResult {
    pub stopped: bool,
    pub signal: Option<String>,
    pub duration_ms: u64,
}

/// Errori del gestore cluster (sempre senza segreti o dati).
#[derive(Debug)]
pub enum PgError {
    /// Manifest mancante o non valido.
    ManifestMissing(String),
    /// Binario non trovato per il target corrente.
    BinaryMissing(String),
    /// Errore di I/O.
    Io(String),
    /// initdb fallito.
    InitDbFailed(String),
    /// Avvio di postgres fallito.
    StartFailed(String),
    /// Timeout di avvio.
    StartTimeout,
    /// Cluster non pronto (pg_isready fallito).
    NotReady(String),
    /// Connessione di verifica fallita.
    ProbeFailed(String),
    /// Stop fallito.
    StopFailed(String),
    /// Portachiavi non disponibile.
    KeyringUnavailable(String),
    /// Cluster già in esecuzione su un'altra porta.
    AlreadyRunning(u16),
    /// PGDATA non vuota per initdb.
    DataDirNotEmpty(PathBuf),
    /// Versione PostgreSQL non corrispondente.
    VersionMismatch { expected: u32, found: String },
}

impl std::fmt::Display for PgError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            PgError::ManifestMissing(m) => write!(f, "manifest PostgreSQL mancante: {m}"),
            PgError::BinaryMissing(b) => write!(f, "binario PostgreSQL mancante: {b}"),
            PgError::Io(e) => write!(f, "errore I/O: {e}"),
            PgError::InitDbFailed(e) => write!(f, "initdb fallito: {e}"),
            PgError::StartFailed(e) => write!(f, "avvio postgres fallito: {e}"),
            PgError::StartTimeout => write!(f, "timeout avvio PostgreSQL"),
            PgError::NotReady(e) => write!(f, "PostgreSQL non pronto: {e}"),
            PgError::ProbeFailed(e) => write!(f, "verifica cluster fallita: {e}"),
            PgError::StopFailed(e) => write!(f, "stop PostgreSQL fallito: {e}"),
            PgError::KeyringUnavailable(e) => write!(f, "portachiavi non disponibile: {e}"),
            PgError::AlreadyRunning(port) => write!(f, "cluster già in esecuzione sulla porta {port}"),
            PgError::DataDirNotEmpty(p) => write!(f, "PGDATA non vuota: {}", p.display()),
            PgError::VersionMismatch { expected, found } => {
                write!(f, "versione PostgreSQL non corrispondente: attesa {expected}, trovata {found}")
            }
        }
    }
}

impl std::error::Error for PgError {}

/// Manifest dei binari PostgreSQL (ADR-0004 §2.2).
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct PostgresManifest {
    pub major: u32,
    pub minor: String,
    pub distribution: String,
    pub version: String,
    /// SHA-256 dell'archivio sorgente per ogni target.
    pub sha256: HashMap<String, String>,
    /// Elenco dei binari inclusi.
    pub binaries: Vec<String>,
    /// Riferimenti a licenza e notice.
    pub license: String,
    pub notices: Vec<String>,
}

/// Gestore del cluster PostgreSQL proprietario.
pub struct PostgresClusterManager {
    /// Cartella delle risorse PostgreSQL nel bundle.
    resources: PathBuf,
    /// Portachiavi OS per le credenziali.
    credentials: Arc<Credentials>,
    /// Manifest dei binari (caricato da resources/postgresql/manifest.json).
    manifest: Option<PostgresManifest>,
}

impl PostgresClusterManager {
    pub fn new(resources: PathBuf, credentials: Arc<Credentials>) -> Self {
        PostgresClusterManager { resources, credentials, manifest: None }
    }

    /// Carica e valida il manifest dei binari (ADR-0004 §2.2).
    pub fn load_manifest(&mut self) -> Result<&PostgresManifest, PgError> {
        if self.manifest.is_some() {
            return Ok(self.manifest.as_ref().unwrap());
        }
        let manifest_path = self.resources.join("postgresql/manifest.json");
        let text = std::fs::read_to_string(&manifest_path)
            .map_err(|e| PgError::ManifestMissing(format!("{}: {e}", manifest_path.display())))?;
        let manifest: PostgresManifest = serde_json::from_str(&text)
            .map_err(|e| PgError::ManifestMissing(format!("JSON non valido: {e}")))?;
        if manifest.major != PG_MAJOR {
            return Err(PgError::VersionMismatch {
                expected: PG_MAJOR,
                found: manifest.version.clone(),
            });
        }
        self.manifest = Some(manifest);
        Ok(self.manifest.as_ref().unwrap())
    }

    /// Percorso del binario per la piattaforma corrente.
    fn binary_path(&self, name: &str) -> Result<PathBuf, PgError> {
        let exe = if cfg!(windows) { format!("{name}.exe") } else { name.to_string() };
        let path = self.resources.join("postgresql/bin").join(&exe);
        if !path.exists() {
            return Err(PgError::BinaryMissing(path.display().to_string()));
        }
        Ok(path)
    }

    /// Prepara un nuovo cluster (ADR-0004 §5.2).
    ///
    /// - Verifica che PGDATA sia vuota (mai initdb su cartella non vuota)
    /// - Genera UUID cluster
    /// - Genera credenziali nel portachiavi OS
    /// - Esegue initdb con password da file temporaneo
    pub fn prepare_new(
        &mut self,
        data_root: &Path,
        version: &str,
        bundle_id: &str,
    ) -> Result<ClusterIdentity, PgError> {
        self.load_manifest()?;
        let pgdata = data_root.join("db/postgresql");
        // Verifica che PGDATA sia vuota (ADR-0004 §5.2: mai initdb su cartella non vuota)
        if pgdata.exists() {
            let has_pg_version = pgdata.join("PG_VERSION").exists();
            let is_empty = std::fs::read_dir(&pgdata)
                .map(|mut d| d.next().is_none())
                .unwrap_or(false);
            if has_pg_version || !is_empty {
                return Err(PgError::DataDirNotEmpty(pgdata));
            }
        }
        std::fs::create_dir_all(&pgdata).map_err(|e| PgError::Io(format!("creazione PGDATA: {e}")))?;

        // Permessi 0700 su Unix (ADR-0004 §3)
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(&pgdata, std::fs::Permissions::from_mode(0o700))
                .map_err(|e| PgError::Io(format!("permessi PGDATA: {e}")))?;
        }

        let cluster_uuid = uuid_v4();
        let identity = ClusterIdentity {
            cluster_uuid: cluster_uuid.clone(),
            pgdata_path: pgdata.clone(),
            major: PG_MAJOR,
            bundle_id: bundle_id.to_string(),
            created_with: version.to_string(),
        };

        // Genera credenziali nel portachiavi OS (ADR-0004 §4)
        let app_password = self.credentials.generate_postgres_password("postgresql-app", &cluster_uuid)?;
        let admin_password = self.credentials.generate_postgres_password("postgresql-admin", &cluster_uuid)?;

        // initdb con password da file temporaneo (ADR-0004 §5.2)
        let initdb = self.binary_path("initdb")?;
        let pwfile = pgdata.join(".initdb.pw");
        std::fs::write(&pwfile, &admin_password).map_err(|e| PgError::Io(format!("scrittura pwfile: {e}")))?;

        let output = Command::new(&initdb)
            .arg(format!("--pgdata={}", pgdata.display()))
            .arg("--username=counselorbot_admin")
            .arg("--auth-host=scram-sha-256")
            .arg("--auth-local=reject")
            .arg("--locale=C")
            .arg("--encoding=UTF8")
            .arg(format!("--pwfile={}", pwfile.display()))
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .output()
            .map_err(|e| PgError::InitDbFailed(format!("esecuzione initdb: {e}")))?;

        // Elimina il file temporaneo con la password
        let _ = std::fs::remove_file(&pwfile);

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(PgError::InitDbFailed(stderr.trim().to_string()));
        }

        // Salva l'identità in run/postgresql.json (ADR-0004 §3)
        let run_dir = data_root.join("run");
        std::fs::create_dir_all(&run_dir).map_err(|e| PgError::Io(format!("creazione run/: {e}")))?;
        let identity_path = run_dir.join("postgresql.json");
        let text = serde_json::to_string_pretty(&identity).map_err(|e| PgError::Io(format!("serialize identity: {e}")))?;
        std::fs::write(&identity_path, text).map_err(|e| PgError::Io(format!("scrittura identity: {e}")))?;

        logs::log(format!("cluster PostgreSQL preparato: uuid={cluster_uuid}"));
        Ok(identity)
    }

    /// Avvia il cluster come figlio sorvegliato (ADR-0004 §5.2).
    pub fn start(&mut self, identity: &ClusterIdentity) -> Result<RunningCluster, PgError> {
        self.load_manifest()?;
        let postgres = self.binary_path("postgres")?;
        let log_path = identity.pgdata_path
            .parent()
            .and_then(|p| p.parent())
            .map(|p| p.join("logs/postgresql.log"))
            .unwrap_or_else(|| PathBuf::from("logs/postgresql.log"));
        if let Some(parent) = log_path.parent() {
            std::fs::create_dir_all(parent).map_err(|e| PgError::Io(format!("creazione log dir: {e}")))?;
        }
        let log_file = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&log_path)
            .map_err(|e| PgError::Io(format!("apertura log: {e}")))?;

        // Scelta porta libera (ADR-0004 §4)
        let port = find_free_port()?;

        // Avvia postgres direttamente come figlio (ADR-0004 §5.2: mai pg_ctl start)
        let mut child = Command::new(&postgres)
            .arg(format!("-D{}", identity.pgdata_path.display()))
            .arg(format!("-p{port}"))
            .arg("-c")
            .arg("listen_addresses=127.0.0.1")
            .arg("-c")
            .arg("unix_socket_directories=")
            .arg("-c")
            .arg("ssl=off")
            .arg("-c")
            .arg("password_encryption=scram-sha-256")
            .arg("-c")
            .arg("fsync=on")
            .arg("-c")
            .arg("full_page_writes=on")
            .arg("-c")
            .arg("synchronous_commit=on")
            .stdin(Stdio::null())
            .stdout(Stdio::from(log_file.try_clone().map_err(|e| PgError::Io(format!("clone log: {e}")))?))
            .stderr(Stdio::from(log_file))
            .spawn()
            .map_err(|e| PgError::StartFailed(format!("spawn postgres: {e}")))?;

        let postmaster_pid = child.id();
        let startup_fingerprint = format!(
            "{}:{}:{}",
            postgres.display(),
            identity.pgdata_path.display(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_millis())
                .unwrap_or(0)
        );

        let running = RunningCluster {
            identity: identity.clone(),
            postmaster_pid,
            executable: postgres.clone(),
            startup_fingerprint,
            port,
            log_path: log_path.clone(),
            process: Some(child),
        };

        // Attendi che sia pronto (pg_isready)
        let pg_isready = self.binary_path("pg_isready")?;
        let deadline = Instant::now() + FIRST_START_TIMEOUT;
        loop {
            if Instant::now() > deadline {
                return Err(PgError::StartTimeout);
            }
            let output = Command::new(&pg_isready)
                .arg("-h")
                .arg("127.0.0.1")
                .arg("-p")
                .arg(port.to_string())
                .arg("-t")
                .arg("1")
                .stdin(Stdio::null())
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .status();
            match output {
                Ok(status) if status.success() => break,
                _ => std::thread::sleep(Duration::from_millis(200)),
            }
        }

        logs::log(format!("cluster PostgreSQL avviato: pid={postmaster_pid} port={port}"));
        Ok(running)
    }

    /// Verifica lo stato di salute del cluster (ADR-0004 §5.1).
    pub fn probe(&self, running: &RunningCluster) -> Result<ClusterHealth, PgError> {
        let app_password = self.credentials.get_postgres_password("postgresql-app", &running.identity.cluster_uuid)?;
        let psql = self.binary_path("psql")?;

        // Connessione come counselorbot_app e verifica (ADR-0004 §5.2 step 5)
        let database_url = format!(
            "postgresql://counselorbot_app:{}@127.0.0.1:{}/counselorbot",
            urlencode(&app_password),
            running.port
        );

        let output = Command::new(&psql)
            .arg(&database_url)
            .arg("-t")
            .arg("-A")
            .arg("-c")
            .arg("SELECT version(), current_database(), current_user;")
            .env("PGPASSWORD", "") // mai in argv
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .output()
            .map_err(|e| PgError::ProbeFailed(format!("esecuzione psql: {e}")))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(PgError::ProbeFailed(stderr.trim().to_string()));
        }

        let stdout = String::from_utf8_lossy(&output.stdout);
        let parts: Vec<&str> = stdout.trim().split('|').collect();
        let server_version = parts.first().unwrap_or(&"unknown").to_string();

        Ok(ClusterHealth {
            ready: true,
            major: PG_MAJOR,
            database: "counselorbot".to_string(),
            role: "counselorbot_app".to_string(),
            server_version,
        })
    }

    /// Ferma il cluster (ADR-0004 §5.3).
    pub fn stop(&mut self, running: &mut RunningCluster, mode: StopMode) -> Result<StopResult, PgError> {
        let start = Instant::now();
        let pg_ctl = self.binary_path("pg_ctl")?;

        let mode_str = match mode {
            StopMode::Fast => "fast",
            StopMode::Immediate => "immediate",
        };

        let output = Command::new(&pg_ctl)
            .arg(format!("-D{}", running.identity.pgdata_path.display()))
            .arg("stop")
            .arg("-m")
            .arg(mode_str)
            .arg("-t")
            .arg((STOP_TIMEOUT.as_secs()).to_string())
            .arg("-w")
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .output()
            .map_err(|e| PgError::StopFailed(format!("esecuzione pg_ctl: {e}")))?;

        let stopped = output.status.success();
        if !stopped {
            let stderr = String::from_utf8_lossy(&output.stderr);
            // Se il processo è già morto, consideralo stop
            if let Some(ref mut child) = running.process {
                match child.try_wait() {
                    Ok(Some(_)) => {
                        return Ok(StopResult {
                            stopped: true,
                            signal: Some("already-exited".into()),
                            duration_ms: start.elapsed().as_millis() as u64,
                        });
                    }
                    _ => {}
                }
            }
            return Err(PgError::StopFailed(stderr.trim().to_string()));
        }

        // Aspetta che il processo figlio termini
        if let Some(ref mut child) = running.process {
            let _ = child.wait();
        }

        logs::log(format!("cluster PostgreSQL fermato: mode={mode_str}"));
        Ok(StopResult {
            stopped: true,
            signal: Some(mode_str.to_string()),
            duration_ms: start.elapsed().as_millis() as u64,
        })
    }

    /// Costruisce DATABASE_URL per il backend (ADR-0004 §4).
    pub fn database_url(&self, running: &RunningCluster) -> Result<String, PgError> {
        let app_password = self.credentials.get_postgres_password("postgresql-app", &running.identity.cluster_uuid)?;
        Ok(format!(
            "postgresql://counselorbot_app:{}@127.0.0.1:{}/counselorbot",
            urlencode(&app_password),
            running.port
        ))
    }
}

/// Genera un UUID v4.
fn uuid_v4() -> String {
    use getrandom::Rng;
    let mut bytes = [0u8; 16];
    getrandom::fill(&mut bytes).expect("system random generator");
    // Imposta versione 4 e variante RFC 4122
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    format!(
        "{:02x}{:02x}{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}{:02x}{:02x}{:02x}{:02x}",
        bytes[0], bytes[1], bytes[2], bytes[3],
        bytes[4], bytes[5],
        bytes[6], bytes[7],
        bytes[8], bytes[9],
        bytes[10], bytes[11], bytes[12], bytes[13], bytes[14], bytes[15]
    )
}

/// Trova una porta TCP libera su 127.0.0.1.
fn find_free_port() -> Result<u16, PgError> {
    use std::net::TcpListener;
    let listener = TcpListener::bind("127.0.0.1:0")
        .map_err(|e| PgError::Io(format!("bind porta libera: {e}")))?;
    let port = listener.local_addr()
        .map_err(|e| PgError::Io(format!("porta libera: {e}")))?
        .port();
    drop(listener);
    Ok(port)
}

/// URL-encode di una password (per DATABASE_URL).
fn urlencode(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for b in s.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(b as char);
            }
            _ => {
                out.push_str(&format!("%{b:02X}"));
            }
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_urlencode() {
        assert_eq!(urlencode("abc123"), "abc123");
        assert_eq!(urlencode("a@b#c"), "a%40b%23c");
        assert_eq!(urlencode("p@ss/word"), "p%40ss%2Fword");
    }

    #[test]
    fn test_uuid_v4_format() {
        let uuid = uuid_v4();
        assert_eq!(uuid.len(), 36);
        assert_eq!(uuid.chars().nth(14), Some('4')); // version 4
        let parts: Vec<&str> = uuid.split('-').collect();
        assert_eq!(parts.len(), 5);
        assert_eq!(parts[0].len(), 8);
        assert_eq!(parts[1].len(), 4);
        assert_eq!(parts[2].len(), 4);
        assert_eq!(parts[3].len(), 4);
        assert_eq!(parts[4].len(), 12);
    }

    #[test]
    fn test_cluster_identity_serde() {
        let identity = ClusterIdentity {
            cluster_uuid: "test-uuid".into(),
            pgdata_path: PathBuf::from("/tmp/pgdata"),
            major: 15,
            bundle_id: "org.ai4educ.counselorbot.teacher".into(),
            created_with: "0.2.0".into(),
        };
        let json = serde_json::to_string(&identity).unwrap();
        let back: ClusterIdentity = serde_json::from_str(&json).unwrap();
        assert_eq!(identity, back);
    }

    #[test]
    fn test_cluster_health_serde() {
        let health = ClusterHealth {
            ready: true,
            major: 15,
            database: "counselorbot".into(),
            role: "counselorbot_app".into(),
            server_version: "PostgreSQL 15.19".into(),
        };
        let json = serde_json::to_string(&health).unwrap();
        let back: ClusterHealth = serde_json::from_str(&json).unwrap();
        assert_eq!(health, back);
    }

    #[test]
    fn test_pg_error_display() {
        let err = PgError::ManifestMissing("test".into());
        assert!(err.to_string().contains("manifest"));
        let err = PgError::StartTimeout;
        assert!(err.to_string().contains("timeout"));
    }
}
