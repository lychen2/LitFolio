//! Targeted legacy margin-note conversion and note archive export.
//!
//! Sentinel `reader-margin-note` highlight rows are read-only conversion
//! input once new text-note writes use `pdf_notes`; originals are never
//! deleted. Conversion targets are deterministic (`legacy-<highlight-id>`)
//! and idempotent: already-converted rows are reported, not duplicated.
//! Full-library orchestration and startup conversion belong to
//! `mono-legacy-conversion`; this module owns the per-library primitives.

use chrono::Utc;
use serde::Serialize;
use serde_json::Value;
use sqlx::Row;
use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::path::{Path, PathBuf};
use thiserror::Error;
use ulid::Ulid;

use super::db::Pool;
use super::note_sections::{NoteSection, NoteSectionRepo, DEFAULT_SECTIONS};
use super::paths::LibraryPaths;
use super::pdf_notes::{insert_note, validate_rect, PdfNote, PdfNoteError, PdfNoteKind, PdfNoteRect};

/// Sentinel label stored on legacy margin-note pseudo-highlights.
pub const READER_MARGIN_NOTE_LABEL: &str = "reader-margin-note";
pub const LEGACY_NOTE_DEFAULT_COLOR: &str = "#facc15";
pub const LEGACY_NOTE_DEFAULT_FONT_SIZE: f64 = 14.0;
pub const LEGACY_NOTE_DEFAULT_OPACITY: f64 = 0.9;
pub const LEGACY_NOTE_SCHEMA_VERSION: i64 = 1;
pub const LEGACY_NOTE_TARGET_VERSION: i64 = 1;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LegacyReaderNotesPreview {
    pub schema_version: i64,
    pub target_version: i64,
    pub total_sentinel_rows: i64,
    pub already_converted: i64,
    pub convertible: i64,
    pub paper_ids: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LegacyReaderNotesReport {
    pub schema_version: i64,
    pub target_version: i64,
    pub destination: String,
    pub verified_backup_path: String,
    pub source_rows: i64,
    pub converted: i64,
    pub already_converted: i64,
    pub failed: i64,
    pub defaulted_styles: i64,
    pub markdown_files: i64,
    pub section_files: i64,
    pub empty_default_sections: i64,
    pub rollback_state: String,
}

#[derive(Debug, Error)]
pub enum LegacyReaderNotesError {
    #[error("legacy reader notes export failed: {0}")]
    Export(String),
    #[error("legacy reader notes storage error: {0}")]
    Storage(#[from] sqlx::Error),
}

impl Serialize for LegacyReaderNotesError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LegacyExportStage {
    Backup,
    Convert,
    Archive,
}

#[derive(Debug, Clone)]
struct SentinelRow {
    id: String,
    paper_id: String,
    page: i64,
    rect_json: String,
    color: Option<String>,
    text: Option<String>,
    note: Option<String>,
    created_at: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct BackupManifest {
    schema_version: i64,
    target_version: i64,
    sentinel_rows: Vec<BackupSentinelRow>,
    note_files: BTreeMap<String, String>,
    sections: BTreeMap<String, Vec<NoteSection>>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct BackupSentinelRow {
    id: String,
    paper_id: String,
    page: i64,
    rect_json: String,
    color: Option<String>,
    text: Option<String>,
    note: Option<String>,
    created_at: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ArchiveIndex {
    schema_version: i64,
    target_version: i64,
    papers: Vec<ArchivePaperEntry>,
    counts: ArchiveCounts,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ArchivePaperEntry {
    paper_id: String,
    note_file: String,
    sections_file: String,
    empty_default_sections: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ArchiveCounts {
    markdown_files: i64,
    section_files: i64,
    empty_default_sections: i64,
}

async fn sentinel_rows(pool: &Pool) -> Result<Vec<SentinelRow>, sqlx::Error> {
    let rows = sqlx::query(
        "SELECT id, paper_id, page, rect_json, color, text, note, created_at
         FROM highlights WHERE label = ?1
         ORDER BY paper_id, created_at, id",
    )
    .bind(READER_MARGIN_NOTE_LABEL)
    .fetch_all(pool)
    .await?;
    let mut out = Vec::with_capacity(rows.len());
    for row in rows {
        out.push(SentinelRow {
            id: row.try_get("id")?,
            paper_id: row.try_get("paper_id")?,
            page: row.try_get("page")?,
            rect_json: row.try_get("rect_json")?,
            color: row.try_get("color")?,
            text: row.try_get("text")?,
            note: row.try_get("note")?,
            created_at: row.try_get("created_at")?,
        });
    }
    Ok(out)
}

async fn already_converted_ids(pool: &Pool) -> Result<BTreeSet<String>, sqlx::Error> {
    let rows = sqlx::query("SELECT legacy_highlight_id FROM pdf_notes WHERE legacy_highlight_id IS NOT NULL")
        .fetch_all(pool)
        .await?;
    let mut out = BTreeSet::new();
    for row in rows {
        if let Some(id) = row.try_get::<Option<String>, _>("legacy_highlight_id")? {
            out.insert(id);
        }
    }
    Ok(out)
}

/// Preview: count sentinel rows and how many are already converted.
pub async fn preview_legacy_reader_notes(
    pool: &Pool,
) -> Result<LegacyReaderNotesPreview, LegacyReaderNotesError> {
    let rows = sentinel_rows(pool).await?;
    let already = already_converted_ids(pool).await?;
    let mut paper_ids = BTreeSet::new();
    let mut already_count = 0i64;
    for row in &rows {
        paper_ids.insert(row.paper_id.clone());
        if already.contains(&row.id) {
            already_count += 1;
        }
    }
    Ok(LegacyReaderNotesPreview {
        schema_version: LEGACY_NOTE_SCHEMA_VERSION,
        target_version: LEGACY_NOTE_TARGET_VERSION,
        total_sentinel_rows: rows.len() as i64,
        already_converted: already_count,
        convertible: rows.len() as i64 - already_count,
        paper_ids: paper_ids.into_iter().collect(),
    })
}

/// Convert sentinel margin-note rows into `pdf_notes` and archive the paper
/// Markdown note files and note sections. Idempotent: converted rows are
/// reported as already-converted on later runs. Originals are never deleted.
pub async fn export_legacy_reader_notes(
    pool: &Pool,
    paths: &LibraryPaths,
    destination: Option<&Path>,
) -> Result<LegacyReaderNotesReport, LegacyReaderNotesError> {
    export_legacy_reader_notes_staged(pool, paths, destination, None).await
}

pub(crate) async fn export_legacy_reader_notes_staged(
    pool: &Pool,
    paths: &LibraryPaths,
    destination: Option<&Path>,
    fail_after: Option<LegacyExportStage>,
) -> Result<LegacyReaderNotesReport, LegacyReaderNotesError> {
    let rows = sentinel_rows(pool).await?;
    let already = already_converted_ids(pool).await?;
    let source_rows = rows.len() as i64;

    let dest = match destination {
        Some(path) => path.to_path_buf(),
        None => paths.legacy_note_export_dir(),
    };
    if dest.exists() && !dest.is_dir() {
        return Err(LegacyReaderNotesError::Export(format!(
            "export destination is not a directory: {}",
            dest.display()
        )));
    }
    fs::create_dir_all(&dest)
        .map_err(|error| LegacyReaderNotesError::Export(format!("create destination {}: {error}", dest.display())))?;

    // Backup (timestamp appears only in the backup directory name).
    let backup_dir = dest
        .join("backup")
        .join(format!("legacy-notes-{}", Utc::now().timestamp()));
    let verified_backup_path = write_backup(pool, paths, &backup_dir, &rows).await?;
    if fail_after == Some(LegacyExportStage::Backup) {
        return Ok(rolled_back_report(
            &dest,
            &verified_backup_path,
            source_rows,
            0,
            0,
            rows.len() as i64,
            0,
            0,
        ));
    }

    // Convert sentinel rows into pdf_notes (deterministic ids, no delete).
    let mut converted = 0i64;
    let mut already_count = 0i64;
    let mut failed = 0i64;
    let mut defaulted_styles = 0i64;
    let mut inserted_ids: Vec<String> = Vec::new();
    let mut converted_paper_ids = BTreeSet::new();
    for row in &rows {
        if already.contains(&row.id) {
            already_count += 1;
            continue;
        }
        let Some(rect) = parse_legacy_rect(&row.rect_json, row.page) else {
            failed += 1;
            continue;
        };
        if validate_rect(&rect).is_err() {
            failed += 1;
            continue;
        }
        let (color, defaulted) = legacy_color(&row.color);
        if defaulted {
            defaulted_styles += 1;
        }
        let content = row
            .note
            .clone()
            .or_else(|| row.text.clone())
            .unwrap_or_default();
        let note = PdfNote {
            kind: PdfNoteKind::TextNote,
            id: format!("legacy-{}", row.id),
            paper_id: row.paper_id.clone(),
            rect,
            content,
            color,
            font_size: LEGACY_NOTE_DEFAULT_FONT_SIZE,
            opacity: LEGACY_NOTE_DEFAULT_OPACITY,
            revision: 0,
            created_at: row.created_at,
            updated_at: row.created_at,
        };
        match insert_note(pool, &note, Some(&row.id)).await {
            Ok(()) => {
                converted += 1;
                inserted_ids.push(note.id);
                converted_paper_ids.insert(row.paper_id.clone());
            }
            Err(PdfNoteError::AnnotationStorage { .. }) => {
                failed += 1;
            }
            Err(error) => {
                eprintln!("legacy convert rejected {}: {error:?}", row.id);
                failed += 1;
            }
        }
    }
    if fail_after == Some(LegacyExportStage::Convert) {
        rollback_converted(pool, &inserted_ids).await?;
        return Ok(rolled_back_report(
            &dest,
            &verified_backup_path,
            source_rows,
            0,
            already_count,
            failed,
            defaulted_styles,
            converted_paper_ids.len() as i64,
        ));
    }

    // Deterministic Markdown/section archive, staged then atomically renamed.
    let staging = dest.join(format!(".staging-{}", Ulid::new()));
    let (markdown_files, section_files, empty_default_sections) =
        write_archive(pool, paths, &staging, &rows).await?;
    if fail_after == Some(LegacyExportStage::Archive) {
        let _ = fs::remove_dir_all(&staging);
        rollback_converted(pool, &inserted_ids).await?;
        return Ok(rolled_back_report(
            &dest,
            &verified_backup_path,
            source_rows,
            0,
            already_count,
            failed,
            defaulted_styles,
            empty_default_sections,
        ));
    }

    let final_archive = dest.join("archive");
    if final_archive.exists() {
        let _ = fs::remove_dir_all(&final_archive);
    }
    fs::rename(&staging, &final_archive).map_err(|error| {
        let _ = fs::remove_dir_all(&staging);
        LegacyReaderNotesError::Export(format!("move staged archive into place: {error}"))
    })?;

    Ok(LegacyReaderNotesReport {
        schema_version: LEGACY_NOTE_SCHEMA_VERSION,
        target_version: LEGACY_NOTE_TARGET_VERSION,
        destination: dest.display().to_string(),
        verified_backup_path,
        source_rows,
        converted,
        already_converted: already_count,
        failed,
        defaulted_styles,
        markdown_files,
        section_files,
        empty_default_sections,
        rollback_state: "committed".to_string(),
    })
}

async fn write_backup(
    pool: &Pool,
    paths: &LibraryPaths,
    backup_dir: &Path,
    rows: &[SentinelRow],
) -> Result<String, LegacyReaderNotesError> {
    fs::create_dir_all(backup_dir).map_err(|error| {
        LegacyReaderNotesError::Export(format!(
            "create backup directory {}: {error}",
            backup_dir.display()
        ))
    })?;
    let mut note_files = BTreeMap::new();
    let mut sections = BTreeMap::new();
    let section_repo = NoteSectionRepo::new(pool);
    let mut paper_ids = BTreeSet::new();
    for row in rows {
        paper_ids.insert(row.paper_id.clone());
    }
    for paper_id in &paper_ids {
        let note_path = paths.paper_dir(paper_id).join("note.md");
        if note_path.exists() {
            note_files.insert(
                paper_id.clone(),
                fs::read_to_string(&note_path).map_err(|error| {
                    LegacyReaderNotesError::Export(format!(
                        "read note file {}: {error}",
                        note_path.display()
                    ))
                })?,
            );
        }
        let paper_sections = section_repo.list_by_paper(paper_id).await.map_err(|error| {
            LegacyReaderNotesError::Export(format!("read note sections for {paper_id}: {error}"))
        })?;
        sections.insert(paper_id.clone(), paper_sections);
    }
    let manifest = BackupManifest {
        schema_version: LEGACY_NOTE_SCHEMA_VERSION,
        target_version: LEGACY_NOTE_TARGET_VERSION,
        sentinel_rows: rows
            .iter()
            .map(|row| BackupSentinelRow {
                id: row.id.clone(),
                paper_id: row.paper_id.clone(),
                page: row.page,
                rect_json: row.rect_json.clone(),
                color: row.color.clone(),
                text: row.text.clone(),
                note: row.note.clone(),
                created_at: row.created_at,
            })
            .collect(),
        note_files,
        sections,
    };
    let manifest_bytes = serde_json::to_vec_pretty(&manifest).map_err(|error| {
        LegacyReaderNotesError::Export(format!("serialize backup manifest: {error}"))
    })?;
    let manifest_path = backup_dir.join("backup.json");
    fs::write(&manifest_path, manifest_bytes).map_err(|error| {
        LegacyReaderNotesError::Export(format!(
            "write backup manifest {}: {error}",
            manifest_path.display()
        ))
    })?;
    Ok(backup_dir.display().to_string())
}

async fn write_archive(
    pool: &Pool,
    paths: &LibraryPaths,
    staging: &Path,
    rows: &[SentinelRow],
) -> Result<(i64, i64, i64), LegacyReaderNotesError> {
    fs::create_dir_all(staging)
        .map_err(|error| LegacyReaderNotesError::Export(format!("create staging: {error}")))?;
    let notes_dir = staging.join("notes");
    let sections_dir = staging.join("sections");
    fs::create_dir_all(&notes_dir).map_err(|error| {
        LegacyReaderNotesError::Export(format!("create staging notes: {error}"))
    })?;
    fs::create_dir_all(&sections_dir).map_err(|error| {
        LegacyReaderNotesError::Export(format!("create staging sections: {error}"))
    })?;

    let section_repo = NoteSectionRepo::new(pool);
    let mut paper_ids = BTreeSet::new();
    for row in rows {
        paper_ids.insert(row.paper_id.clone());
    }
    let mut entries = Vec::with_capacity(paper_ids.len());
    let mut markdown_files = 0i64;
    let mut section_files = 0i64;
    let mut empty_default_sections = 0i64;
    let default_keys: BTreeSet<&str> = DEFAULT_SECTIONS.iter().map(|(key, _)| *key).collect();

    for paper_id in &paper_ids {
        let note_path = paths.paper_dir(paper_id).join("note.md");
        let note_content = if note_path.exists() {
            markdown_files += 1;
            fs::read_to_string(&note_path).map_err(|error| {
                LegacyReaderNotesError::Export(format!(
                    "read note file {}: {error}",
                    note_path.display()
                ))
            })?
        } else {
            String::new()
        };
        let note_file = format!("notes/{paper_id}.md");
        fs::write(notes_dir.join(format!("{paper_id}.md")), &note_content).map_err(|error| {
            LegacyReaderNotesError::Export(format!("write archived note for {paper_id}: {error}"))
        })?;

        let paper_sections = section_repo.list_by_paper(paper_id).await.map_err(|error| {
            LegacyReaderNotesError::Export(format!("read note sections for {paper_id}: {error}"))
        })?;
        section_files += 1;
        let empty_defaults = paper_sections
            .iter()
            .filter(|section| section.content.is_empty() && default_keys.contains(section.section_key.as_str()))
            .count() as i64;
        empty_default_sections += empty_defaults;
        let sections_file = format!("sections/{paper_id}.json");
        let sections_json = serde_json::to_vec_pretty(&serde_json::json!({
            "paperId": paper_id,
            "sections": paper_sections.iter().map(|section| serde_json::json!({
                "key": section.section_key,
                "order": section.sort_order,
                "source": section.source,
                "content": section.content,
            })).collect::<Vec<_>>(),
        }))
        .map_err(|error| LegacyReaderNotesError::Export(format!("serialize sections: {error}")))?;
        fs::write(sections_dir.join(format!("{paper_id}.json")), sections_json).map_err(|error| {
            LegacyReaderNotesError::Export(format!(
                "write archived sections for {paper_id}: {error}"
            ))
        })?;

        entries.push(ArchivePaperEntry {
            paper_id: paper_id.clone(),
            note_file,
            sections_file,
            empty_default_sections: empty_defaults,
        });
    }

    let index = ArchiveIndex {
        schema_version: LEGACY_NOTE_SCHEMA_VERSION,
        target_version: LEGACY_NOTE_TARGET_VERSION,
        papers: entries,
        counts: ArchiveCounts {
            markdown_files,
            section_files,
            empty_default_sections,
        },
    };
    let index_bytes = serde_json::to_vec_pretty(&index).map_err(|error| {
        LegacyReaderNotesError::Export(format!("serialize archive index: {error}"))
    })?;
    fs::write(staging.join("index.json"), index_bytes).map_err(|error| {
        LegacyReaderNotesError::Export(format!("write archive index: {error}"))
    })?;
    Ok((markdown_files, section_files, empty_default_sections))
}

async fn rollback_converted(pool: &Pool, inserted_ids: &[String]) -> Result<(), sqlx::Error> {
    for id in inserted_ids {
        sqlx::query("DELETE FROM pdf_notes WHERE id = ?1 AND legacy_highlight_id IS NOT NULL")
            .bind(id)
            .execute(pool)
            .await?;
    }
    Ok(())
}

fn rolled_back_report(
    dest: &Path,
    verified_backup_path: &str,
    source_rows: i64,
    converted: i64,
    already_count: i64,
    failed: i64,
    defaulted_styles: i64,
    empty_default_sections: i64,
) -> LegacyReaderNotesReport {
    LegacyReaderNotesReport {
        schema_version: LEGACY_NOTE_SCHEMA_VERSION,
        target_version: LEGACY_NOTE_TARGET_VERSION,
        destination: dest.display().to_string(),
        verified_backup_path: verified_backup_path.to_string(),
        source_rows,
        converted,
        already_converted: already_count,
        failed,
        defaulted_styles,
        markdown_files: 0,
        section_files: 0,
        empty_default_sections,
        rollback_state: "rolled-back".to_string(),
    }
}

/// Accepts both the react-pdf-highlighter rect (`x1/y1/x2/y2`) and the
/// explicit `page/x/y/width/height` shape stored by margin-note overlays.
fn parse_legacy_rect(json: &str, page: i64) -> Option<PdfNoteRect> {
    let value: Value = serde_json::from_str(json).ok()?;
    let object = value.as_object()?;
    let x1 = object.get("x1").and_then(|value| value.as_f64());
    let y1 = object.get("y1").and_then(|value| value.as_f64());
    let x2 = object.get("x2").and_then(|value| value.as_f64());
    let y2 = object.get("y2").and_then(|value| value.as_f64());
    if let (Some(x1), Some(y1), Some(x2), Some(y2)) = (x1, y1, x2, y2) {
        let rect_page = object
            .get("pageNumber")
            .and_then(|value| value.as_i64())
            .unwrap_or(page);
        return Some(PdfNoteRect {
            page: rect_page as i32,
            x: x1,
            y: y1,
            width: x2 - x1,
            height: y2 - y1,
        });
    }
    Some(PdfNoteRect {
        page: page as i32,
        x: object.get("x")?.as_f64()?,
        y: object.get("y")?.as_f64()?,
        width: object.get("width")?.as_f64()?,
        height: object.get("height")?.as_f64()?,
    })
}

fn legacy_color(color: &Option<String>) -> (String, bool) {
    match color {
        Some(value) if is_hex_color(value) => (value.clone(), false),
        _ => (LEGACY_NOTE_DEFAULT_COLOR.to_string(), true),
    }
}

fn is_hex_color(value: &str) -> bool {
    value.len() == 7
        && value.starts_with('#')
        && value[1..].bytes().all(|byte| byte.is_ascii_hexdigit())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::storage::{open_pool, run_migrations, LibraryPaths};
    use std::fs;



    async fn test_context(
        name: &str,
    ) -> (Pool, LibraryPaths, std::path::PathBuf) {
        let root =
            std::env::temp_dir().join(format!("litera-legacy-note-{name}-{}", Ulid::new()));
        fs::create_dir_all(&root).expect("create test root");
        let paths = LibraryPaths::new(&root);
        let pool = open_pool(&paths.db_file()).await.expect("open pool");
        run_migrations(&pool).await.expect("run migrations");
        (pool, paths, root)
    }

    async fn seed_paper(pool: &Pool, paper_id: &str) {
        sqlx::query(
            "INSERT INTO papers (id, title, authors_json, added_at, updated_at, read_status)
             VALUES (?1, ?2, '[]', 0, 0, 'unread')",
        )
        .bind(paper_id)
        .bind(paper_id)
        .execute(pool)
        .await
        .expect("seed paper");
    }

    async fn seed_sentinel(
        pool: &Pool,
        id: &str,
        paper_id: &str,
        rect_json: &str,
        note: &str,
    ) {
        sqlx::query(
            "INSERT INTO highlights (id, paper_id, page, rect_json, color, label, text, note, created_at)
             VALUES (?1, ?2, 1, ?3, '#facc15', 'reader-margin-note', '', ?4, 1000)",
        )
        .bind(id)
        .bind(paper_id)
        .bind(rect_json)
        .bind(note)
        .execute(pool)
        .await
        .expect("seed sentinel highlight");
    }

    #[tokio::test]
    async fn preview_counts_sentinels_and_conversion_state() {
        let (pool, _paths, root) = test_context("preview").await;
        seed_paper(&pool, "paper-a").await;
        seed_paper(&pool, "paper-b").await;
        seed_sentinel(&pool, "h-1", "paper-a", r#"{"x":1.0,"y":2.0,"width":10.0,"height":5.0}"#, "first").await;
        seed_sentinel(&pool, "h-2", "paper-b", r#"{"x1":0.0,"y1":0.0,"x2":8.0,"y2":4.0,"pageNumber":2}"#, "second").await;

        let preview = preview_legacy_reader_notes(&pool).await.expect("preview");
        assert_eq!(preview.total_sentinel_rows, 2);
        assert_eq!(preview.convertible, 2);
        assert_eq!(preview.already_converted, 0);
        assert_eq!(preview.paper_ids, vec!["paper-a".to_string(), "paper-b".to_string()]);

        let report = export_legacy_reader_notes(&pool, &_paths, None)
            .await
            .expect("export");
        assert_eq!(report.converted, 2);
        assert_eq!(report.rollback_state, "committed");

        let preview_after = preview_legacy_reader_notes(&pool).await.expect("preview after");
        assert_eq!(preview_after.already_converted, 2);
        assert_eq!(preview_after.convertible, 0);

        let second = export_legacy_reader_notes(&pool, &_paths, None)
            .await
            .expect("second export");
        assert_eq!(second.converted, 0);
        assert_eq!(second.already_converted, 2);
        assert!(Path::new(&second.verified_backup_path).join("backup.json").exists());

        pool.close().await;
        let _ = fs::remove_dir_all(root);
    }

    #[tokio::test]
    async fn export_writes_deterministic_archive_and_counts_defaults() {
        let (pool, paths, root) = test_context("archive").await;
        seed_paper(&pool, "paper-a").await;
        seed_sentinel(&pool, "h-1", "paper-a", r#"{"x":1.0,"y":2.0,"width":10.0,"height":5.0}"#, "hello").await;

        let note_dir = paths.paper_dir("paper-a");
        fs::create_dir_all(&note_dir).expect("paper dir");
        fs::write(note_dir.join("note.md"), "# Note body").expect("note file");

        let report = export_legacy_reader_notes(&pool, &paths, None)
            .await
            .expect("export");
        assert_eq!(report.markdown_files, 1);
        assert_eq!(report.section_files, 1);
        assert_eq!(report.converted, 1);

        let archive = paths.legacy_note_export_dir().join("archive");
        let index: Value = serde_json::from_str(
            &fs::read_to_string(archive.join("index.json")).expect("index"),
        )
        .expect("parse index");
        assert_eq!(index["schemaVersion"], 1);
        assert_eq!(index["papers"][0]["paperId"], "paper-a");
        assert_eq!(
            fs::read_to_string(archive.join("notes/paper-a.md")).expect("note"),
            "# Note body"
        );
        assert!(archive.join("sections/paper-a.json").exists());
        // Deterministic: no wall-clock timestamp appears in archive contents.
        let serialized = fs::read_to_string(archive.join("index.json")).expect("index text");
        assert!(!serialized.contains("timestamp"), "index must stay deterministic");

        // Re-running is idempotent and identical target rows are reused.
        let second = export_legacy_reader_notes(&pool, &paths, None)
            .await
            .expect("second");
        assert_eq!(second.converted, 0);
        assert_eq!(second.already_converted, 1);

        pool.close().await;
        let _ = fs::remove_dir_all(root);
    }

    #[tokio::test]
    async fn injected_archive_failure_restores_staged_files_and_rolls_back_rows() {
        let (pool, paths, root) = test_context("rollback").await;
        seed_paper(&pool, "paper-a").await;
        seed_sentinel(&pool, "h-1", "paper-a", r#"{"x":1.0,"y":2.0,"width":10.0,"height":5.0}"#, "note").await;

        let report = export_legacy_reader_notes_staged(
            &pool,
            &paths,
            None,
            Some(LegacyExportStage::Archive),
        )
        .await
        .expect("export with injected archive failure");
        assert_eq!(report.rollback_state, "rolled-back");
        assert_eq!(report.converted, 0);
        assert_eq!(report.failed, 0);
        assert_eq!(report.source_rows, 1);

        // No staged or partial archive remains.
        let export_root = paths.legacy_note_export_dir();
        assert!(!export_root.join("archive").exists());
        assert!(fs::read_dir(&export_root)
            .expect("list export root")
            .all(|entry| !entry
                .expect("entry")
                .file_name()
                .to_string_lossy()
                .starts_with(".staging-")));

        // No converted rows remain; a clean run converts them.
        let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM pdf_notes")
            .fetch_one(&pool)
            .await
            .expect("count notes");
        assert_eq!(count, 0);
        let clean = export_legacy_reader_notes(&pool, &paths, None)
            .await
            .expect("clean export after rollback");
        assert_eq!(clean.converted, 1);
        assert_eq!(clean.rollback_state, "committed");

        pool.close().await;
        let _ = fs::remove_dir_all(root);
    }

    #[tokio::test]
    async fn export_rejects_destination_that_is_a_file() {
        let (pool, paths, root) = test_context("bad-dest").await;
        seed_paper(&pool, "paper-a").await;
        seed_sentinel(&pool, "h-1", "paper-a", r#"{"x":1.0,"y":2.0,"width":10.0,"height":5.0}"#, "x").await;
        let bad = root.join("not-a-dir");
        fs::write(&bad, "file").expect("write blocking file");
        let result = export_legacy_reader_notes(&pool, &paths, Some(&bad)).await;
        assert!(result.is_err(), "destination file must fail the export");

        pool.close().await;
        let _ = fs::remove_dir_all(root);
    }

    #[tokio::test]
    async fn invalid_geometry_rows_are_counted_failed_not_converted() {
        let (pool, paths, root) = test_context("bad-geometry").await;
        seed_paper(&pool, "paper-a").await;
        seed_sentinel(&pool, "h-1", "paper-a", r#"{"x":-5.0,"y":0.0,"width":10.0,"height":5.0}"#, "neg").await;
        seed_sentinel(&pool, "h-2", "paper-a", r#"not json at all"#, "bad").await;

        let report = export_legacy_reader_notes(&pool, &paths, None)
            .await
            .expect("export");
        assert_eq!(report.failed, 2);
        assert_eq!(report.converted, 0);

        pool.close().await;
        let _ = fs::remove_dir_all(root);
    }
}
