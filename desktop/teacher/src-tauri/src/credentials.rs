//! F1-08: secrets live only in the OS credential store and backend environment.
//! Never return a value, key prefix, provider response or OS error through IPC.

use std::sync::Mutex;
use std::time::Duration;

use serde::Serialize;

const SERVICE: &str = "org.ai4educ.counselorbot.teacher";
const STORE_ERROR: &str = "Portachiavi non disponibile o bloccato. Sbloccalo e riprova.";
const INVALID: &str = "Chiave non valida: usa da 1 a 4096 caratteri ASCII senza spazi.";

pub struct Provider {
    pub id: &'static str,
    label: &'static str,
    pub env: &'static [&'static str],
    endpoint: Option<&'static str>,
}

// Keep aliases aligned with backend/api_secrets.py. SDK aliases are also set.
pub const PROVIDERS: &[Provider] = &[
    Provider {
        id: "openai",
        label: "OpenAI",
        env: &["API_KEY_OPENAI", "OPENAI_API_KEY"],
        endpoint: Some("https://api.openai.com/v1/models"),
    },
    Provider {
        id: "anthropic",
        label: "Anthropic",
        env: &["API_KEY_ANTHROPIC", "ANTHROPIC_API_KEY"],
        endpoint: Some("https://api.anthropic.com/v1/models?limit=1"),
    },
    Provider {
        id: "openrouter",
        label: "OpenRouter",
        env: &["API_KEY_OPENROUTER", "OPENROUTER_API_KEY"],
        endpoint: Some("https://openrouter.ai/api/v1/key"),
    },
    Provider {
        id: "gemini",
        label: "Google Gemini",
        env: &["API_KEY_GEMINI", "GEMINI_API_KEY", "GOOGLE_API_KEY"],
        endpoint: Some("https://generativelanguage.googleapis.com/v1beta/models?pageSize=1"),
    },
    Provider {
        id: "mistral",
        label: "Mistral",
        env: &["API_KEY_MISTRAL"],
        endpoint: Some("https://api.mistral.ai/v1/models"),
    },
    Provider {
        id: "groq",
        label: "Groq",
        env: &["API_KEY_GROQ", "GROQ_API_KEY"],
        endpoint: Some("https://api.groq.com/openai/v1/models"),
    },
    Provider {
        id: "cerebras",
        label: "Cerebras",
        env: &["API_KEY_CEREBRAS", "CEREBRAS_API_KEY"],
        endpoint: Some("https://api.cerebras.ai/v1/models"),
    },
    Provider {
        id: "deepseek",
        label: "DeepSeek",
        env: &["API_KEY_DEEPSEEK", "DEEPSEEK_API_KEY"],
        endpoint: Some("https://api.deepseek.com/models"),
    },
    Provider { id: "together", label: "Together", env: &["API_KEY_TOGETHER", "TOGETHER_API_KEY"], endpoint: None },
    Provider { id: "fireworks", label: "Fireworks", env: &["API_KEY_FIREWORKS", "FIREWORKS_API_KEY"], endpoint: None },
    Provider { id: "deepinfra", label: "DeepInfra", env: &["API_KEY_DEEPINFRA", "DEEPINFRA_API_KEY"], endpoint: None },
    Provider { id: "omniroute", label: "OmniRoute", env: &["OMNIROUTE_API_KEY", "API_KEY_OMNIROUTE"], endpoint: None },
    Provider {
        id: "opencode",
        label: "OpenCode (riservata, escluso dal profilo docente)",
        env: &["OPENCODE_API_KEY"],
        endpoint: None,
    },
    Provider { id: "privacy_kek", label: "Privacy KEK (riservata)", env: &["PRIVACY_KEK"], endpoint: None },
];

fn provider(id: &str) -> Result<&'static Provider, String> {
    PROVIDERS.iter().find(|p| p.id == id).ok_or_else(|| "Fornitore non supportato.".into())
}

