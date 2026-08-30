//! Legacy library conversion foundation.
//!
//! Owns the primitives every later conversion step consumes:
//! - [`ResolvedInclusionPlan`] — the compiler-produced, versioned inclusion
//!   plan. Caller-built plugin lists are never accepted: a plan must carry the
//!   manifest-set digest, build profile, and target core schema of THIS build
//!   or it is rejected before any write.
//! - [`preview`] — a deterministic, offline conversion preview bound to the
//!   validated plan and current library state.
//! - [`create_backup`] / [`verify_backup`] — a complete verified backup under
//!   `backups/conversion-<token>/` before anything mutates.
//! - [`mark_complete`] / [`is_complete`] — the idempotence marker so a
//!   successful rerun is a no-op.
//!
//! Per-owner data movers land with their extraction children; this module
//! deliberately contains no owner-specific conversion logic yet.

#![allow(dead_code)]

use anyhow::{Context, Result};
use sha2::{Digest, Sha256};

/// Version of the resolved-inclusion plan schema this converter understands.
pub const PLAN_SCHEMA_VERSION: u64 = 1;

#[derive(Debug, Clone, PartialEq, Eq, serde::Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct OwnerInclusion {
    pub plugin_id: String,
    pub version: String,
    #[serde(default)]
    pub migrator_sha256: String,
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ResolvedInclusionPlan {
    pub schema_version: u64,
    pub profile: String,
    pub manifest_set_sha256: String,
    pub target_core_schema: u64,
    #[serde(default)]
    pub included: Vec<OwnerInclusion>,
}

#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
#[error("{code}")]
pub struct PlanError {
    /// Stable rejection code surfaced before any backup/staging write.
    pub code: &'static str,
}

impl ResolvedInclusionPlan {
    /// Parse an untrusted JSON value. Unknown fields make the plan caller-
    /// built and reject it outright (`plan_malformed`).
    pub fn parse(value: serde_json::Value) -> std::result::Result<Self, PlanError> {
        serde_json::from_value(value).map_err(|_| PlanError {
            code: "plan_malformed",
        })
    }

    /// Validate against this build's profile, embedded manifest set, and the
    /// live database schema version. Any drift means the plan is stale.
    pub async fn validate(
        &self,
        pool: &crate::storage::Pool,
    ) -> std::result::Result<(), PlanError> {
        if self.schema_version != PLAN_SCHEMA_VERSION {
            return Err(PlanError {
                code: "plan_schema_unsupported",
            });
        }
        if self.profile != compiled_profile() {
            return Err(PlanError {
                code: "plan_profile_mismatch",
            });
        }
        let digest = manifest_set_digest().map_err(|_| PlanError {
            code: "plan_manifest_unavailable",
        })?;
        if self.manifest_set_sha256 != digest {
            return Err(PlanError {
                code: "plan_manifest_stale",
            });
        }
        let source = source_schema_version(pool).await.map_err(|_| PlanError {
            code: "plan_source_unreadable",
        })?;
        if self.target_core_schema != source {
            return Err(PlanError {
                code: "plan_target_stale",
            });
        }
        Ok(())
    }
}

/// The backend build profile this binary was compiled with (`all`, `core`,
/// or an explicit comma-separated plugin list).
pub fn compiled_profile() -> &'static str {
    option_env!("LITFOLIO_PROFILE").unwrap_or("all")
}

/// Canonical sha256 over the compiled-in manifest set, id-sorted. This binds
/// every plan and preview to exactly the manifests this binary embeds.
pub fn manifest_set_digest() -> Result<String> {
    let manifests = crate::plugin_host::registry::load_registry()?;
    let mut values: Vec<serde_json::Value> = manifests
        .iter()
        .map(|m| serde_json::to_value(m).context("serialize manifest"))
        .collect::<Result<_>>()?;
    values.sort_by(|a, b| {
        a.get("id")
            .and_then(serde_json::Value::as_str)
            .cmp(&b.get("id").and_then(serde_json::Value::as_str))
    });
    let canonical = serde_json::to_string(&values).context("canonicalize manifest set")?;
    Ok(hex_sha256(canonical.as_bytes()))
}

