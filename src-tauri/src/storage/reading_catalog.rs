//! Projection of the LitFolio reading catalog into LitFolio's SQLite index.
//!
//! The reading service owns paper metadata, read state and tags. This module
//! stores that catalog as a derived index keyed by the same paper id, so
//! LitFolio-only data — notes, highlights, reading queue, generated AI fields,
//! folders, source links — survives every catalog refresh untouched.
//!
//! Rules the projection keeps:
//!
//! * An existing paper row keeps its `added_at`, and an item whose metadata,
//!   read state and tag links already match produces no write at all, so
//!   `updated_at` (and the downstream "needs export" check) stays quiet.
//! * Only bibliographic fields and read state are refreshed. `pdf_path` is
//!   filled in when LitFolio has none and never cleared, because a local copy
//!   of the PDF is user-owned data.
//! * Tags are matched by name. New names become ordinary tag definitions; tag
//!   definitions are never deleted, and only this paper's links are replaced
//!   to mirror the upstream list.
//! * Papers absent from the catalog are left alone: upstream trash state must
//!   not delete local notes, highlights or AI output.
//! * DOI and arXiv id are UNIQUE across papers, so a catalog value already
//!   owned by another row is skipped instead of aborting the batch.
//! * A catalog item without a PDF (web source) is stored with a null
//!   `pdf_path`; the projection writes SQL directly instead of going through
//!   [`super::PaperRepo::insert`], which requires a PDF.

use anyhow::{Context, Result};
use chrono::Utc;
use serde::Deserialize;
use sqlx::{Row, Sqlite, Transaction};

use super::db::Pool;
use super::models::ReadStatus;

/// One catalog entry as served by `GET /api/host/catalog`.
#[derive(Debug, Clone, Deserialize)]
pub struct ReadingCatalogItem {
    pub id: String,
    pub title: String,
    #[serde(default)]
    pub original_title: Option<String>,
    #[serde(default)]
    pub authors: Vec<String>,
    #[serde(default)]
    pub year: Option<i32>,
    #[serde(default)]
    pub venue: Option<String>,
    #[serde(default)]
    pub doi: Option<String>,
    #[serde(default)]
    pub arxiv_id: Option<String>,
    #[serde(default)]
    pub abstract_text: Option<String>,
    #[serde(default)]
    pub pdf_path: Option<String>,
    pub status: CatalogReadStatus,
    #[serde(default)]
    pub starred: bool,
    #[serde(default)]
    pub tags: Vec<String>,
}

/// Upstream read state. `done` maps onto LitFolio's `read`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum CatalogReadStatus {
    Unread,
    Reading,
    Done,
}

impl CatalogReadStatus {
    fn to_read_status(self) -> ReadStatus {
        match self {
            CatalogReadStatus::Unread => ReadStatus::Unread,
            CatalogReadStatus::Reading => ReadStatus::Reading,
            CatalogReadStatus::Done => ReadStatus::Read,
        }
    }
}

impl ReadingCatalogItem {
    fn read_status(&self) -> ReadStatus {
        if self.starred { ReadStatus::Must } else { self.status.to_read_status() }
    }
}

/// Stored paper columns the projection compares against.
struct StoredPaper {
    title: String,
    original_title: Option<String>,
    authors: Vec<String>,
    year: Option<i32>,
    venue: Option<String>,
    doi: Option<String>,
    arxiv_id: Option<String>,
    abstract_text: Option<String>,
    pdf_path: Option<String>,
    read_status: String,
}

impl StoredPaper {
    fn from_row(row: &sqlx::sqlite::SqliteRow) -> Result<Self> {
        let authors_json: Option<String> = optional_text(row, "authors_json");
        let authors = authors_json
            .as_deref()
            .and_then(|raw| serde_json::from_str::<Vec<String>>(raw).ok())
            .unwrap_or_default();
        Ok(Self {
            title: row.try_get("title")?,
            original_title: optional_text(row, "original_title"),
            authors,
            year: row.try_get("year")?,
            venue: optional_text(row, "venue"),
            doi: optional_text(row, "doi"),
            arxiv_id: optional_text(row, "arxiv_id"),
            abstract_text: optional_text(row, "abstract"),
            pdf_path: optional_text(row, "pdf_path"),
            read_status: row.try_get("read_status")?,
        })
    }
}

