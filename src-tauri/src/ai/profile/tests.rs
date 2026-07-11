use super::*;
use crate::storage::LibraryPaths;
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
fn default_pdf_markdown_engine_is_mineru_agent() {
    let cfg = LlmConfig::default();
    assert_eq!(
        cfg.pdf_markdown.engine,
        crate::mineru::PdfMarkdownEngine::MineruAgent
    );
}

#[test]
fn load_migrates_local_pdf_markdown_engine_to_mineru_agent() {
    let (paths, dir) = tmp_paths();
    let raw = r#"{
        "profiles": [],
        "pdf_markdown": { "engine": "local", "mineru_token": "" }
    }"#;
    std::fs::write(paths.config_file(), raw).unwrap();

    let loaded = load_config(&paths).unwrap();
    assert_eq!(
        loaded.pdf_markdown.engine,
        crate::mineru::PdfMarkdownEngine::MineruAgent
    );
    let persisted = read_config_file(&paths);
    assert_eq!(
        persisted.pdf_markdown.engine,
        crate::mineru::PdfMarkdownEngine::MineruAgent
    );
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
fn active_uses_first_when_unset() {
    let mut cfg = LlmConfig::default();
    cfg.upsert(sample_profile("only"));
    let a = active_profile(&cfg).unwrap();
    assert_eq!(a.name, "only");
}

#[test]
fn task_binding_overrides_chat_model() {
    let mut cfg = LlmConfig::default();
    cfg.upsert(sample_profile("proxy"));
    cfg.active = Some("proxy".into());
    cfg.task_assignments.tldr = task_binding("proxy", Some("gpt-5.4"));
    cfg.task_assignments.quick_read = task_binding("proxy", Some("gpt-5.5"));
    cfg.task_assignments.translate = task_binding("proxy", None);

    let p1 = active_profile_for_task(&cfg, TaskKind::Tldr).unwrap();
    assert_eq!(p1.chat_model, "gpt-5.4");
    let p2 = active_profile_for_task(&cfg, TaskKind::QuickRead).unwrap();
    assert_eq!(p2.chat_model, "gpt-5.5");
    let p3 = active_profile_for_task(&cfg, TaskKind::Translate).unwrap();
    assert_eq!(p3.chat_model, "gpt-4o-mini");
}

#[test]
fn task_kind_as_str_matches_log_field_values() {
    assert_eq!(TaskKind::Tldr.as_str(), "tldr");
    assert_eq!(TaskKind::QuickRead.as_str(), "quick_read");
    assert_eq!(TaskKind::Translate.as_str(), "translate");
    assert_eq!(TaskKind::Tag.as_str(), "tag");
    assert_eq!(TaskKind::Link.as_str(), "link");
    assert_eq!(TaskKind::TopicSurvey.as_str(), "topic_survey");
    assert_eq!(TaskKind::Ask.as_str(), "ask");
    assert_eq!(TaskKind::LitReview.as_str(), "lit_review");
}

fn task_binding(profile: &str, model: Option<&str>) -> Option<TaskBinding> {
    Some(TaskBinding {
        profile: profile.into(),
        model: model.map(str::to_string),
    })
}

#[test]
fn task_binding_falls_back_when_no_binding() {
    let mut cfg = LlmConfig::default();
    cfg.upsert(sample_profile("a"));
    let p = active_profile_for_task(&cfg, TaskKind::Tag).unwrap();
    assert_eq!(p.name, "a");
}

#[test]
fn task_binding_uses_default_when_profile_missing() {
    let mut cfg = LlmConfig::default();
    cfg.upsert(sample_profile("a"));
    cfg.task_assignments.translate = task_binding("ghost", None);
    let p = active_profile_for_task(&cfg, TaskKind::Translate).unwrap();
    assert_eq!(p.name, "a");
}

