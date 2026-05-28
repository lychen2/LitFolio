use anyhow::{anyhow, Context, Result};
use reqwest::Url;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

use crate::secret;

const CONFIG_DIR_NAME: &str = "LitFolio";
const CONFIG_FILE_NAME: &str = "sync.json";

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct SyncConfig {
    #[serde(default)]
    pub webdav: WebDavConfig,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct WebDavConfig {
    #[serde(default)]
    pub base_url: String,
    #[serde(default)]
    pub remote_path: String,
    #[serde(default)]
    pub username: String,
    #[serde(default)]
    pub password: String,
}

impl WebDavConfig {
    pub fn validate(&self) -> Result<()> {
        let base_url = self.base_url.trim();
        let remote_path = self.remote_path.trim();
        if base_url.is_empty() {
            return Err(anyhow!("WebDAV base URL is required"));
        }
        if remote_path.is_empty() {
            return Err(anyhow!("WebDAV remote path is required"));
        }
        let url = Url::parse(base_url).context("parse WebDAV base URL")?;
        let scheme = url.scheme();
        if scheme != "http" && scheme != "https" {
            return Err(anyhow!(
                "WebDAV base URL must start with http:// or https://"
            ));
        }
        if remote_path.contains('\\') {
            return Err(anyhow!("WebDAV remote path must use forward slashes"));
        }
        Ok(())
    }
}

pub fn load_config() -> Result<SyncConfig> {
    let path = config_file()?;
    let mut cfg = load_config_at(&path)?;
    if cfg.webdav.password.is_empty() {
        match secret::get(secret::WEBDAV_ACCOUNT) {
            Ok(Some(pw)) => cfg.webdav.password = pw,
            Ok(None) => {}
            Err(e) => tracing::warn!(
                error = %e,
                "keychain read failed; webdav password will be empty until re-entered"
            ),
        }
    } else {
        // Legacy: password was stored plaintext in JSON. Migrate it to the
        // keychain, then rewrite the JSON without the secret. On migration
        // failure we leave the JSON alone so the user keeps working.
        match secret::put(secret::WEBDAV_ACCOUNT, &cfg.webdav.password) {
            Ok(()) => {
                let mut sanitized = cfg.clone();
                sanitized.webdav.password.clear();
                if let Err(e) = save_config_at(&path, &sanitized) {
                    tracing::warn!(error = %e, "rewriting sanitized sync.json failed");
                } else {
                    tracing::info!("migrated webdav password from JSON to OS keychain");
                }
            }
            Err(e) => tracing::warn!(
                error = %e,
                "keychain migration failed; leaving webdav password in JSON"
            ),
        }
    }
    Ok(cfg)
}

pub fn save_config(cfg: &SyncConfig) -> Result<()> {
    let path = config_file()?;
    let mut to_persist = cfg.clone();
    if !to_persist.webdav.password.is_empty() {
        match secret::put(secret::WEBDAV_ACCOUNT, &to_persist.webdav.password) {
            Ok(()) => to_persist.webdav.password.clear(),
            Err(e) => tracing::warn!(
                error = %e,
                "keychain put failed; webdav password will be written to JSON as a fallback"
            ),
        }
    }
    save_config_at(&path, &to_persist)
}

pub fn configured_webdav(cfg: &SyncConfig) -> Result<WebDavConfig> {
    let webdav = cfg.webdav.clone();
    webdav.validate()?;
    Ok(webdav)
}

fn config_file() -> Result<PathBuf> {
    let config_root = dirs::config_dir().ok_or_else(|| anyhow!("cannot resolve config dir"))?;
    Ok(config_root.join(CONFIG_DIR_NAME).join(CONFIG_FILE_NAME))
}

fn load_config_at(path: &Path) -> Result<SyncConfig> {
    if !path.exists() {
        return Ok(SyncConfig::default());
    }
    let raw = std::fs::read_to_string(path).with_context(|| format!("read {}", path.display()))?;
    let cfg = serde_json::from_str(&raw).with_context(|| format!("parse {}", path.display()))?;
    Ok(cfg)
}

fn save_config_at(path: &Path, cfg: &SyncConfig) -> Result<()> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).with_context(|| format!("create {}", parent.display()))?;
    }
    let body = serde_json::to_vec_pretty(cfg)?;
    std::fs::write(path, body).with_context(|| format!("write {}", path.display()))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_file(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("litera-sync-config-{}", ulid::Ulid::new()));
        std::fs::create_dir_all(&dir).unwrap();
        dir.join(name)
    }

    #[test]
    fn roundtrip_sync_config() {
        let path = temp_file("sync.json");
        let cfg = SyncConfig {
            webdav: WebDavConfig {
                base_url: "https://dav.example.com".into(),
                remote_path: "litfolio/main".into(),
                username: "alice".into(),
                password: "secret".into(),
            },
        };
        save_config_at(&path, &cfg).unwrap();
        let loaded = load_config_at(&path).unwrap();
        assert_eq!(loaded.webdav.base_url, cfg.webdav.base_url);
        std::fs::remove_dir_all(path.parent().unwrap()).ok();
    }

    #[test]
    fn validate_rejects_invalid_values() {
        let cfg = WebDavConfig {
            base_url: "ftp://dav.example.com".into(),
            remote_path: "main".into(),
            username: String::new(),
            password: String::new(),
        };
        assert!(cfg.validate().is_err());
    }
}