/// Read a nullable text column as `Option<String>`, treating an empty string
/// as absent.
///
/// SQLite hands NULL text to sqlx's `String` decoder as `""`, so a plain
/// `try_get(name).ok()` against an `Option<String>` field would synthesize
/// `Some("")` for every NULL column and make each projection look like a
/// change.
fn optional_text(row: &sqlx::sqlite::SqliteRow, column: &str) -> Option<String> {
    row.try_get::<Option<String>, _>(column)
        .ok()
        .flatten()
        .filter(|value| !value.trim().is_empty())
}

/// Write `items` into the local paper index in a single transaction.
///
/// Returns once the catalog is reflected in SQLite; a failure rolls back the
/// whole batch.
pub async fn project_reading_catalog(pool: &Pool, items: &[ReadingCatalogItem]) -> Result<()> {
    let mut tx = pool.begin().await.context("begin reading catalog tx")?;
    let now = Utc::now().timestamp();

    for item in items {
        let stored = sqlx::query(
            "SELECT title, authors_json, year, venue, doi, arxiv_id, abstract,
                    pdf_path, read_status, original_title
             FROM papers WHERE id = ?1",
        )
        .bind(&item.id)
        .fetch_optional(&mut *tx)
        .await
        .with_context(|| format!("load catalog paper {}", item.id))?;

        match stored {
            Some(row) => {
                let stored = StoredPaper::from_row(&row)?;
                upsert_existing(&mut tx, item, &stored, now).await?;
            }
            None => insert_new(&mut tx, item, now).await?,
        }

        sync_tags(&mut tx, &item.id, &item.tags).await?;
    }

    tx.commit().await.context("commit reading catalog tx")?;
    Ok(())
}

async fn insert_new(
    tx: &mut Transaction<'_, Sqlite>,
    item: &ReadingCatalogItem,
    now: i64,
) -> Result<()> {
    let authors_json = serde_json::to_string(&item.authors)?;
    let doi = unique_text(
        tx,
        "SELECT 1 FROM papers WHERE lower(trim(doi)) = lower(?1) AND id != ?2",
        &item.id,
        normalized(&item.doi),
    )
    .await?;
    let arxiv_id = unique_text(
        tx,
        "SELECT 1 FROM papers WHERE arxiv_id = ?1 AND id != ?2",
        &item.id,
        normalized(&item.arxiv_id),
    )
    .await?;
    sqlx::query(
        "INSERT INTO papers (id, title, authors_json, year, venue, doi, arxiv_id, abstract,
                             pdf_path, note_path, added_at, updated_at, read_status,
                             key_findings_json, original_title)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,NULL,?10,?10,?11,'[]',?12)",
    )
    .bind(&item.id)
    .bind(&item.title)
    .bind(&authors_json)
    .bind(item.year)
    .bind(normalized(&item.venue))
    .bind(doi)
    .bind(arxiv_id)
    .bind(normalized(&item.abstract_text))
    .bind(normalized(&item.pdf_path))
    .bind(now)
    .bind(item.read_status().as_str())
    .bind(normalized(&item.original_title))
    .execute(&mut **tx)
    .await
    .with_context(|| format!("insert catalog paper {}", item.id))?;
    Ok(())
}

