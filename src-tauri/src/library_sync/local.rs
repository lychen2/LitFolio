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
    pub restart_required: bool,
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

    pub fn report(&self, remote_root: String, restart_required: bool) -> SyncReport {
        SyncReport {
            remote_root,
            file_count: self.manifest.files.len(),
            total_bytes: self.manifest.files.iter().map(|file| file.size).sum(),
            restart_required,
        }
    }
}

pub fn create_snapshot(root: &Path) -> Result<Snapshot> {
    let mut files = Vec::new();
    let snapshot = Snapshot::new_empty("litera-sync-snapshot", empty_manifest())?;
    copy_tree(root, root, snapshot.root(), &mut files)?;
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
    clear_directory(target_root)?;
    copy_tree_plain(snapshot_root, snapshot_root, target_root)
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

fn clear_directory(root: &Path) -> Result<()> {
    for entry in std::fs::read_dir(root).with_context(|| format!("read {}", root.display()))? {
        let entry = entry?;
        let path = entry.path();
        if path.is_dir() {
            std::fs::remove_dir_all(&path).with_context(|| format!("remove {}", path.display()))?;
        } else {
            std::fs::remove_file(&path).with_context(|| format!("remove {}", path.display()))?;
        }
    }
    Ok(())
}

fn copy_tree(
    src_root: &Path,
    current: &Path,
    dst_root: &Path,
    files: &mut Vec<ManifestFile>,
) -> Result<()> {
    for entry in
        std::fs::read_dir(current).with_context(|| format!("read {}", current.display()))?
    {
        let entry = entry?;
        let path = entry.path();
        let rel = path
            .strip_prefix(src_root)
            .context("strip snapshot prefix")?;
        if should_skip(rel) {
            continue;
        }
        if path.is_dir() {
            copy_tree(src_root, &path, dst_root, files)?;
            continue;
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

fn should_skip(rel: &Path) -> bool {
    matches!(
        rel.file_name().and_then(|name| name.to_str()),
        Some("library.db-wal" | "library.db-shm" | MANIFEST_FILE_NAME)
    )
}

fn hash_hex(bytes: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    hex::encode(hasher.finalize())
}

#[cfg(test)]
mod tests;