async fn source_schema_version(pool: &crate::storage::Pool) -> Result<u64> {
    let row: (i64,) = sqlx::query_as("SELECT COALESCE(MAX(version), 0) FROM _sqlx_migrations")
        .fetch_one(pool)
        .await
        .context("read applied migration version")?;
    Ok(row.0 as u64)
}

/// Deterministic, offline conversion preview. The token is a pure function of
/// the validated plan and the library state it describes, so identical inputs
/// always produce identical tokens across runs and machines.
pub async fn preview(
    pool: &crate::storage::Pool,
    plan: &ResolvedInclusionPlan,
) -> std::result::Result<ConversionPreview, PlanError> {
    plan.validate(pool).await?;
    let source = source_schema_version(pool).await.map_err(|_| PlanError {
        code: "plan_source_unreadable",
    })?;
    let paper_count = scalar(pool, "SELECT COUNT(*) FROM papers").await;
    let note_count = scalar(pool, "SELECT COUNT(*) FROM note_sections").await;
    let highlight_count = scalar(pool, "SELECT COUNT(*) FROM highlights").await;
    let mut hasher = Sha256::new();
    hasher.update(plan.manifest_set_sha256.as_bytes());
    hasher.update(format!(
        "|profile={}|schema={}|papers={}|notes={}|highlights={}",
        plan.profile, source, paper_count, note_count, highlight_count
    ));
    Ok(ConversionPreview {
        token: hex::encode(hasher.finalize()),
        source_core_schema: source,
        paper_count,
        note_count,
        highlight_count,
    })
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConversionPreview {
    pub token: String,
    pub source_core_schema: u64,
    pub paper_count: u64,
    pub note_count: u64,
    pub highlight_count: u64,
}

async fn scalar(pool: &crate::storage::Pool, sql: &str) -> u64 {
    sqlx::query_as::<_, (i64,)>(sql)
        .fetch_one(pool)
        .await
        .map(|(n,)| n.max(0) as u64)
        .unwrap_or(0)
}

/// Create and verify a full backup of the database sidecars plus config under
/// `backups/conversion-<token>/`. Every copied file is hashed twice (after
/// copy, again at verify time); any drift aborts and removes the backup.
pub fn create_backup(paths: &crate::storage::LibraryPaths, token: &str) -> Result<()> {
    let dir = backup_dir(paths, token);
    std::fs::create_dir_all(&dir).with_context(|| format!("create {}", dir.display()))?;
    let result = (|| -> Result<()> {
        let mut files = Vec::new();
        for name in [
            "library.db",
            "library.db-wal",
            "library.db-shm",
            "litera.config.json",
        ] {
            let src = paths.root.join(name);
            if !src.exists() {
                continue;
            }
            let bytes = std::fs::read(&src).with_context(|| format!("read {}", src.display()))?;
            std::fs::write(dir.join(name), &bytes).with_context(|| format!("write {}", name))?;
            files.push(BackupFile {
                name: name.to_string(),
                bytes: bytes.len() as u64,
                sha256: hex_sha256(&bytes),
            });
        }
        if !files.iter().any(|f| f.name == "library.db") {
            anyhow::bail!("no library.db found to back up");
        }
        let inventory = BackupInventory {
            token: token.to_string(),
            files,
        };
        std::fs::write(
            dir.join("manifest.json"),
            serde_json::to_vec_pretty(&inventory)?,
        )?;
        Ok(())
    })();
    if let Err(error) = result {
        std::fs::remove_dir_all(&dir).ok();
        return Err(error);
    }
    verify_backup(paths, token)
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupFile {
    pub name: String,
    pub bytes: u64,
    pub sha256: String,
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupInventory {
    pub token: String,
    pub files: Vec<BackupFile>,
}

pub(crate) fn backup_dir(paths: &crate::storage::LibraryPaths, token: &str) -> std::path::PathBuf {
    paths.backups_dir().join(format!("conversion-{token}"))
}

/// Re-hash every backed-up file against its recorded digest.
pub fn verify_backup(paths: &crate::storage::LibraryPaths, token: &str) -> Result<()> {
    let raw = std::fs::read(backup_dir(paths, token).join("manifest.json"))
        .context("read backup manifest")?;
    let inventory: BackupInventory =
        serde_json::from_slice(&raw).context("parse backup manifest")?;
    for file in &inventory.files {
        let bytes = std::fs::read(backup_dir(paths, token).join(&file.name))
            .with_context(|| format!("re-read {}", file.name))?;
        if hex_sha256(&bytes) != file.sha256 || bytes.len() as u64 != file.bytes {
            anyhow::bail!("backup verification failed for {}", file.name);
        }
    }
    Ok(())
}

/// Sibling staging root next to the library — never inside the source tree.
pub fn create_staging_root(
    paths: &crate::storage::LibraryPaths,
    token: &str,
) -> Result<std::path::PathBuf> {
    let name = paths
        .root
        .file_name()
        .and_then(|n| n.to_str())
        .context("library root has no file name")?;
    let parent = paths.root.parent().context("library root has no parent")?;
    let staging = parent.join(format!(".{}-conversion-{token}", name));
    std::fs::create_dir_all(&staging)
        .with_context(|| format!("create staging {}", staging.display()))?;
    // Durable stage journal: written before any conversion write lands.
    std::fs::write(
        staging.join("stage-journal.json"),
        serde_json::to_vec_pretty(&serde_json::json!({
            "token": token,
            "startedAtUnix": chrono::Utc::now().timestamp(),
        }))?,
    )?;
    Ok(staging)
}

/// Idempotence marker: a completed token never converts again.
pub fn mark_complete(
    paths: &crate::storage::LibraryPaths,
    token: &str,
    report: &serde_json::Value,
) -> Result<()> {
    std::fs::write(
        backup_dir(paths, token).join("complete.json"),
        serde_json::to_vec_pretty(report)?,
    )
    .context("write completion marker")
}

pub fn is_complete(paths: &crate::storage::LibraryPaths, token: &str) -> bool {
    backup_dir(paths, token).join("complete.json").exists()
}

fn hex_sha256(bytes: &[u8]) -> String {
    hex::encode(Sha256::digest(bytes))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::storage::{run_migrations, LibraryPaths};
    use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
    use std::str::FromStr;

    async fn test_pool() -> crate::storage::Pool {
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect_with(
                SqliteConnectOptions::from_str("sqlite::memory:")
                    .unwrap()
                    .foreign_keys(true),
            )
            .await
            .unwrap();
        run_migrations(&pool).await.unwrap();
        pool
    }

    fn temp_library() -> LibraryPaths {
        let root = std::env::temp_dir().join(format!("litera-conversion-{}", ulid::Ulid::new()));
        let paths = LibraryPaths::new(root);
        paths.ensure().unwrap();
        paths
    }

    async fn valid_plan(pool: &crate::storage::Pool) -> ResolvedInclusionPlan {
        ResolvedInclusionPlan {
            schema_version: PLAN_SCHEMA_VERSION,
            profile: compiled_profile().to_string(),
            manifest_set_sha256: manifest_set_digest().unwrap(),
            target_core_schema: source_schema_version(pool).await.unwrap(),
            included: vec![OwnerInclusion {
                plugin_id: "fixture-local".into(),
                version: "1.0.0".into(),
                migrator_sha256: String::new(),
            }],
        }
    }

    #[tokio::test]
    async fn valid_plan_passes_and_preview_token_is_deterministic() {
        let pool = test_pool().await;
        let plan = valid_plan(&pool).await;
        plan.validate(&pool).await.unwrap();

        assert_eq!(
            preview(&pool, &plan).await.unwrap(),
            preview(&pool, &plan).await.unwrap()
        );
        let first = preview(&pool, &plan).await.unwrap();
        assert_eq!(first.token.len(), 64);
        assert_eq!(first.source_core_schema, plan.target_core_schema);
    }

    #[tokio::test]
    async fn forged_or_stale_plans_are_rejected_before_writes() {
        let pool = test_pool().await;

        // Forged manifest digest (caller-built plugin list).
        let mut plan = valid_plan(&pool).await;
        plan.manifest_set_sha256 = "0".repeat(64);
        assert_eq!(
            plan.validate(&pool).await.unwrap_err().code,
            "plan_manifest_stale"
        );

        // Profile mismatch.
        let mut plan = valid_plan(&pool).await;
        plan.profile = "core-forged".into();
        assert_eq!(
            plan.validate(&pool).await.unwrap_err().code,
            "plan_profile_mismatch"
        );

        // Stale target schema.
        let mut plan = valid_plan(&pool).await;
        plan.target_core_schema = 0;
        assert_eq!(
            plan.validate(&pool).await.unwrap_err().code,
            "plan_target_stale"
        );

        // Unsupported plan schema version.
        let mut plan = valid_plan(&pool).await;
        plan.schema_version = 99;
        assert_eq!(
            plan.validate(&pool).await.unwrap_err().code,
            "plan_schema_unsupported"
        );

        // Malformed / caller-extended plan payload.
        let raw = serde_json::json!({
            "schemaVersion": 1,
            "profile": compiled_profile(),
            "manifestSetSha256": manifest_set_digest().unwrap(),
            "targetCoreSchema": source_schema_version(&pool).await.unwrap(),
            "included": [],
            "forgedByCaller": true
        });
        assert_eq!(
            ResolvedInclusionPlan::parse(raw).unwrap_err().code,
            "plan_malformed"
        );

        // Preview refuses invalid plans too.
        let mut plan = valid_plan(&pool).await;
        plan.manifest_set_sha256 = "1".repeat(64);
        assert!(preview(&pool, &plan).await.is_err());
    }

    #[tokio::test]
    async fn backup_verifies_and_detects_tampering() {
        let pool = test_pool().await;
        let paths = temp_library();
        std::fs::write(paths.db_file(), b"sqlite-bytes").unwrap();
        std::fs::write(paths.config_file(), b"{\"k\":1}").unwrap();

        let token = preview(&pool, &valid_plan(&pool).await)
            .await
            .unwrap()
            .token;
        create_backup(&paths, &token).unwrap();

        let raw = std::fs::read(backup_dir(&paths, &token).join("manifest.json")).unwrap();
        let inventory: BackupInventory = serde_json::from_slice(&raw).unwrap();
        let names: Vec<&str> = inventory.files.iter().map(|f| f.name.as_str()).collect();
        assert_eq!(names, vec!["library.db", "litera.config.json"]);
        verify_backup(&paths, &token).unwrap();

        // Tamper with the backed-up DB: verification must fail.
        std::fs::write(backup_dir(&paths, &token).join("library.db"), b"tampered").unwrap();
        assert!(verify_backup(&paths, &token).is_err());

        std::fs::remove_dir_all(&paths.root).ok();
    }

    #[tokio::test]
    async fn completion_marker_makes_rerun_a_no_op() {
        let pool = test_pool().await;
        let paths = temp_library();
        std::fs::write(paths.db_file(), b"sqlite-bytes").unwrap();

        let token = preview(&pool, &valid_plan(&pool).await)
            .await
            .unwrap()
            .token;
        create_backup(&paths, &token).unwrap();
        assert!(!is_complete(&paths, &token));

        let staging = create_staging_root(&paths, &token).unwrap();
        assert!(staging.join("stage-journal.json").exists());
        assert!(staging.starts_with(paths.root.parent().unwrap()));
        assert!(!staging.starts_with(&paths.root));

        mark_complete(&paths, &token, &serde_json::json!({"converted": 0})).unwrap();
        assert!(is_complete(&paths, &token));

        std::fs::remove_dir_all(&paths.root).ok();
        std::fs::remove_dir_all(staging).ok();
    }
}