async fn upsert_existing(
    tx: &mut Transaction<'_, Sqlite>,
    item: &ReadingCatalogItem,
    stored: &StoredPaper,
    now: i64,
) -> Result<()> {
    let read_status = item.read_status();
    let original_title = normalized(&item.original_title);
    let venue = normalized(&item.venue);
    let abstract_text = normalized(&item.abstract_text);
    let pdf_path = normalized(&item.pdf_path);

    // Resolve DOI and arXiv id first so a value owned by another paper compares
    // as absent and does not look changed on every projection.
    let doi = unique_text(
        tx,
        "SELECT 1 FROM papers WHERE lower(trim(doi)) = lower(?1) AND id != ?2",
        &item.id,
        normalized(&item.doi),
    )
    .await?;
    let arxiv_id = unique_text(
        tx,
        "SELECT 1 FROM papers WHERE arxiv_id = ?1 AND id != ?2",
        &item.id,
        normalized(&item.arxiv_id),
    )
    .await?;

    let metadata_changed = stored.title != item.title
        || stored.original_title.as_deref() != original_title
        || stored.authors != item.authors
        || stored.year != item.year
        || stored.venue.as_deref() != venue
        || stored.doi.as_deref() != doi.as_deref()
        || stored.arxiv_id.as_deref() != arxiv_id.as_deref()
        || stored.abstract_text.as_deref() != abstract_text
        || stored.read_status != read_status.as_str();

    let fills_pdf = stored.pdf_path.is_none() && pdf_path.is_some();

    if !metadata_changed && !fills_pdf {
        return Ok(());
    }

    let authors_json = serde_json::to_string(&item.authors)?;
    sqlx::query(
        "UPDATE papers
         SET title = ?1, authors_json = ?2, year = ?3, venue = ?4,
             abstract = ?5, doi = ?6, arxiv_id = ?7, read_status = ?8,
             pdf_path = COALESCE(NULLIF(pdf_path, ''), ?9),
             updated_at = ?10, original_title = ?11
         WHERE id = ?12",
    )
    .bind(&item.title)
    .bind(&authors_json)
    .bind(item.year)
    .bind(venue)
    .bind(abstract_text)
    .bind(doi)
    .bind(arxiv_id)
    .bind(read_status.as_str())
    .bind(pdf_path)
    .bind(now)
    .bind(original_title)
    .bind(&item.id)
    .execute(&mut **tx)
    .await
    .with_context(|| format!("update catalog paper {}", item.id))?;
    Ok(())
}

/// Return `value` when no other paper already holds it in a UNIQUE column.
///
/// `papers.doi` and `papers.arxiv_id` are UNIQUE, so binding a value another
/// row owns would abort the whole catalog transaction. The catalog value is
/// then skipped and the existing owner keeps it.
async fn unique_text(
    tx: &mut Transaction<'_, Sqlite>,
    exists_sql: &'static str,
    paper_id: &str,
    value: Option<&str>,
) -> Result<Option<String>> {
    let Some(value) = value else {
        return Ok(None);
    };
    let taken: Option<i64> = sqlx::query_scalar(exists_sql)
        .bind(value)
        .bind(paper_id)
        .fetch_optional(&mut **tx)
        .await
        .with_context(|| format!("check uniqueness of {value}"))?;
    Ok(if taken.is_some() {
        None
    } else {
        Some(value.to_string())
    })
}

