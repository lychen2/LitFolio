//! LLM profile + config persistence.
//!
//! Stored at `<library_root>/litera.config.json`. The format is intentionally
//! plain so users can hand-edit it. **Secrets are not stored in the JSON.**
//! `api_key` is pushed to the OS keychain via [`crate::secret`] on save and
//! lazily pulled back on load — the JSON file only ever sees an empty string
//! for the api_key field, so accidentally syncing this file (WebDAV, dotfile
//! repo) cannot leak credentials.
//!
//! Old configs that pre-date this change still load: when we see a non-empty
//! api_key during load, we migrate it to the keychain on the fly and rewrite
//! the JSON without the secret. If the keychain isn't available (headless
//! Linux without Secret Service, broken DBus, etc.) we leave the key in JSON
//! and log a warning so the app remains usable.

use anyhow::{anyhow, Result};
use serde::{Deserialize, Deserializer, Serialize};

use crate::mineru::PdfMarkdownConfig;

mod persistence;
#[cfg(test)]
mod tests;

pub use persistence::{load_config, save_config};

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

fn default_max_tokens() -> u32 {
    1024
}
fn default_temperature() -> f32 {
    0.3
}

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
            Pair {
                profile: String,
                #[serde(default)]
                model: Option<String>,
            },
        }
        match Either::deserialize(d)? {
            Either::Bare(profile) => Ok(TaskBinding {
                profile,
                model: None,
            }),
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
    #[serde(default = "default_output_language")]
    pub output_language: String,
    #[serde(default)]
    pub export_dir: Option<String>,
    #[serde(default)]
    pub pdf_markdown: PdfMarkdownConfig,
}

fn default_output_language() -> String {
    "Chinese".into()
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct TaskAssignments {
    #[serde(default)]
    pub tldr: Option<TaskBinding>,
    #[serde(default)]
    pub quick_read: Option<TaskBinding>,
    #[serde(default)]
    pub translate: Option<TaskBinding>,
    #[serde(default)]
    pub tag: Option<TaskBinding>,
    #[serde(default)]
    pub link: Option<TaskBinding>,
    #[serde(default)]
    pub topic_survey: Option<TaskBinding>,
    #[serde(default)]
    pub ask: Option<TaskBinding>,
    #[serde(default)]
    pub lit_review: Option<TaskBinding>,
}

#[derive(Debug, Clone, Copy)]
pub enum TaskKind {
    Tldr,
    QuickRead,
    Translate,
    Tag,
    Link,
    TopicSurvey,
    Ask,
    LitReview,
}

impl TaskKind {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Tldr => "tldr",
            Self::QuickRead => "quick_read",
            Self::Translate => "translate",
            Self::Tag => "tag",
            Self::Link => "link",
            Self::TopicSurvey => "topic_survey",
            Self::Ask => "ask",
            Self::LitReview => "lit_review",
        }
    }
}

#[cfg(test)]
impl LlmConfig {
    pub fn upsert(&mut self, p: LlmProfile) {
        if let Some(slot) = self.profiles.iter_mut().find(|x| x.name == p.name) {
            *slot = p;
        } else {
            self.profiles.push(p);
        }
    }
}

pub fn active_profile(cfg: &LlmConfig) -> Result<&LlmProfile> {
    if cfg.profiles.is_empty() {
        return Err(anyhow!("no LLM profile configured; add one in Settings"));
    }
    if let Some(name) = cfg.active.as_deref().filter(|s| !s.is_empty()) {
        if let Some(p) = cfg.profiles.iter().find(|p| p.name == name) {
            return Ok(p);
        }
        tracing::warn!(
            active = name,
            fallback = cfg.profiles[0].name,
            "active LLM profile is missing; using first configured profile"
        );
    }
    Ok(&cfg.profiles[0])
}

/// Resolve the profile (and effective chat_model) for a given task. Returns an OWNED LlmProfile
/// because the model field may have been overridden by the task binding — callers downstream
/// just use `profile.chat_model` as before and don't need to know about the override.
pub fn active_profile_for_task(cfg: &LlmConfig, task: TaskKind) -> Result<LlmProfile> {
    let binding: Option<&TaskBinding> = match task {
        TaskKind::Tldr => cfg.task_assignments.tldr.as_ref(),
        TaskKind::QuickRead => cfg.task_assignments.quick_read.as_ref(),
        TaskKind::Translate => cfg.task_assignments.translate.as_ref(),
        TaskKind::Tag => cfg.task_assignments.tag.as_ref(),
        TaskKind::Link => cfg.task_assignments.link.as_ref(),
        TaskKind::TopicSurvey => cfg.task_assignments.topic_survey.as_ref(),
        TaskKind::Ask => cfg.task_assignments.ask.as_ref(),
        TaskKind::LitReview => cfg.task_assignments.lit_review.as_ref(),
    };
    if let Some(b) = binding {
        let mut p = match cfg.profiles.iter().find(|x| x.name == b.profile) {
            Some(profile) => profile.clone(),
            None => {
                tracing::warn!(
                    bound = b.profile,
                    fallback = cfg.profiles.first().map(|p| p.name.as_str()).unwrap_or(""),
                    "task binding profile is missing; using default profile"
                );
                active_profile(cfg)?.clone()
            }
        };
        if let Some(m) = b.model.as_deref().filter(|s| !s.is_empty()) {
            p.chat_model = m.to_string();
        }
        return Ok(p);
    }
    Ok(active_profile(cfg)?.clone())
}
