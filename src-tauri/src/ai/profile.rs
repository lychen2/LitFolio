//! LLM profile + config persistence.
//!
//! Stored at `<library_root>/litera.config.json`. The format is intentionally
//! plain so users can hand-edit it.

use anyhow::{anyhow, Context, Result};
use serde::{Deserialize, Deserializer, Serialize};

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

/// A per-task LLM binding. `profile` selects the endpoint+key+params, `model` optionally
/// overrides `profile.chat_model` — so one profile (one key) can serve many tasks with
/// different models without forcing the user to duplicate the profile.
///
/// On the wire the field accepts either the new object form `{ "profile": "x", "model": "y" }`
/// OR the legacy bare-string form `"x"` (treated as profile name with no model override) so
/// existing litera.config.json files keep working without a migration step.
#[derive(Debug, Clone, Serialize)]
pub struct TaskBinding {
    pub profile: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
}

impl<'de> Deserialize<'de> for TaskBinding {
    fn deserialize<D: Deserializer<'de>>(d: D) -> std::result::Result<Self, D::Error> {
        #[derive(Deserialize)]
        #[serde(untagged)]
        enum Either {
            Bare(String),
            Pair { profile: String, #[serde(default)] model: Option<String> },
        }
        match Either::deserialize(d)? {
            Either::Bare(profile) => Ok(TaskBinding { profile, model: None }),
            Either::Pair { profile, model } => Ok(TaskBinding { profile, model }),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct LlmConfig {
    #[serde(default)]
    pub profiles: Vec<LlmProfile>,
    #[serde(default)]
    pub active: Option<String>,
    #[serde(default)]
    pub task_assignments: TaskAssignments,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct TaskAssignments {
    #[serde(default)] pub tldr: Option<TaskBinding>,
    #[serde(default)] pub quick_read: Option<TaskBinding>,
    #[serde(default)] pub translate: Option<TaskBinding>,
    #[serde(default)] pub tag: Option<TaskBinding>,
    #[serde(default)] pub link: Option<TaskBinding>,
}

#[derive(Debug, Clone, Copy)]
pub enum TaskKind { Tldr, QuickRead, Translate, Tag, Link }

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
    if cfg.profiles.is_empty() {
        return Err(anyhow!("no LLM profile configured; add one in Settings"));
    }
    if let Some(name) = cfg.active.as_deref() {
        if let Some(p) = cfg.profiles.iter().find(|p| p.name == name) {
            return Ok(p);
        }
        tracing::warn!(
            "LLM config: active=`{name}` not found in {n} profile(s); falling back to first",
            n = cfg.profiles.len()
        );
    }
    Ok(&cfg.profiles[0])
}

/// Resolve the profile (and effective chat_model) for a given task. Returns an OWNED LlmProfile
/// because the model field may have been overridden by the task binding — callers downstream
/// just use `profile.chat_model` as before and don't need to know about the override.
pub fn active_profile_for_task(cfg: &LlmConfig, task: TaskKind) -> Result<LlmProfile> {
    let binding: Option<&TaskBinding> = match task {
        TaskKind::Tldr      => cfg.task_assignments.tldr.as_ref(),
        TaskKind::QuickRead => cfg.task_assignments.quick_read.as_ref(),
        TaskKind::Translate => cfg.task_assignments.translate.as_ref(),
        TaskKind::Tag       => cfg.task_assignments.tag.as_ref(),
        TaskKind::Link      => cfg.task_assignments.link.as_ref(),
    };
    if let Some(b) = binding {
        let mut p = cfg.profiles.iter().find(|x| x.name == b.profile)
            .ok_or_else(|| anyhow!("profile `{}` not in config", b.profile))?
            .clone();
        if let Some(m) = b.model.as_deref().filter(|s| !s.is_empty()) {
            p.chat_model = m.to_string();
        }
        return Ok(p);
    }
    Ok(active_profile(cfg)?.clone())
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

    #[test]
    fn task_binding_overrides_chat_model() {
        // Single profile, but each task uses a different model from that profile's endpoint.
        let mut cfg = LlmConfig::default();
        cfg.upsert(sample_profile("proxy"));
        cfg.active = Some("proxy".into());
        cfg.task_assignments.tldr      = Some(TaskBinding { profile: "proxy".into(), model: Some("gpt-5.4".into()) });
        cfg.task_assignments.quick_read = Some(TaskBinding { profile: "proxy".into(), model: Some("gpt-5.5".into()) });
        cfg.task_assignments.translate = Some(TaskBinding { profile: "proxy".into(), model: None }); // no override → profile default

        let p1 = active_profile_for_task(&cfg, TaskKind::Tldr).unwrap();
        assert_eq!(p1.chat_model, "gpt-5.4");
        let p2 = active_profile_for_task(&cfg, TaskKind::QuickRead).unwrap();
        assert_eq!(p2.chat_model, "gpt-5.5");
        let p3 = active_profile_for_task(&cfg, TaskKind::Translate).unwrap();
        assert_eq!(p3.chat_model, "gpt-4o-mini"); // profile.chat_model default
    }

    #[test]
    fn task_binding_falls_back_when_no_binding() {
        let mut cfg = LlmConfig::default();
        cfg.upsert(sample_profile("a"));
        let p = active_profile_for_task(&cfg, TaskKind::Tag).unwrap();
        assert_eq!(p.name, "a");
    }

    #[test]
    fn task_binding_errors_when_profile_missing() {
        let mut cfg = LlmConfig::default();
        cfg.upsert(sample_profile("a"));
        cfg.task_assignments.translate = Some(TaskBinding { profile: "ghost".into(), model: None });
        assert!(active_profile_for_task(&cfg, TaskKind::Translate).is_err());
    }

    #[test]
    fn legacy_bare_string_binding_still_loads() {
        // Existing config files written before this refactor stored task assignments as
        // bare profile names ("tldr": "fast"). Must continue to load and resolve.
        let raw = r#"{
            "profiles": [{"name":"fast","base_url":"u","api_key":"k","chat_model":"m","embed_model":null,"max_tokens":1024,"temperature":0.3}],
            "active": "fast",
            "task_assignments": { "tldr": "fast", "quick_read": null }
        }"#;
        let cfg: LlmConfig = serde_json::from_str(raw).unwrap();
        let b = cfg.task_assignments.tldr.as_ref().expect("tldr should bind");
        assert_eq!(b.profile, "fast");
        assert!(b.model.is_none());
        let p = active_profile_for_task(&cfg, TaskKind::Tldr).unwrap();
        assert_eq!(p.chat_model, "m");
    }

    #[test]
    fn active_profile_falls_back_when_active_name_missing() {
        let mut cfg = LlmConfig::default();
        cfg.upsert(sample_profile("deepseek-flash"));
        cfg.active = Some("deepseek-chat".into());
        let p = active_profile(&cfg).expect("should fall back to first profile");
        assert_eq!(p.name, "deepseek-flash");
    }

    #[test]
    fn active_profile_errors_when_no_profiles_at_all() {
        let cfg = LlmConfig::default();
        let err = active_profile(&cfg).expect_err("empty config should error");
        assert!(err.to_string().contains("no LLM profile"));
    }
}