/// Mirror `names` as this paper's tag links, creating unknown tag definitions.
///
/// Tag definitions, colours and parent links are never modified or deleted;
/// only `paper_tags` rows for `paper_id` change, and only when the desired set
/// differs from the stored one.
async fn sync_tags(
    tx: &mut Transaction<'_, Sqlite>,
    paper_id: &str,
    names: &[String],
) -> Result<()> {
    let mut names: Vec<&str> = names
        .iter()
        .map(|raw| raw.trim())
        .filter(|name| !name.is_empty())
        .collect();
    names.sort_unstable();
    names.dedup();
    let mut desired: Vec<i64> = Vec::with_capacity(names.len());
    if !names.is_empty() {
        let placeholders = vec!["?"; names.len()].join(",");
        let lookup = format!("SELECT id, name FROM tags WHERE name IN ({placeholders})");
        let mut known = sqlx::query(&lookup);
        for name in &names {
            known = known.bind(*name);
        }
        let mut existing: Vec<(i64, String)> = known
            .fetch_all(&mut **tx)
            .await
            .with_context(|| format!("resolve catalog tags for paper {paper_id}"))?
            .into_iter()
            .map(|row| Ok((row.try_get("id")?, row.try_get("name")?)))
            .collect::<Result<Vec<_>>>()?;

        for name in &names {
            if existing.iter().any(|(_, stored)| stored == name) {
                continue;
            }
            sqlx::query("INSERT OR IGNORE INTO tags (name) VALUES (?1)")
                .bind(*name)
                .execute(&mut **tx)
                .await
                .with_context(|| format!("register catalog tag {name}"))?;
            let tag_id: i64 = sqlx::query_scalar("SELECT id FROM tags WHERE name = ?1")
                .bind(*name)
                .fetch_one(&mut **tx)
                .await
                .with_context(|| format!("resolve catalog tag {name}"))?;
            existing.push((tag_id, (*name).to_string()));
        }

        desired = existing.iter().map(|(id, _)| *id).collect();
    }

    let current: Vec<i64> = sqlx::query_scalar("SELECT tag_id FROM paper_tags WHERE paper_id = ?1")
        .bind(paper_id)
        .fetch_all(&mut **tx)
        .await
        .with_context(|| format!("load tags of paper {paper_id}"))?;

    for tag_id in &desired {
        if current.contains(tag_id) {
            continue;
        }
        sqlx::query("INSERT OR IGNORE INTO paper_tags (paper_id, tag_id) VALUES (?1, ?2)")
            .bind(paper_id)
            .bind(tag_id)
            .execute(&mut **tx)
            .await
            .with_context(|| format!("attach tag {tag_id} to paper {paper_id}"))?;
    }
    for tag_id in &current {
        if desired.contains(tag_id) {
            continue;
        }
        sqlx::query("DELETE FROM paper_tags WHERE paper_id = ?1 AND tag_id = ?2")
            .bind(paper_id)
            .bind(tag_id)
            .execute(&mut **tx)
            .await
            .with_context(|| format!("detach tag {tag_id} from paper {paper_id}"))?;
    }
    Ok(())
}

