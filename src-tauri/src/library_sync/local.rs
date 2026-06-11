use anyhow::{anyhow, Context, Result};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashSet;
use std::path::{Component, Path, PathBuf};

pub const MANIFEST_FILE_NAME: &str = ".litera-sync-manifest.json";
const SYNC_MANIFEST_VERSION: u8 = 1;
const SHA256_HEX_LEN: usize = 64;
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ManifestFile {
    pub path: String,
    pub size: u64,
    pub sha256: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncManifest {
    pub version: u8,
    pub generated_at: String,
    pub files: Vec<ManifestFile>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncConnectionResult {
    pub remote_root: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncReport {
    pub remote_root: String,
    pub file_count: usize,
    pub total_bytes: u64,
    pub skipped_count: usize,
    pub skipped_bytes: u64,
    pub restart_required: bool,
}

#[derive(Debug, Clone, Copy, Default)]
pub struct SyncTransferStats {
    pub file_count: usize,
    pub total_bytes: u64,
    pub skipped_count: usize,
    pub skipped_bytes: u64,
}

pub struct SnapshotDir {
    path: PathBuf,
}

impl SnapshotDir {
    pub fn new(prefix: &str) -> Result<Self> {
        let path = std::env::temp_dir().join(format!("{prefix}-{}", ulid::Ulid::new()));
        std::fs::create_dir_all(&path).with_context(|| format!("create {}", path.display()))?;
        Ok(Self { path })
    }

    pub fn path(&self) -> &Path {
        &self.path
    }
}

impl Drop for SnapshotDir {
    fn drop(&mut self) {
        std::fs::remove_dir_all(&self.path).ok();
    }
}

pub struct Snapshot {
    dir: SnapshotDir,
    pub manifest: SyncManifest,
}

impl Snapshot {
    pub fn new_empty(prefix: &str, manifest: SyncManifest) -> Result<Self> {
        Ok(Self {
            dir: SnapshotDir::new(prefix)?,
            manifest,
        })
    }

    pub fn root(&self) -> &Path {
        self.dir.path()
    }

    pub fn report_with_stats(
        &self,
        remote_root: String,
        stats: SyncTransferStats,
        restart_required: bool,
    ) -> SyncReport {
        SyncReport {
            remote_root,
            file_count: stats.file_count,
            total_bytes: stats.total_bytes,
            skipped_count: stats.skipped_count,
            skipped_bytes: stats.skipped_bytes,
            restart_required,
        }
    }
}

#[cfg(test)]
pub fn create_snapshot(root: &Path) -> Result<Snapshot> {
    create_snapshot_with_filter(root, None)
}

pub fn create_snapshot_for_papers(
    root: &Path,
    valid_paper_ids: &HashSet<String>,
) -> Result<Snapshot> {
    create_snapshot_with_filter(root, Some(valid_paper_ids))
}

fn create_snapshot_with_filter(
    root: &Path,
    valid_paper_ids: Option<&HashSet<String>>,
) -> Result<Snapshot> {
    let mut files = Vec::new();
    let snapshot = Snapshot::new_empty("litera-sync-snapshot", empty_manifest())?;
    copy_tree(root, root, snapshot.root(), &mut files, valid_paper_ids)?;
    Ok(Snapshot {
        dir: snapshot.dir,
        manifest: SyncManifest {
            version: 1,
            generated_at: Utc::now().to_rfc3339(),
            files,
        },
    })
}

pub fn manifest_bytes(manifest: &SyncManifest) -> Result<Vec<u8>> {
    serde_json::to_vec_pretty(manifest).context("serialize sync manifest")
}

pub fn manifest_from_bytes(bytes: &[u8]) -> Result<SyncManifest> {
    let manifest: SyncManifest = serde_json::from_slice(bytes).context("parse sync manifest")?;
    validate_manifest(&manifest)?;
    Ok(manifest)
}

pub fn copy_snapshot_file(
    src_snapshot: &Snapshot,
    dst_snapshot: &Snapshot,
    file: &ManifestFile,
) -> Result<()> {
    validate_manifest_file(file)?;
    let source = src_snapshot.root().join(&file.path);
    let target = dst_snapshot.root().join(&file.path);
    if let Some(parent) = target.parent() {
        std::fs::create_dir_all(parent).with_context(|| format!("create {}", parent.display()))?;
    }
    std::fs::copy(&source, &target)
        .with_context(|| format!("copy {} -> {}", source.display(), target.display()))?;
    Ok(())
}

pub fn stage_downloaded_file(snapshot: &Snapshot, file: &ManifestFile, bytes: &[u8]) -> Result<()> {
    validate_manifest_file(file)?;
    if bytes.len() as u64 != file.size {
        return Err(anyhow!(
            "size mismatch for {}: expected {}, got {}",
            file.path,
            file.size,
            bytes.len()
        ));
    }
    let actual = hash_hex(bytes);
    if actual != file.sha256 {
        return Err(anyhow!(
            "checksum mismatch for {}: expected {}, got {}",
            file.path,
            file.sha256,
            actual
        ));
    }
    let target = snapshot.root().join(&file.path);
    if let Some(parent) = target.parent() {
        std::fs::create_dir_all(parent).with_context(|| format!("create {}", parent.display()))?;
    }
    std::fs::write(&target, bytes).with_context(|| format!("write {}", target.display()))?;
    Ok(())
}

pub fn replace_library_root(target_root: &Path, snapshot_root: &Path) -> Result<()> {
    ensure_root(target_root)?;
    let staging_root = unique_sibling_path(target_root, "incoming")?;
    let backup_staging_root = unique_sibling_path(target_root, "pre-pull-backup")?;
    let rollback_root = unique_sibling_path(target_root, "rollback")?;

    let result = prepare_replacement(
        target_root,
        snapshot_root,
        &staging_root,
        &backup_staging_root,
    )
    .and_then(|()| activate_replacement(target_root, &staging_root, &rollback_root));

    if result.is_err() {
        std::fs::remove_dir_all(&staging_root).ok();
        std::fs::remove_dir_all(&backup_staging_root).ok();
    }

    result
}

fn empty_manifest() -> SyncManifest {
    SyncManifest {
        version: SYNC_MANIFEST_VERSION,
        generated_at: String::new(),
        files: Vec::new(),
    }
}

fn validate_manifest(manifest: &SyncManifest) -> Result<()> {
    if manifest.version != SYNC_MANIFEST_VERSION {
        return Err(anyhow!(
            "unsupported sync manifest version {}",
            manifest.version
        ));
    }
    let mut seen = HashSet::new();
    for file in &manifest.files {
        validate_manifest_file(file)?;
        if !seen.insert(file.path.as_str()) {
            return Err(anyhow!("duplicate sync manifest path {}", file.path));
        }
    }
    Ok(())
}

fn validate_manifest_file(file: &ManifestFile) -> Result<()> {
    validate_manifest_path(&file.path)?;
    if !is_sha256_hex(&file.sha256) {
        return Err(anyhow!("invalid sha256 for {}", file.path));
    }
    Ok(())
}

fn validate_manifest_path(path: &str) -> Result<()> {
    if path.is_empty() || path.contains('\\') {
        return Err(anyhow!("invalid sync manifest path {}", path));
    }
    let parsed = Path::new(path);
    if parsed.is_absolute() {
        return Err(anyhow!("sync manifest path must be relative: {}", path));
    }
    for component in parsed.components() {
        if !matches!(component, Component::Normal(_)) {
            return Err(anyhow!("unsafe sync manifest path {}", path));
        }
    }
    Ok(())
}

fn is_sha256_hex(value: &str) -> bool {
    value.len() == SHA256_HEX_LEN && value.bytes().all(|b| b.is_ascii_hexdigit())
}

fn ensure_root(root: &Path) -> Result<()> {
    std::fs::create_dir_all(root).with_context(|| format!("create {}", root.display()))?;
    Ok(())
}

fn unique_sibling_path(target_root: &Path, label: &str) -> Result<PathBuf> {
    let parent = target_root
        .parent()
        .ok_or_else(|| anyhow!("library root has no parent: {}", target_root.display()))?;
    let name = target_root.file_name().ok_or_else(|| {
        anyhow!(
            "library root has no directory name: {}",
            target_root.display()
        )
    })?;
    Ok(parent.join(format!(
        ".{}-{label}-{}",
        name.to_string_lossy(),
        ulid::Ulid::new()
    )))
}

fn prepare_replacement(
    target_root: &Path,
    snapshot_root: &Path,
    staging_root: &Path,
    backup_staging_root: &Path,
) -> Result<()> {
    std::fs::create_dir_all(staging_root)
        .with_context(|| format!("create {}", staging_root.display()))?;
    copy_tree_plain(target_root, target_root, backup_staging_root)?;
    copy_tree_plain(snapshot_root, snapshot_root, staging_root)?;
    move_backup_into_staging(backup_staging_root, staging_root)
}

fn move_backup_into_staging(backup_staging_root: &Path, staging_root: &Path) -> Result<()> {
    let backup_root = staging_root
        .join("backups")
        .join(pre_pull_backup_dir_name());
    if let Some(parent) = backup_root.parent() {
        std::fs::create_dir_all(parent).with_context(|| format!("create {}", parent.display()))?;
    }
    std::fs::rename(backup_staging_root, &backup_root).with_context(|| {
        format!(
            "move pre-pull backup {} -> {}",
            backup_staging_root.display(),
            backup_root.display()
        )
    })?;
    Ok(())
}

fn pre_pull_backup_dir_name() -> String {
    format!(
        "pre-pull-{}-{}",
        Utc::now().format("%Y%m%dT%H%M%SZ"),
        ulid::Ulid::new()
    )
}

fn activate_replacement(
    target_root: &Path,
    staging_root: &Path,
    rollback_root: &Path,
) -> Result<()> {
    std::fs::rename(target_root, rollback_root).with_context(|| {
        format!(
            "move current library {} -> {}",
            target_root.display(),
            rollback_root.display()
        )
    })?;

    match std::fs::rename(staging_root, target_root) {
        Ok(()) => {
            std::fs::remove_dir_all(rollback_root).ok();
            Ok(())
        }
        Err(error) => {
            restore_rollback(target_root, rollback_root)?;
            Err(error).with_context(|| {
                format!(
                    "activate synced library {} -> {}",
                    staging_root.display(),
                    target_root.display()
                )
            })
        }
    }
}

fn restore_rollback(target_root: &Path, rollback_root: &Path) -> Result<()> {
    std::fs::rename(rollback_root, target_root).with_context(|| {
        format!(
            "restore library rollback {} -> {}",
            rollback_root.display(),
            target_root.display()
        )
    })?;
    Ok(())
}

fn copy_tree(
    src_root: &Path,
    current: &Path,
    dst_root: &Path,
    files: &mut Vec<ManifestFile>,
    valid_paper_ids: Option<&HashSet<String>>,
) -> Result<()> {
    for entry in
        std::fs::read_dir(current).with_context(|| format!("read {}", current.display()))?
    {
        let entry = entry?;
        let path = entry.path();
        let rel = path
            .strip_prefix(src_root)
            .context("strip snapshot prefix")?;
        if should_skip(rel, valid_paper_ids) {
            continue;
        }
        let file_type = entry
            .file_type()
            .with_context(|| format!("read file type {}", path.display()))?;
        if file_type.is_symlink() {
            return Err(anyhow!(
                "sync does not support symlinks: {}",
                path.display()
            ));
        }
        if file_type.is_dir() {
            copy_tree(src_root, &path, dst_root, files, valid_paper_ids)?;
            continue;
        }
        if !file_type.is_file() {
            return Err(anyhow!("sync only supports files: {}", path.display()));
        }
        copy_file(src_root, &path, dst_root, files)?;
    }
    Ok(())
}

fn copy_tree_plain(src_root: &Path, current: &Path, dst_root: &Path) -> Result<()> {
    for entry in
        std::fs::read_dir(current).with_context(|| format!("read {}", current.display()))?
    {
        let entry = entry?;
        let path = entry.path();
        let rel = path.strip_prefix(src_root).context("strip copy prefix")?;
        let target = dst_root.join(rel);
        if path.is_dir() {
            std::fs::create_dir_all(&target)
                .with_context(|| format!("create {}", target.display()))?;
            copy_tree_plain(src_root, &path, dst_root)?;
            continue;
        }
        if let Some(parent) = target.parent() {
            std::fs::create_dir_all(parent)
                .with_context(|| format!("create {}", parent.display()))?;
        }
        std::fs::copy(&path, &target)
            .with_context(|| format!("copy {} -> {}", path.display(), target.display()))?;
    }
    Ok(())
}

fn copy_file(
    src_root: &Path,
    path: &Path,
    dst_root: &Path,
    files: &mut Vec<ManifestFile>,
) -> Result<()> {
    let rel = path.strip_prefix(src_root).context("strip file prefix")?;
    let target = dst_root.join(rel);
    if let Some(parent) = target.parent() {
        std::fs::create_dir_all(parent).with_context(|| format!("create {}", parent.display()))?;
    }
    let bytes = std::fs::read(path).with_context(|| format!("read {}", path.display()))?;
    std::fs::write(&target, &bytes).with_context(|| format!("write {}", target.display()))?;
    files.push(ManifestFile {
        path: rel.to_string_lossy().replace('\\', "/"),
        size: bytes.len() as u64,
        sha256: hash_hex(&bytes),
    });
    Ok(())
}

fn should_skip(rel: &Path, valid_paper_ids: Option<&HashSet<String>>) -> bool {
    let first_component = rel
        .components()
        .next()
        .and_then(|component| match component {
            Component::Normal(value) => value.to_str(),
            _ => None,
        });
    if matches!(first_component, Some("backups" | "vectors")) {
        return true;
    }
    if is_orphan_paper_path(rel, valid_paper_ids) {
        return true;
    }
    matches!(
        rel.file_name().and_then(|name| name.to_str()),
        Some("library.db-wal" | "library.db-shm" | MANIFEST_FILE_NAME)
    )
}

fn is_orphan_paper_path(rel: &Path, valid_paper_ids: Option<&HashSet<String>>) -> bool {
    let Some(valid_paper_ids) = valid_paper_ids else {
        return false;
    };
    let mut components = rel.components();
    if !matches!(
        components.next(),
        Some(Component::Normal(component)) if component == "papers"
    ) {
        return false;
    }
    let Some(Component::Normal(paper_id)) = components.next() else {
        return false;
    };
    paper_id
        .to_str()
        .is_some_and(|paper_id| !valid_paper_ids.contains(paper_id))
}

fn hash_hex(bytes: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    hex::encode(hasher.finalize())
}

#[cfg(test)]
mod tests;
