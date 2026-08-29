//! Zotero push configuration, stored alongside sync.json in the OS config dir.

use anyhow::{anyhow, Context, Result};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

const CONFIG_DIR_NAME: &str = "LitFolio";
const CONFIG_FILE_NAME: &str = "zotero.json";

/// Target collection for pushes. `target_id` is a Zotero treeViewID
/// ("L1" = My Library, "C23" = collection 23) from /connector/getSelectedCollection.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct ZoteroConfig {
    #[serde(default)]
    pub target_id: Option<String>,
    #[serde(default)]
    pub target_name: Option<String>,
}

impl ZoteroConfig {
    pub fn configured(&self) -> Option<(&str, &str)> {
        match (&self.target_id, &self.target_name) {
            (Some(id), Some(name)) if !id.is_empty() => Some((id, name)),
            (Some(id), None) if !id.is_empty() => Some((id, "")),
            _ => None,
        }
    }
}

pub fn load_config() -> Result<ZoteroConfig> {
    load_config_at(&config_file()?)
}

pub fn save_config(cfg: &ZoteroConfig) -> Result<()> {
    save_config_at(&config_file()?, cfg)
}

fn config_file() -> Result<PathBuf> {
    let config_root = dirs::config_dir().ok_or_else(|| anyhow!("cannot resolve config dir"))?;
    Ok(config_root.join(CONFIG_DIR_NAME).join(CONFIG_FILE_NAME))
}

fn load_config_at(path: &Path) -> Result<ZoteroConfig> {
    if !path.exists() {
        return Ok(ZoteroConfig::default());
    }
    let raw = std::fs::read_to_string(path).with_context(|| format!("read {}", path.display()))?;
    let cfg = serde_json::from_str(&raw).with_context(|| format!("parse {}", path.display()))?;
    Ok(cfg)
}

fn save_config_at(path: &Path, cfg: &ZoteroConfig) -> Result<()> {
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

    fn temp_file() -> PathBuf {
        let dir = std::env::temp_dir().join(format!("litera-zotero-{}", ulid::Ulid::new()));
        std::fs::create_dir_all(&dir).unwrap();
        dir.join("zotero.json")
    }

    #[test]
    fn roundtrip_and_default() {
        let path = temp_file();
        assert_eq!(load_config_at(&path).unwrap(), ZoteroConfig::default());

        let cfg = ZoteroConfig {
            target_id: Some("C12".into()),
            target_name: Some("Inbox".into()),
        };
        save_config_at(&path, &cfg).unwrap();
        assert_eq!(load_config_at(&path).unwrap(), cfg);
    }

    #[test]
    fn configured_requires_nonempty_id() {
        assert!(ZoteroConfig::default().configured().is_none());
        let empty = ZoteroConfig {
            target_id: Some(String::new()),
            target_name: Some("x".into()),
        };
        assert!(empty.configured().is_none());
        let ok = ZoteroConfig {
            target_id: Some("L1".into()),
            target_name: None,
        };
        assert_eq!(ok.configured(), Some(("L1", "")));
    }
}
