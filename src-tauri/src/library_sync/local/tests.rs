use super::*;
use std::path::{Path, PathBuf};

#[test]
fn snapshot_skips_sqlite_sidecars() {
    let root = temp_root();
    std::fs::write(root.join("library.db"), b"db").unwrap();
    std::fs::write(root.join("library.db-wal"), b"wal").unwrap();
    std::fs::write(root.join("papers.txt"), b"note").unwrap();

    let snapshot = create_snapshot(&root).unwrap();

    assert_eq!(snapshot.manifest.files.len(), 2);
    std::fs::remove_dir_all(&root).ok();
}

#[test]
fn snapshot_skips_local_derived_dirs() {
    let root = temp_root();
    std::fs::write(root.join("library.db"), b"db").unwrap();
    std::fs::create_dir_all(root.join("backups")).unwrap();
    std::fs::write(root.join("backups/old.db"), b"backup").unwrap();
    std::fs::create_dir_all(root.join("vectors")).unwrap();
    std::fs::write(root.join("vectors/cache.bin"), b"cache").unwrap();

    let snapshot = create_snapshot(&root).unwrap();

    assert_eq!(manifest_paths(&snapshot), vec!["library.db"]);
    std::fs::remove_dir_all(&root).ok();
}

#[test]
fn snapshot_skips_paper_dirs_missing_from_database_filter() {
    let root = temp_root();
    std::fs::create_dir_all(root.join("papers/keep")).unwrap();
    std::fs::write(root.join("papers/keep/original.pdf"), b"%PDF-keep").unwrap();
    std::fs::create_dir_all(root.join("papers/orphan")).unwrap();
    std::fs::write(root.join("papers/orphan/original.pdf"), b"%PDF-orphan").unwrap();
    let valid_papers = HashSet::from(["keep".to_string()]);

    let snapshot = create_snapshot_for_papers(&root, &valid_papers).unwrap();

    assert_eq!(manifest_paths(&snapshot), vec!["papers/keep/original.pdf"]);
    std::fs::remove_dir_all(&root).ok();
}

#[test]
fn manifest_roundtrip() {
    let manifest = SyncManifest {
        version: SYNC_MANIFEST_VERSION,
        generated_at: "now".into(),
        files: vec![manifest_file("papers/a/original.pdf", b"pdf")],
    };

    let bytes = manifest_bytes(&manifest).unwrap();
    let parsed = manifest_from_bytes(&bytes).unwrap();

    assert_eq!(parsed.files[0].path, manifest.files[0].path);
}

#[test]
fn manifest_rejects_path_traversal() {
    let manifest = SyncManifest {
        version: SYNC_MANIFEST_VERSION,
        generated_at: "now".into(),
        files: vec![manifest_file("../library.db", b"db")],
    };

    let err = manifest_from_bytes(&manifest_bytes(&manifest).unwrap()).unwrap_err();

    assert!(err.to_string().contains("unsafe sync manifest path"));
}

#[test]
fn manifest_rejects_duplicate_paths() {
    let file = manifest_file("papers/a.pdf", b"pdf");
    let manifest = SyncManifest {
        version: SYNC_MANIFEST_VERSION,
        generated_at: "now".into(),
        files: vec![file.clone(), file],
    };

    let err = manifest_from_bytes(&manifest_bytes(&manifest).unwrap()).unwrap_err();

    assert!(err.to_string().contains("duplicate sync manifest path"));
}