pub fn validate(value: &str) -> Result<(), String> {
    if value.is_empty() || value.len() > 4096 || !value.bytes().all(|b| b.is_ascii_graphic()) {
        return Err(INVALID.into());
    }
    Ok(())
}

pub trait CredentialStore: Send {
    fn get(&self, id: &str) -> Result<Option<String>, String>;
    fn set(&mut self, id: &str, value: &str) -> Result<(), String>;
    fn remove(&mut self, id: &str) -> Result<(), String>;
}

pub struct OsStore;

fn entry(id: &str) -> Result<keyring::Entry, String> {
    keyring::Entry::new(SERVICE, id).map_err(|_| STORE_ERROR.into())
}

impl CredentialStore for OsStore {
    fn get(&self, id: &str) -> Result<Option<String>, String> {
        match entry(id)?.get_password() {
            Ok(value) => Ok(Some(value)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(_) => Err(STORE_ERROR.into()),
        }
    }
    fn set(&mut self, id: &str, value: &str) -> Result<(), String> {
        entry(id)?.set_password(value).map_err(|_| STORE_ERROR.into())
    }
    fn remove(&mut self, id: &str) -> Result<(), String> {
        match entry(id)?.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(_) => Err(STORE_ERROR.into()),
        }
    }
}

// Used only by explicit headless/smoke modes and automated tests. Never writes
// files or opens the teacher's actual OS entries on unattended CI machines.
#[derive(Default)]
pub struct MemoryStore(pub std::collections::HashMap<String, String>);
impl CredentialStore for MemoryStore {
    fn get(&self, id: &str) -> Result<Option<String>, String> {
        Ok(self.0.get(id).cloned())
    }
    fn set(&mut self, id: &str, value: &str) -> Result<(), String> {
        self.0.insert(id.into(), value.into());
        Ok(())
    }
    fn remove(&mut self, id: &str) -> Result<(), String> {
        self.0.remove(id);
        Ok(())
    }
}

pub struct Credentials(Mutex<Box<dyn CredentialStore>>);

/// Explicit smoke/headless modes use disposable profiles and never the OS
/// keychain. Stable synthetic DB credentials allow restarting that test profile.
#[derive(Default)]
pub struct HeadlessStore(MemoryStore);

impl CredentialStore for HeadlessStore {
    fn get(&self, id: &str) -> Result<Option<String>, String> {
        if id.starts_with("postgresql-app:") || id.starts_with("postgresql-admin:") {
            Ok(Some("isolated-headless-test-only".into()))
        } else {
            self.0.get(id)
        }
    }
    fn set(&mut self, id: &str, value: &str) -> Result<(), String> {
        self.0.set(id, value)
    }
    fn remove(&mut self, id: &str) -> Result<(), String> {
        self.0.remove(id)
    }
}

#[derive(Serialize)]
pub struct CredentialStatus {
    pub id: &'static str,
    label: &'static str,
    pub configured: bool,
    testable: bool,
}

impl Credentials {
    pub fn new(store: impl CredentialStore + 'static) -> Self {
        Self(Mutex::new(Box::new(store)))
    }

    pub fn status(&self) -> Result<Vec<CredentialStatus>, String> {
        let store = self.0.lock().map_err(|_| STORE_ERROR)?;
        PROVIDERS
            .iter()
            .map(|p| {
                Ok(CredentialStatus {
                    id: p.id,
                    label: p.label,
                    configured: store.get(p.id).map_err(|_| STORE_ERROR)?.is_some(),
                    testable: p.endpoint.is_some(),
                })
            })
            .collect()
    }

    pub fn save(&self, id: &str, value: &str) -> Result<(), String> {
        provider(id)?;
        validate(value)?;
        self.0.lock().map_err(|_| STORE_ERROR)?.set(id, value).map_err(|_| STORE_ERROR.into())
    }

    pub fn remove(&self, id: &str) -> Result<(), String> {
        provider(id)?;
        self.0.lock().map_err(|_| STORE_ERROR)?.remove(id).map_err(|_| STORE_ERROR.into())
    }