#[test]
fn legacy_bare_string_binding_still_loads() {
    let raw = r#"{
        "profiles": [{"name":"fast","base_url":"u","api_key":"k","chat_model":"m","embed_model":null,"max_tokens":1024,"temperature":0.3}],
        "active": "fast",
        "task_assignments": { "tldr": "fast", "quick_read": null }
    }"#;
    let cfg: LlmConfig = serde_json::from_str(raw).unwrap();
    let b = cfg
        .task_assignments
        .tldr
        .as_ref()
        .expect("tldr should bind");
    assert_eq!(b.profile, "fast");
    assert!(b.model.is_none());
    let p = active_profile_for_task(&cfg, TaskKind::Tldr).unwrap();
    assert_eq!(p.chat_model, "m");
}

#[test]
fn active_profile_uses_first_when_active_name_missing() {
    let mut cfg = LlmConfig::default();
    cfg.upsert(sample_profile("deepseek-flash"));
    cfg.active = Some("deepseek-chat".into());
    let p = active_profile(&cfg).expect("stale active profile should use first");
    assert_eq!(p.name, "deepseek-flash");
}

#[test]
fn active_profile_errors_when_no_profiles_at_all() {
    let cfg = LlmConfig::default();
    let err = active_profile(&cfg).expect_err("empty config should error");
    assert!(err.to_string().contains("no LLM profile"));
}

#[test]
fn save_keeps_plaintext_when_keychain_silently_drops() {
    let (paths, dir) = tmp_paths();
    crate::secret::set_fault_mode(crate::secret::FaultMode::SilentDropOnPut);
    let mut cfg = LlmConfig::default();
    let mut p = sample_profile("dropguard");
    p.api_key = "sk-must-survive".into();
    cfg.upsert(p);
    save_config(&paths, &cfg).unwrap();
    crate::secret::set_fault_mode(crate::secret::FaultMode::None);

    let parsed = read_config_file(&paths);
    assert_eq!(parsed.profiles[0].api_key, "sk-must-survive");
    std::fs::remove_dir_all(&dir).ok();
}

fn read_config_file(paths: &LibraryPaths) -> LlmConfig {
    let raw = std::fs::read_to_string(paths.config_file()).unwrap();
    serde_json::from_str(&raw).unwrap()
}

#[test]
fn load_migration_keeps_plaintext_when_silent_drop() {
    let (paths, dir) = tmp_paths();
    let mut cfg = LlmConfig::default();
    let mut p = sample_profile("legacy");
    p.api_key = "sk-legacy-secret".into();
    cfg.upsert(p);
    write_config_file(&paths, &cfg);

    crate::secret::set_fault_mode(crate::secret::FaultMode::SilentDropOnPut);
    let _loaded = load_config(&paths).unwrap();
    crate::secret::set_fault_mode(crate::secret::FaultMode::None);

    let parsed = read_config_file(&paths);
    assert_eq!(parsed.profiles[0].api_key, "sk-legacy-secret");
    std::fs::remove_dir_all(&dir).ok();
}

fn write_config_file(paths: &LibraryPaths, cfg: &LlmConfig) {
    let body = serde_json::to_vec_pretty(cfg).unwrap();
    std::fs::write(paths.config_file(), body).unwrap();
}

#[test]
fn migration_clears_only_successfully_round_tripped_profiles() {
    let (paths, dir) = tmp_paths();
    let mut cfg = LlmConfig::default();
    let mut a = sample_profile("profile-a");
    a.api_key = "sk-a".into();
    let mut b = sample_profile("profile-b");
    b.api_key = "sk-b".into();
    cfg.upsert(a);
    cfg.upsert(b);
    write_config_file(&paths, &cfg);

    let _loaded = load_config(&paths).unwrap();
    let parsed = read_config_file(&paths);
    for p in &parsed.profiles {
        assert!(p.api_key.is_empty(), "{} should be sanitized", p.name);
    }
    std::fs::remove_dir_all(&dir).ok();
}