#[test]
fn manifest_rejects_malformed_json() {
    let err = manifest_from_bytes(br#"{"version":1,"files":["#).unwrap_err();

    assert!(err.to_string().contains("parse sync manifest"));
}

#[test]
fn manifest_rejects_unsupported_version() {
    let manifest = SyncManifest {
        version: SYNC_MANIFEST_VERSION + 1,
        generated_at: "now".into(),
        files: Vec::new(),
    };

    let err = manifest_from_bytes(&manifest_bytes(&manifest).unwrap()).unwrap_err();

    assert!(err
        .to_string()
        .contains("unsupported sync manifest version"));
}

#[test]
fn manifest_rejects_invalid_hash_format() {
    let manifest = SyncManifest {
        version: SYNC_MANIFEST_VERSION,
        generated_at: "now".into(),
        files: vec![ManifestFile {
            path: "papers/a.pdf".into(),
            size: 3,
            sha256: "not-a-sha256".into(),
        }],
    };

    let err = manifest_from_bytes(&manifest_bytes(&manifest).unwrap()).unwrap_err();

    assert!(err.to_string().contains("invalid sha256"));
}

#[test]
fn stage_downloaded_file_rejects_size_mismatch() {
    let snapshot = Snapshot::new_empty("litera-sync-test", empty_manifest()).unwrap();
    let file = manifest_file("papers/a.pdf", b"pdf");

    let err = stage_downloaded_file(&snapshot, &file, b"changed").unwrap_err();

    assert!(err.to_string().contains("size mismatch"));
}

#[test]
fn stage_downloaded_file_rejects_unsafe_path() {
    let snapshot = Snapshot::new_empty("litera-sync-test", empty_manifest()).unwrap();
    let file = manifest_file("../escape.txt", b"out");

    let err = stage_downloaded_file(&snapshot, &file, b"out").unwrap_err();

    assert!(err.to_string().contains("unsafe sync manifest path"));
}

#[test]
fn stage_downloaded_file_rejects_checksum_mismatch() {
    let snapshot = Snapshot::new_empty("litera-sync-test", empty_manifest()).unwrap();
    let mut file = manifest_file("papers/a.pdf", b"pdf");
    file.size = 3;

    let err = stage_downloaded_file(&snapshot, &file, b"bad").unwrap_err();

    assert!(err.to_string().contains("checksum mismatch"));
}

#[test]
fn replace_library_root_preserves_existing_library_when_snapshot_copy_fails() {
    let root = temp_root();
    std::fs::create_dir_all(root.join("papers/local")).unwrap();
    std::fs::write(root.join("library.db"), b"local-db").unwrap();
    std::fs::write(root.join("papers/local/original.pdf"), b"local-pdf").unwrap();
    let missing_snapshot =
        std::env::temp_dir().join(format!("litera-missing-{}", ulid::Ulid::new()));

    let err = replace_library_root(&root, &missing_snapshot).unwrap_err();

    assert!(err.to_string().contains("read"));
    assert_eq!(std::fs::read(root.join("library.db")).unwrap(), b"local-db");
    assert_eq!(
        std::fs::read(root.join("papers/local/original.pdf")).unwrap(),
        b"local-pdf"
    );
    std::fs::remove_dir_all(&root).ok();
}

#[test]
fn replace_library_root_stores_pre_pull_backup_on_success() {
    let root = temp_root();
    std::fs::create_dir_all(root.join("papers/local")).unwrap();
    std::fs::write(root.join("library.db"), b"local-db").unwrap();
    std::fs::write(root.join("papers/local/original.pdf"), b"local-pdf").unwrap();
    let snapshot = temp_root();
    std::fs::write(snapshot.join("library.db"), b"remote-db").unwrap();

    replace_library_root(&root, &snapshot).unwrap();

    assert_eq!(
        std::fs::read(root.join("library.db")).unwrap(),
        b"remote-db"
    );
    let backups = pre_pull_backups(&root);
    assert_eq!(backups.len(), 1);
    let backup = &backups[0];
    assert_eq!(
        std::fs::read(backup.join("library.db")).unwrap(),
        b"local-db"
    );
    assert_eq!(
        std::fs::read(backup.join("papers/local/original.pdf")).unwrap(),
        b"local-pdf"
    );
    std::fs::remove_dir_all(&root).ok();
    std::fs::remove_dir_all(&snapshot).ok();
}

fn temp_root() -> PathBuf {
    let root = std::env::temp_dir().join(format!("litera-sync-local-{}", ulid::Ulid::new()));
    std::fs::create_dir_all(&root).unwrap();
    root
}

fn manifest_file(path: &str, bytes: &[u8]) -> ManifestFile {
    ManifestFile {
        path: path.into(),
        size: bytes.len() as u64,
        sha256: hash_hex(bytes),
    }
}

fn manifest_paths(snapshot: &Snapshot) -> Vec<&str> {
    let mut paths = snapshot
        .manifest
        .files
        .iter()
        .map(|file| file.path.as_str())
        .collect::<Vec<_>>();
    paths.sort_unstable();
    paths
}

fn pre_pull_backups(root: &Path) -> Vec<PathBuf> {
    let mut paths = std::fs::read_dir(root.join("backups"))
        .unwrap()
        .map(|entry| entry.unwrap().path())
        .filter(|path| {
            path.file_name()
                .and_then(|name| name.to_str())
                .is_some_and(|name| name.starts_with("pre-pull-"))
        })
        .collect::<Vec<_>>();
    paths.sort();
    paths
}