    pub fn test(&self, id: &str, draft: Option<String>) -> Result<ProbeResult, String> {
        self.test_with(id, draft, check_remote)
    }

    fn test_with(
        &self,
        id: &str,
        draft: Option<String>,
        probe: impl FnOnce(&Provider, &str) -> Result<ProbeResult, String>,
    ) -> Result<ProbeResult, String> {
        let p = provider(id)?;
        p.endpoint.ok_or("Verifica remota non disponibile per questa credenziale.")?;
        let value = match draft {
            Some(value) => value,
            None => {
                self.0.lock().map_err(|_| STORE_ERROR)?.get(id).map_err(|_| STORE_ERROR)?.ok_or("Chiave mancante.")?
            }
        };
        validate(&value)?;
        probe(p, &value)
    }

    /// Set EVERY alias, including empty missing entries, overriding inherited
    /// environment values so deletion cannot silently reactivate a shell key.
    pub fn backend_env(&self) -> Result<Vec<(String, String)>, String> {
        let store = self.0.lock().map_err(|_| STORE_ERROR)?;
        let mut env = Vec::new();
        for p in PROVIDERS {
            let value = store.get(p.id).map_err(|_| STORE_ERROR)?.unwrap_or_default();
            if !value.is_empty() {
                validate(&value)?;
            }
            env.extend(p.env.iter().map(|name| ((*name).into(), value.clone())));
        }
        Ok(env)
    }

    /// ADR-0004 §4: genera e salva una password PostgreSQL nel portachiavi OS.
    ///
    /// - `account`: "postgresql-app" o "postgresql-admin"
    /// - `cluster_uuid`: UUID del cluster per isolare le voci
    ///
    /// Restituisce la password generata (32 byte base64url).
    pub fn generate_postgres_password(&self, account: &str, cluster_uuid: &str) -> Result<String, String> {
        let id = format!("{account}:{cluster_uuid}");
        if let Some(password) = self.0.lock().map_err(|_| STORE_ERROR)?.get(&id)? {
            return Ok(password);
        }
        let password = generate_secure_password();
        self.0.lock().map_err(|_| STORE_ERROR)?.set(&id, &password).map_err(|_| STORE_ERROR.into())?;
        Ok(password)
    }

    /// ADR-0004 §4: legge una password PostgreSQL dal portachiavi OS.
    pub fn get_postgres_password(&self, account: &str, cluster_uuid: &str) -> Result<String, String> {
        let id = format!("{account}:{cluster_uuid}");
        self.0
            .lock()
            .map_err(|_| STORE_ERROR)?
            .get(&id)
            .map_err(|_| STORE_ERROR)?
            .ok_or_else(|| format!("Password PostgreSQL mancante per {account}"))
    }

    /// ADR-0004 §4: rimuove le password PostgreSQL di un cluster.
    pub fn remove_postgres_passwords(&self, cluster_uuid: &str) -> Result<(), String> {
        let mut store = self.0.lock().map_err(|_| STORE_ERROR)?;
        for account in ["postgresql-app", "postgresql-admin"] {
            let id = format!("{account}:{cluster_uuid}");
            let _ = store.remove(&id); // ignora se non esiste
        }
        Ok(())
    }
}

/// Genera una password sicura: 32 byte casuali, base64url senza padding.
fn generate_secure_password() -> String {
    use base64::Engine;
    let mut bytes = [0u8; 32];
    getrandom::fill(&mut bytes).expect("system random generator");
    base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(bytes)
}

fn check_remote(p: &Provider, value: &str) -> Result<ProbeResult, String> {
    let client = reqwest::blocking::Client::builder()
        .https_only(true)
        .redirect(reqwest::redirect::Policy::none())
        .no_proxy()
        .connect_timeout(Duration::from_secs(5))
        .timeout(Duration::from_secs(15))
        .build()
        .map_err(|_| "Verifica non disponibile.")?;
    let request = probe_request(&client, p, value)?;
    // Ignore bodies and transport errors: they can echo the credential.
    Ok(match request.send() {
        Ok(response) => classify_probe(response.status().as_u16()),
        Err(_) => ProbeResult::Unavailable,
    })
}