/// Trim an optional text value and treat the empty string as absent, so stored
/// values stay NULL-clean and comparisons see a single absent representation.
fn normalized(value: &Option<String>) -> Option<&str> {
    value.as_deref().map(str::trim).filter(|v| !v.is_empty())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::storage::db::{open_pool, run_migrations};
    use std::path::PathBuf;

    async fn temp_pool() -> (Pool, PathBuf) {
        let dir = std::env::temp_dir().join(format!("litera-catalog-{}", ulid::Ulid::new()));
        std::fs::create_dir_all(&dir).unwrap();
        let db = dir.join("library.db");
        let pool = open_pool(&db).await.unwrap();
        run_migrations(&pool).await.unwrap();
        (pool, dir)
    }

    fn item(id: &str, title: &str, status: CatalogReadStatus) -> ReadingCatalogItem {
        ReadingCatalogItem {
            id: id.into(),
            title: title.into(),
            original_title: None,
            authors: vec!["Ada Lovelace".into()],
            year: Some(2024),
            venue: Some("NeurIPS".into()),
            doi: None,
            arxiv_id: None,
            abstract_text: Some("An abstract.".into()),
            pdf_path: Some(format!("/tmp/{id}.pdf")),
            status,
            starred: false,
            tags: vec!["methods".into()],
        }
    }

    #[tokio::test]
    async fn catalog_projection_preserves_user_fields_and_skips_noop_writes() {
        let (pool, dir) = temp_pool().await;

        // Local paper with user-owned data: note path, generated AI fields and a
        // highlight with its own note.
        sqlx::query(
            "INSERT INTO papers (id, title, authors_json, added_at, updated_at, read_status,
                                 pdf_path, note_path, tldr, key_findings_json)
             VALUES ('P1', 'Old title', '[\"Ada Lovelace\"]', 1000, 1000, 'unread',
                     '/tmp/P1.pdf', '/notes/P1.md', 'generated tldr', '[\"finding\"]')",
        )
        .execute(&pool)
        .await
        .unwrap();
        sqlx::query(
            "INSERT INTO highlights (id, paper_id, page, rect_json, color, text, note, created_at)
             VALUES ('H1', 'P1', 3, '{\"x\":1}', 'yellow', 'quoted text', 'my note', 1100)",
        )
        .execute(&pool)
        .await
        .unwrap();
        sqlx::query(
            "INSERT INTO tags (id, name, color) VALUES (7, 'methods', '#ff0000'),
                                                       (8, 'unrelated', '#00ff00')",
        )
        .execute(&pool)
        .await
        .unwrap();
        sqlx::query("INSERT INTO paper_tags (paper_id, tag_id) VALUES ('P1', 7)")
            .execute(&pool)
            .await
            .unwrap();

        let mut update = item("P1", "New title", CatalogReadStatus::Reading);
        update.tags = vec!["upstream".into(), "methods".into()];
        let mut added = item("P2", "Web paper", CatalogReadStatus::Done);
        added.pdf_path = None;

        let catalog = vec![update, added];
        project_reading_catalog(&pool, &catalog).await.unwrap();

        let row = sqlx::query(
            "SELECT title, added_at, updated_at, read_status, pdf_path, note_path,
                    abstract, tldr, key_findings_json, authors_json
             FROM papers WHERE id = 'P1'",
        )
        .fetch_one(&pool)
        .await
        .unwrap();
        assert_eq!(row.get::<String, _>("title"), "New title");
        assert_eq!(row.get::<i64, _>("added_at"), 1000);
        assert_eq!(row.get::<String, _>("read_status"), "reading");
        assert_eq!(row.get::<String, _>("pdf_path"), "/tmp/P1.pdf");
        assert_eq!(row.get::<String, _>("note_path"), "/notes/P1.md");
        assert_eq!(row.get::<String, _>("tldr"), "generated tldr");
        assert_eq!(row.get::<String, _>("key_findings_json"), "[\"finding\"]");
        assert_eq!(row.get::<String, _>("abstract"), "An abstract.");

        let highlight_note: String =
            sqlx::query_scalar("SELECT note FROM highlights WHERE id = 'H1'")
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(highlight_note, "my note");

        let mut tags: Vec<String> = sqlx::query_scalar(
            "SELECT t.name FROM tags t JOIN paper_tags pt ON pt.tag_id = t.id
             WHERE pt.paper_id = 'P1'",
        )
        .fetch_all(&pool)
        .await
        .unwrap();
        tags.sort();
        assert_eq!(tags, vec!["methods".to_string(), "upstream".to_string()]);
        let stored_color: Option<String> =
            sqlx::query_scalar("SELECT color FROM tags WHERE name = 'methods'")
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(stored_color.as_deref(), Some("#ff0000"));
        let unrelated: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM tags WHERE name = 'unrelated'")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(unrelated, 1);

        // Web source: no PDF stored, upstream `done` becomes `read`.
        let web = sqlx::query("SELECT pdf_path, read_status FROM papers WHERE id = 'P2'")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert!(web.get::<Option<String>, _>("pdf_path").is_none());
        assert_eq!(web.get::<String, _>("read_status"), "read");

        // A repeated projection with identical content writes nothing.
        sqlx::query("UPDATE papers SET updated_at = 424242")
            .execute(&pool)
            .await
            .unwrap();
        project_reading_catalog(&pool, &catalog).await.unwrap();
        let stamp: i64 = sqlx::query_scalar("SELECT updated_at FROM papers WHERE id = 'P1'")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(stamp, 424242);
        let link_count: i64 =
            sqlx::query_scalar("SELECT COUNT(*) FROM paper_tags WHERE paper_id = 'P1'")
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(link_count, 2);

        let mut starred = catalog[0].clone();
        starred.starred = true;
        project_reading_catalog(&pool, &[starred.clone()]).await.unwrap();
        let status: String = sqlx::query_scalar("SELECT read_status FROM papers WHERE id = 'P1'")
            .fetch_one(&pool).await.unwrap();
        assert_eq!(status, "must");
        starred.starred = false;
        project_reading_catalog(&pool, &[starred]).await.unwrap();
        let status: String = sqlx::query_scalar("SELECT read_status FROM papers WHERE id = 'P1'")
            .fetch_one(&pool).await.unwrap();
        assert_eq!(status, "reading");

        std::fs::remove_dir_all(&dir).ok();
    }
}
