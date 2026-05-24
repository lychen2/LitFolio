//! LLM profile + config persistence.
//!
//! Stored at `<library_root>/litera.config.json`. The format is intentionally
//! plain so users can hand-edit it.

use anyhow::{anyhow, Context, Result};
use serde::{Deserialize, Serialize};

use crate::storage::LibraryPaths;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LlmProfile {
    pub name: String,
    pub base_url: String,
    pub api_key: String,
    pub chat_model: String,
    pub embed_model: Option<String>,
    #[serde(default = "default_max_tokens")]
    pub max_tokens: u32,
    #[serde(default = "default_temperature")]
    pub temperature: f32,
}

fn default_max_tokens() -> u32 { 1024 }
fn default_temperature() -> f32 { 0.3 }

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct LlmConfig {
    #[serde(default)]
    pub profiles: Vec<LlmProfile>,
    #[serde(default)]
    pub active: Option<String>,
}

impl LlmConfig {
    pub fn upsert(&mut self, p: LlmProfile) {
        if let Some(slot) = self.profiles.iter_mut().find(|x| x.name == p.name) {
            *slot = p;
        } else {
            self.profiles.push(p);
        }
    }

    pub fn remove(&mut self, name: &str) {
        self.profiles.retain(|p| p.name != name);
        if self.active.as_deref() == Some(name) {
            self.active = None;
        }
    }
}

pub fn config_file(paths: &LibraryPaths) -> std::path::PathBuf {
    paths.config_file()
}

pub fn load_config(paths: &LibraryPaths) -> Result<LlmConfig> {
    let path = config_file(paths);
    if !path.exists() {
        return Ok(LlmConfig::default());
    }
    let raw = std::fs::read_to_string(&path)
        .with_context(|| format!("read {}", path.display()))?;
    let cfg: LlmConfig = serde_json::from_str(&raw)
        .with_context(|| format!("parse {}", path.display()))?;
    Ok(cfg)
}

pub fn save_config(paths: &LibraryPaths, cfg: &LlmConfig) -> Result<()> {
    let path = config_file(paths);
    if let Some(parent) = path.parent() { std::fs::create_dir_all(parent)?; }
    let body = serde_json::to_vec_pretty(cfg)?;
    std::fs::write(&path, body)?;
    Ok(())
}

pub fn active_profile(cfg: &LlmConfig) -> Result<&LlmProfile> {
    let active = cfg.active.as_deref()
        .or_else(|| cfg.profiles.first().map(|p| p.name.as_str()))
        .ok_or_else(|| anyhow!("no LLM profile configured; add one in Settings"))?;
    cfg.profiles.iter().find(|p| p.name == active)
        .ok_or_else(|| anyhow!("active profile `{active}` not found in config"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn tmp_paths() -> (LibraryPaths, PathBuf) {
        let dir = std::env::temp_dir().join(format!("litera-cfg-{}", ulid::Ulid::new()));
        std::fs::create_dir_all(&dir).unwrap();
        (LibraryPaths::new(&dir), dir)
    }

    fn sample_profile(name: &str) -> LlmProfile {
        LlmProfile {
            name: name.into(),
            base_url: "https://api.openai.com/v1".into(),
            api_key: "sk-xxx".into(),
            chat_model: "gpt-4o-mini".into(),
            embed_model: Some("text-embedding-3-small".into()),
            max_tokens: 1024,
            temperature: 0.3,
        }
    }

    #[test]
    fn roundtrip_persists_profile() {
        let (paths, dir) = tmp_paths();
        let mut cfg = LlmConfig::default();
        cfg.upsert(sample_profile("default"));
        cfg.active = Some("default".into());
        save_config(&paths, &cfg).unwrap();
        let loaded = load_config(&paths).unwrap();
        assert_eq!(loaded.profiles.len(), 1);
        assert_eq!(loaded.active.as_deref(), Some("default"));
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn upsert_overwrites_same_name() {
        let mut cfg = LlmConfig::default();
        cfg.upsert(sample_profile("p1"));
        let mut p2 = sample_profile("p1");
        p2.chat_model = "different".into();
        cfg.upsert(p2);
        assert_eq!(cfg.profiles.len(), 1);
        assert_eq!(cfg.profiles[0].chat_model, "different");
    }

    #[test]
    fn active_falls_back_to_first() {
        let mut cfg = LlmConfig::default();
        cfg.upsert(sample_profile("only"));
        let a = active_profile(&cfg).unwrap();
        assert_eq!(a.name, "only");
    }
}