fn probe_request(
    client: &reqwest::blocking::Client,
    p: &Provider,
    value: &str,
) -> Result<reqwest::blocking::RequestBuilder, String> {
    let request = client.get(p.endpoint.ok_or("Verifica remota non disponibile.")?);
    let mut header = reqwest::header::HeaderValue::from_str(value).map_err(|_| INVALID)?;
    header.set_sensitive(true);
    Ok(match p.id {
        "anthropic" => request.header("x-api-key", header).header("anthropic-version", "2023-06-01"),
        "gemini" => request.header("x-goog-api-key", header),
        _ => request.bearer_auth(value),
    })
}

#[derive(Debug, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ProbeResult {
    Accepted,
    Rejected,
    RateLimited,
    Unavailable,
}

fn classify_probe(status: u16) -> ProbeResult {
    match status {
        200..=299 => ProbeResult::Accepted,
        401 | 403 => ProbeResult::Rejected,
        429 => ProbeResult::RateLimited,
        _ => ProbeResult::Unavailable,
    }
}

/// Sidecars that do not need credentials must never inherit them from the shell.
pub fn remove_inherited(command: &mut std::process::Command) {
    for p in PROVIDERS {
        for name in p.env {
            command.env_remove(name);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const SENTINEL: &str = "synthetic-f108-never-a-real-key";

    #[test]
    fn crud_status_and_aliases_never_return_values() {
        let credentials = Credentials::new(MemoryStore::default());
        assert!(!credentials.status().unwrap().iter().any(|s| s.configured));
        credentials.save("openai", SENTINEL).unwrap();
        assert!(credentials.status().unwrap().iter().find(|s| s.id == "openai").unwrap().configured);
        assert!(!serde_json::to_string(&credentials.status().unwrap()).unwrap().contains(SENTINEL));
        let env = credentials.backend_env().unwrap();
        for alias in provider("openai").unwrap().env {
            assert_eq!(env.iter().find(|(name, _)| name.as_str() == *alias).unwrap().1, SENTINEL);
        }
        credentials.save("openai", "replacement").unwrap();
        assert_eq!(credentials.backend_env().unwrap()[0].1, "replacement");
        credentials.remove("openai").unwrap();
        credentials.remove("openai").unwrap();
        assert!(credentials.backend_env().unwrap().iter().all(|(_, value)| value.is_empty()));
    }

    #[test]
    fn rejects_unknown_providers_and_malformed_credentials_without_echo() {
        let credentials = Credentials::new(MemoryStore::default());
        assert!(!credentials.save(SENTINEL, SENTINEL).unwrap_err().contains(SENTINEL));
        assert!(credentials.remove("unknown").is_err());
        for value in ["".into(), " space ".into(), "line\nbreak".into(), "\0".into(), "é".into(), "x".repeat(4097)] {
            assert_eq!(credentials.save("openai", &value).unwrap_err(), INVALID);
        }
        assert!(credentials.backend_env().unwrap().iter().all(|(_, value)| value.is_empty()));
        assert!(credentials.test("openai", None).is_err());
        assert!(credentials.test("opencode", Some(SENTINEL.into())).is_err());
    }

    struct LockedStore;
    impl CredentialStore for LockedStore {
        fn get(&self, _: &str) -> Result<Option<String>, String> {
            Err(SENTINEL.into())
        }
        fn set(&mut self, _: &str, _: &str) -> Result<(), String> {
            Err(SENTINEL.into())
        }
        fn remove(&mut self, _: &str) -> Result<(), String> {
            Err(SENTINEL.into())
        }
    }

    #[test]
    fn locked_store_fails_closed_and_discards_native_error_details() {
        let credentials = Credentials::new(LockedStore);
        assert_eq!(credentials.status().err().unwrap(), STORE_ERROR);
        assert_eq!(credentials.save("openai", SENTINEL).unwrap_err(), STORE_ERROR);
        assert_eq!(credentials.remove("openai").unwrap_err(), STORE_ERROR);
        assert_eq!(credentials.backend_env().unwrap_err(), STORE_ERROR);
        assert_eq!(credentials.test("openai", None).unwrap_err(), STORE_ERROR);
    }

    #[test]
    fn provider_probe_distinguishes_auth_quota_network_and_redirects() {
        assert_eq!(classify_probe(200), ProbeResult::Accepted);
        for status in [401, 403] {
            assert_eq!(classify_probe(status), ProbeResult::Rejected);
        }
        assert_eq!(classify_probe(429), ProbeResult::RateLimited);
        for status in [302, 404, 500, 503] {
            assert_eq!(classify_probe(status), ProbeResult::Unavailable);
        }
        for p in PROVIDERS {
            if let Some(endpoint) = p.endpoint {
                assert!(endpoint.starts_with("https://"));
            }
        }
    }

    #[test]
    fn all_credential_aliases_are_removed_from_unprivileged_sidecars() {
        let mut command = std::process::Command::new("unused");
        for p in PROVIDERS {
            for name in p.env {
                command.env(name, SENTINEL);
            }
        }
        remove_inherited(&mut command);
        for (_, value) in command.get_envs() {
            assert!(value.is_none());
        }
    }

    #[test]
    fn probe_uses_draft_or_saved_value_without_persisting_a_draft() {
        let credentials = Credentials::new(MemoryStore::default());
        let probe = |p: &Provider, value: &str| {
            assert_eq!(p.id, "openai");
            assert_eq!(value, SENTINEL);
            Ok(ProbeResult::Accepted)
        };
        assert_eq!(credentials.test_with("openai", Some(SENTINEL.into()), probe).unwrap(), ProbeResult::Accepted);
        assert!(!credentials.status().unwrap().iter().any(|s| s.configured));
        credentials.save("openai", SENTINEL).unwrap();
        assert_eq!(credentials.test_with("openai", None, probe).unwrap(), ProbeResult::Accepted);
    }

    #[test]
    fn authenticated_gets_keep_credentials_out_of_urls_bodies_and_debug_headers() {
        let client = reqwest::blocking::Client::new();
        for p in PROVIDERS.iter().filter(|p| p.endpoint.is_some()) {
            let request = probe_request(&client, p, SENTINEL).unwrap().build().unwrap();
            assert_eq!(request.method(), reqwest::Method::GET);
            assert!(request.body().is_none());
            assert!(!request.url().as_str().contains(SENTINEL));
            let name = match p.id {
                "anthropic" => "x-api-key",
                "gemini" => "x-goog-api-key",
                _ => "authorization",
            };
            assert!(request.headers()[name].is_sensitive());
            assert!(!format!("{:?}", request.headers()).contains(SENTINEL));
        }
    }
}

#[cfg(test)]
mod postgres_tests {
    use super::*;

    #[test]
    fn cluster_passwords_are_preserved_on_repeated_calls() {
        let credentials = Credentials::new(MemoryStore::default());
        let app = credentials.generate_postgres_password("postgresql-app", "uuid").unwrap();
        assert_eq!(credentials.generate_postgres_password("postgresql-app", "uuid").unwrap(), app);
        let admin = credentials.generate_postgres_password("postgresql-admin", "uuid").unwrap();
        assert_ne!(app, admin);
        credentials.remove_postgres_passwords("uuid").unwrap();
        assert!(credentials.get_postgres_password("postgresql-app", "uuid").is_err());
    }

    #[test]
    fn disposable_profiles_reopen_without_using_the_os_store() {
        let first = Credentials::new(HeadlessStore::default());
        let password = first.generate_postgres_password("postgresql-app", "uuid").unwrap();
        let second = Credentials::new(HeadlessStore::default());
        assert_eq!(second.get_postgres_password("postgresql-app", "uuid").unwrap(), password);
        assert!(second.status().unwrap().iter().all(|provider| !provider.configured));
    }
}
