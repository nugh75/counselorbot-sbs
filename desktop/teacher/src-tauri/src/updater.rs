//! Integrazione con l'updater di Tauri v2 e backup preventivo SQLite (F1-16).
//!
//! Canali supportati: `stable` (predefinito) e `beta`.
//! Manifest endpoint configurabili tramite canale o variabile `COUNSELORBOT_UPDATER_URL`.
//! Prima di applicare qualsiasi aggiornamento viene sempre eseguito un backup verificato
//! del database SQLite (F1-05j). Se il backup fallisce, l'aggiornamento non viene scaricato né applicato.

use std::path::PathBuf;
use std::sync::Arc;

use serde::{Deserialize, Serialize};
use tauri_plugin_updater::UpdaterExt;

use crate::datadir::DataDir;
use crate::supervisor;

pub const DEFAULT_CHANNEL: &str = "stable";
pub const STABLE_ENDPOINT: &str = "https://github.com/nugh75/counselorbot-sbs/releases/latest/download/latest.json";
pub const BETA_ENDPOINT: &str = "https://github.com/nugh75/counselorbot-sbs/releases/download/beta/latest-beta.json";

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
pub struct UpdateInfo {
    pub available: bool,
    pub current_version: String,
    pub version: Option<String>,
    pub date: Option<String>,
    pub body: Option<String>,
    pub channel: String,
}

pub fn endpoint_url(channel: &str) -> String {
    if let Ok(override_url) = std::env::var("COUNSELORBOT_UPDATER_URL") {
        let trimmed = override_url.trim();
        if !trimmed.is_empty() {
            return trimmed.to_string();
        }
    }
    match channel {
        "beta" => BETA_ENDPOINT.to_string(),
        _ => STABLE_ENDPOINT.to_string(),
    }
}

pub fn resolve_data_dir(state: &supervisor::Handle) -> DataDir {
    let root = PathBuf::from(state.status.lock().unwrap().data_dir.clone());
    DataDir { root, first_run: false }
}

#[tauri::command]
pub async fn get_updater_channel(state: tauri::State<'_, Arc<supervisor::Handle>>) -> Result<String, String> {
    let data = resolve_data_dir(&state);
    let config = data.load_config();
    Ok(config.updater_channel.unwrap_or_else(|| DEFAULT_CHANNEL.to_string()))
}

#[tauri::command]
pub async fn set_updater_channel(
    channel: String,
    state: tauri::State<'_, Arc<supervisor::Handle>>,
) -> Result<(), String> {
    let ch = channel.trim().to_lowercase();
    if ch != "stable" && ch != "beta" {
        return Err(format!("Canale aggiornamento non valido: '{channel}'. Valori ammessi: 'stable', 'beta'."));
    }
    let data = resolve_data_dir(&state);
    let mut config = data.load_config();
    config.updater_channel = Some(ch);
    data.save_config(&config).map_err(|e| format!("Salvataggio configurazione fallito: {e}"))
}

#[tauri::command]
pub async fn check_for_updates(
    app: tauri::AppHandle,
    state: tauri::State<'_, Arc<supervisor::Handle>>,
) -> Result<UpdateInfo, String> {
    let data = resolve_data_dir(&state);
    let config = data.load_config();
    let channel = config.updater_channel.unwrap_or_else(|| DEFAULT_CHANNEL.to_string());
    let url_str = endpoint_url(&channel);

    let url = url_str.parse().map_err(|e| format!("URL endpoint aggiornamento non valido '{url_str}': {e}"))?;

    let updater = app
        .updater_builder()
        .endpoints(vec![url])
        .map_err(|e| format!("Configurazione updater: {e}"))?
        .build()
        .map_err(|e| format!("Creazione updater: {e}"))?;

    let current_version = app.package_info().version.to_string();
    let check_result = updater.check().await.map_err(|e| format!("Verifica aggiornamenti fallita: {e}"))?;

    if let Some(update) = check_result {
        Ok(UpdateInfo {
            available: true,
            current_version,
            version: Some(update.version.clone()),
            date: update.date.map(|d| d.to_string()),
            body: update.body.clone(),
            channel,
        })
    } else {
        Ok(UpdateInfo { available: false, current_version, version: None, date: None, body: None, channel })
    }
}

#[tauri::command]
pub async fn apply_update(
    app: tauri::AppHandle,
    state: tauri::State<'_, Arc<supervisor::Handle>>,
) -> Result<String, String> {
    // 1. REQUISITO OBBLIGATORIO: Backup automatico SQLite prima di aggiornare.
    // Se il backup fallisce, l'aggiornamento non parte.
    let backup_path = state.backup_db().map_err(|err| {
        format!("Backup preventivo del database fallito ({err}). Aggiornamento annullato per sicurezza.")
    })?;

    // 2. Controllo e applicazione dell'aggiornamento
    let data = resolve_data_dir(&state);
    let config = data.load_config();
    let channel = config.updater_channel.unwrap_or_else(|| DEFAULT_CHANNEL.to_string());
    let url_str = endpoint_url(&channel);
    let url = url_str.parse().map_err(|e| format!("URL endpoint aggiornamento non valido '{url_str}': {e}"))?;

    let updater = app
        .updater_builder()
        .endpoints(vec![url])
        .map_err(|e| format!("Configurazione updater: {e}"))?
        .build()
        .map_err(|e| format!("Creazione updater: {e}"))?;

    let update = updater
        .check()
        .await
        .map_err(|e| format!("Verifica aggiornamenti fallita: {e}"))?
        .ok_or_else(|| "Nessun aggiornamento disponibile da installare.".to_string())?;

    let target_version = update.version.clone();

    // 3. Download e installazione
    update
        .download_and_install(|_chunk, _total| {}, || {})
        .await
        .map_err(|e| format!("Installazione dell'aggiornamento non riuscita: {e}"))?;

    Ok(format!(
        "Aggiornamento alla versione {target_version} completato con successo. Backup salvato in: {backup_path}"
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn endpoint_url_resolution_defaults_and_channels() {
        assert_eq!(endpoint_url("stable"), STABLE_ENDPOINT);
        assert_eq!(endpoint_url("beta"), BETA_ENDPOINT);
        assert_eq!(endpoint_url("unknown"), STABLE_ENDPOINT);
    }

    #[test]
    fn endpoint_url_resolution_respects_env_override() {
        std::env::set_var("COUNSELORBOT_UPDATER_URL", "https://example.com/custom.json");
        assert_eq!(endpoint_url("stable"), "https://example.com/custom.json");
        assert_eq!(endpoint_url("beta"), "https://example.com/custom.json");
        std::env::remove_var("COUNSELORBOT_UPDATER_URL");
    }
}
