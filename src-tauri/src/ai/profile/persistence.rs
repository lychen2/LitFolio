use anyhow::{anyhow, Context, Result};

use crate::secret;
use crate::storage::LibraryPaths;

use super::LlmConfig;

pub fn config_file(paths: &LibraryPaths) -> std::path::PathBuf {
    paths.config_file()
}

pub fn load_config(paths: &LibraryPaths) -> Result<LlmConfig> {
    let path = config_file(paths);
    if !path.exists() {
        return Ok(LlmConfig::default());
    }
    let raw = std::fs::read_to_string(&path).with_context(|| format!("read {}", path.display()))?;
    let mut cfg: LlmConfig =
        serde_json::from_str(&raw).with_context(|| format!("parse {}", path.display()))?;
    let migrated_names = hydrate_profile_keys(&mut cfg);
    let migrated_mineru = hydrate_mineru_token(&mut cfg);
    rewrite_sanitized_config(&path, &cfg, &migrated_names, migrated_mineru);
    Ok(cfg)
}

fn hydrate_profile_keys(cfg: &mut LlmConfig) -> Vec<String> {
    let mut migrated_names: Vec<String> = Vec::new();
    for profile in &mut cfg.profiles {
        if profile.api_key.is_empty() {
            read_keychain_key(profile);
            continue;
        }
        match migrate_secret(&secret::llm_account(&profile.name), &profile.api_key) {
            Ok(()) => migrated_names.push(profile.name.clone()),
            Err(e) => tracing::warn!(
                error = %e,
                profile = %profile.name,
                "keychain migration roundtrip failed; leaving api_key in JSON"
            ),
        }
    }
    migrated_names
}

fn read_keychain_key(profile: &mut super::LlmProfile) {
    match secret::get(&secret::llm_account(&profile.name)) {
        Ok(Some(key)) => profile.api_key = key,
        Ok(None) => {}
        Err(e) => tracing::warn!(
            error = %e,
            profile = %profile.name,
            "keychain read failed; profile will use whatever api_key is in JSON"
        ),
    }
}

fn hydrate_mineru_token(cfg: &mut LlmConfig) -> bool {
    if cfg.pdf_markdown.mineru_token.is_empty() {
        match secret::get(secret::MINERU_ACCOUNT) {
            Ok(Some(token)) => cfg.pdf_markdown.mineru_token = token,
            Ok(None) => {}
            Err(e) => tracing::warn!(
                error = %e,
                "keychain read failed; MinerU token will use whatever value is in JSON"
            ),
        }
        return false;
    }
    match migrate_secret(secret::MINERU_ACCOUNT, &cfg.pdf_markdown.mineru_token) {
        Ok(()) => true,
        Err(e) => {
            tracing::warn!(
                error = %e,
                "keychain put/verify failed; MinerU token will remain in JSON"
            );
            false
        }
    }
}

fn rewrite_sanitized_config(
    path: &std::path::Path,
    cfg: &LlmConfig,
    migrated_names: &[String],
    migrated_mineru: bool,
) {
    if migrated_names.is_empty() && !migrated_mineru {
        return;
    }
    let mut sanitized = cfg.clone();
    for p in &mut sanitized.profiles {
        if migrated_names.contains(&p.name) {
            p.api_key.clear();
        }
    }
    if migrated_mineru {
        sanitized.pdf_markdown.mineru_token.clear();
    }
    let Ok(body) = serde_json::to_vec_pretty(&sanitized) else {
        return;
    };
    if let Err(e) = std::fs::write(path, body) {
        tracing::warn!(error = %e, path = %path.display(), "rewriting sanitized config failed");
        return;
    }
    tracing::info!(
        profiles = migrated_names.len(),
        mineru = migrated_mineru,
        "migrated secrets from JSON to OS keychain"
    );
}

pub fn save_config(paths: &LibraryPaths, cfg: &LlmConfig) -> Result<()> {
    let path = config_file(paths);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let mut to_persist = cfg.clone();
    for profile in &mut to_persist.profiles {
        if profile.api_key.is_empty() {
            continue;
        }
        match migrate_secret(&secret::llm_account(&profile.name), &profile.api_key) {
            Ok(()) => profile.api_key.clear(),
            Err(e) => tracing::warn!(
                error = %e,
                profile = %profile.name,
                "keychain put/verify failed; api_key will be written to JSON as a fallback"
            ),
        }
    }
    if !to_persist.pdf_markdown.mineru_token.is_empty() {
        match migrate_secret(
            secret::MINERU_ACCOUNT,
            &to_persist.pdf_markdown.mineru_token,
        ) {
            Ok(()) => to_persist.pdf_markdown.mineru_token.clear(),
            Err(e) => tracing::warn!(
                error = %e,
                "keychain put/verify failed; MinerU token will be written to JSON as a fallback"
            ),
        }
    }
    let body = serde_json::to_vec_pretty(&to_persist)?;
    std::fs::write(&path, body)?;
    Ok(())
}

fn migrate_secret(account: &str, value: &str) -> Result<()> {
    secret::put(account, value).context("keychain put")?;
    match secret::get(account)? {
        Some(echoed) if echoed == value => Ok(()),
        Some(_) => Err(anyhow!("keychain readback did not match written value")),
        None => Err(anyhow!("keychain readback returned no value after put")),
    }
}
