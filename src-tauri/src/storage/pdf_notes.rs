//! Dedicated PDF text-note persistence with revision compare-and-swap writes.

use chrono::Utc;
use serde::{Deserialize, Serialize};
use sqlx::Row;
use thiserror::Error;
use ulid::Ulid;

use super::db::Pool;

const MAX_COORDINATE: f64 = 100_000.0;
const MIN_FONT_SIZE: f64 = 8.0;
const MAX_FONT_SIZE: f64 = 28.0;
const MIN_OPACITY: f64 = 0.1;
const MAX_OPACITY: f64 = 1.0;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum PdfNoteKind {
    #[serde(rename = "text-note")]
    TextNote,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PdfNoteRect {
    pub page: i32,
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PdfNote {
    pub kind: PdfNoteKind,
    pub id: String,
    pub paper_id: String,
    pub rect: PdfNoteRect,
    pub content: String,
    pub color: String,
    pub font_size: f64,
    pub opacity: f64,
    pub revision: i64,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PdfNoteCreateInput {
    pub rect: PdfNoteRect,
    pub content: String,
    pub color: String,
    pub font_size: f64,
    pub opacity: f64,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PdfNotePatch {
    pub rect: Option<PdfNoteRect>,
    pub content: Option<String>,
    pub color: Option<String>,
    pub font_size: Option<f64>,
    pub opacity: Option<f64>,
    pub expected_revision: i64,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PdfNoteSearchResult {
    pub note: PdfNote,
    pub snippet: String,
}

#[derive(Debug, Error, Serialize)]
#[serde(tag = "code", rename_all = "snake_case")]
pub enum PdfNoteError {
    #[error("paper not found")]
    PaperNotFound,
    #[error("invalid annotation geometry")]
    AnnotationInvalidGeometry,
    #[error("invalid annotation style")]
    AnnotationInvalidStyle,
    #[error("annotation revision conflict")]
    AnnotationRevisionConflict { current: PdfNote },
    #[error("annotation not found")]
    AnnotationNotFound,
    #[error("annotation storage error: {message}")]
    AnnotationStorage { message: String },
}

impl From<sqlx::Error> for PdfNoteError {
    fn from(error: sqlx::Error) -> Self {
        Self::AnnotationStorage {
            message: error.to_string(),
        }
    }
}

pub struct PdfNoteRepo<'a> {
    pool: &'a Pool,
}

impl<'a> PdfNoteRepo<'a> {
    pub fn new(pool: &'a Pool) -> Self {
        Self { pool }
    }

    pub async fn create(
        &self,
        paper_id: &str,
        input: &PdfNoteCreateInput,
    ) -> Result<PdfNote, PdfNoteError> {
        validate_rect(&input.rect)?;
        validate_style(&input.color, input.font_size, input.opacity)?;
        self.ensure_paper(paper_id).await?;

        let now = Utc::now().timestamp();
        let note = PdfNote {
            kind: PdfNoteKind::TextNote,
            id: Ulid::new().to_string(),
            paper_id: paper_id.to_owned(),
            rect: input.rect.clone(),
            content: input.content.clone(),
            color: input.color.clone(),
            font_size: input.font_size,
            opacity: input.opacity,
            revision: 0,
            created_at: now,
            updated_at: now,
        };
        insert_note(self.pool, &note, None).await?;
        Ok(note)
    }

    pub async fn list_by_paper(&self, paper_id: &str) -> Result<Vec<PdfNote>, PdfNoteError> {
        self.ensure_paper(paper_id).await?;
        let rows = sqlx::query(
            "SELECT id, paper_id, page, x, y, width, height, content, color,
                    font_size, opacity, revision, created_at, updated_at
             FROM pdf_notes
             WHERE paper_id = ?1
             ORDER BY page ASC, created_at ASC, id ASC",
        )
        .bind(paper_id)
        .fetch_all(self.pool)
        .await?;
        rows.into_iter().map(row_to_note).collect()
    }

    pub async fn get(&self, id: &str) -> Result<Option<PdfNote>, PdfNoteError> {
        let row = sqlx::query(
            "SELECT id, paper_id, page, x, y, width, height, content, color,
                    font_size, opacity, revision, created_at, updated_at
             FROM pdf_notes WHERE id = ?1",
        )
        .bind(id)
        .fetch_optional(self.pool)
        .await?;
        row.map(row_to_note).transpose()
    }

    pub async fn update(&self, id: &str, patch: &PdfNotePatch) -> Result<PdfNote, PdfNoteError> {
        if patch.expected_revision < 0 {
            return Err(PdfNoteError::AnnotationRevisionConflict {
                current: self.current_or_not_found(id).await?,
            });
        }
        if let Some(rect) = &patch.rect {
            validate_rect(rect)?;
        }
        let current = self.current_or_not_found(id).await?;
        let color = patch.color.as_deref().unwrap_or(&current.color);
        let font_size = patch.font_size.unwrap_or(current.font_size);
        let opacity = patch.opacity.unwrap_or(current.opacity);
        validate_style(color, font_size, opacity)?;

        let rect = patch.rect.as_ref();
        let now = Utc::now().timestamp();
        let row = sqlx::query(
            "UPDATE pdf_notes
             SET page = COALESCE(?1, page),
                 x = COALESCE(?2, x),
                 y = COALESCE(?3, y),
                 width = COALESCE(?4, width),
                 height = COALESCE(?5, height),
                 content = COALESCE(?6, content),
                 color = COALESCE(?7, color),
                 font_size = COALESCE(?8, font_size),
                 opacity = COALESCE(?9, opacity),
                 revision = revision + 1,
                 updated_at = ?10
             WHERE id = ?11 AND revision = ?12
             RETURNING id, paper_id, page, x, y, width, height, content, color,
                       font_size, opacity, revision, created_at, updated_at",
        )
        .bind(rect.map(|value| value.page))
        .bind(rect.map(|value| value.x))
        .bind(rect.map(|value| value.y))
        .bind(rect.map(|value| value.width))
        .bind(rect.map(|value| value.height))
        .bind(patch.content.as_deref())
        .bind(patch.color.as_deref())
        .bind(patch.font_size)
        .bind(patch.opacity)
        .bind(now)
        .bind(id)
        .bind(patch.expected_revision)
        .fetch_optional(self.pool)
        .await?;

        match row {
            Some(row) => row_to_note(row),
            None => match self.get(id).await? {
                Some(current) => Err(PdfNoteError::AnnotationRevisionConflict { current }),
                None => Err(PdfNoteError::AnnotationNotFound),
            },
        }
    }

    pub async fn delete(&self, id: &str, expected_revision: i64) -> Result<(), PdfNoteError> {
        let result = sqlx::query("DELETE FROM pdf_notes WHERE id = ?1 AND revision = ?2")
            .bind(id)
            .bind(expected_revision)
            .execute(self.pool)
            .await?;
        if result.rows_affected() == 1 {
            return Ok(());
        }
        match self.get(id).await? {
            Some(current) => Err(PdfNoteError::AnnotationRevisionConflict { current }),
            None => Err(PdfNoteError::AnnotationNotFound),
        }
    }

    pub async fn search(
        &self,
        query: &str,
        paper_id: Option<&str>,
    ) -> Result<Vec<PdfNoteSearchResult>, PdfNoteError> {
        let fts_query = fts_query(query);
        if fts_query.is_empty() {
            return Ok(Vec::new());
        }
        if let Some(id) = paper_id {
            self.ensure_paper(id).await?;
        }
        let rows = sqlx::query(
            "SELECT n.id, n.paper_id, n.page, n.x, n.y, n.width, n.height,
                    n.content, n.color, n.font_size, n.opacity, n.revision,
                    n.created_at, n.updated_at,
                    snippet(pdf_notes_fts, 2, '', '', ' ... ', 18) AS search_snippet
             FROM pdf_notes_fts
             JOIN pdf_notes n ON n.id = pdf_notes_fts.id
             WHERE pdf_notes_fts MATCH ?1
               AND (?2 IS NULL OR n.paper_id = ?2)
             ORDER BY rank, n.updated_at DESC, n.id ASC",
        )
        .bind(fts_query)
        .bind(paper_id)
        .fetch_all(self.pool)
        .await?;
        rows.into_iter()
            .map(|row| {
                let snippet = row
                    .try_get::<String, _>("search_snippet")
                    .map_err(PdfNoteError::from)?;
                Ok(PdfNoteSearchResult {
                    note: row_to_note(row)?,
                    snippet,
                })
            })
            .collect()
    }

    async fn ensure_paper(&self, paper_id: &str) -> Result<(), PdfNoteError> {
        let exists: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM papers WHERE id = ?1")
            .bind(paper_id)
            .fetch_one(self.pool)
            .await?;
        if exists == 0 {
            return Err(PdfNoteError::PaperNotFound);
        }
        Ok(())
    }

    async fn current_or_not_found(&self, id: &str) -> Result<PdfNote, PdfNoteError> {
        self.get(id).await?.ok_or(PdfNoteError::AnnotationNotFound)
    }
}

pub(crate) async fn insert_note(
    pool: &Pool,
    note: &PdfNote,
    legacy_highlight_id: Option<&str>,
) -> Result<(), PdfNoteError> {
    sqlx::query(
        "INSERT INTO pdf_notes
         (id, paper_id, legacy_highlight_id, page, x, y, width, height, content,
          color, font_size, opacity, revision, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)",
    )
    .bind(&note.id)
    .bind(&note.paper_id)
    .bind(legacy_highlight_id)
    .bind(note.rect.page)
    .bind(note.rect.x)
    .bind(note.rect.y)
    .bind(note.rect.width)
    .bind(note.rect.height)
    .bind(&note.content)
    .bind(&note.color)
    .bind(note.font_size)
    .bind(note.opacity)
    .bind(note.revision)
    .bind(note.created_at)
    .bind(note.updated_at)
    .execute(pool)
    .await?;
    Ok(())
}

fn row_to_note(row: sqlx::sqlite::SqliteRow) -> Result<PdfNote, PdfNoteError> {
    Ok(PdfNote {
        kind: PdfNoteKind::TextNote,
        id: row.try_get("id")?,
        paper_id: row.try_get("paper_id")?,
        rect: PdfNoteRect {
            page: row.try_get("page")?,
            x: row.try_get("x")?,
            y: row.try_get("y")?,
            width: row.try_get("width")?,
            height: row.try_get("height")?,
        },
        content: row.try_get("content")?,
        color: row.try_get("color")?,
        font_size: row.try_get("font_size")?,
        opacity: row.try_get("opacity")?,
        revision: row.try_get("revision")?,
        created_at: row.try_get("created_at")?,
        updated_at: row.try_get("updated_at")?,
    })
}

pub(crate) fn validate_rect(rect: &PdfNoteRect) -> Result<(), PdfNoteError> {
    let finite = rect.x.is_finite()
        && rect.y.is_finite()
        && rect.width.is_finite()
        && rect.height.is_finite();
    if rect.page < 1
        || !finite
        || rect.x < 0.0
        || rect.y < 0.0
        || rect.width <= 0.0
        || rect.height <= 0.0
        || rect.x + rect.width > MAX_COORDINATE
        || rect.y + rect.height > MAX_COORDINATE
    {
        return Err(PdfNoteError::AnnotationInvalidGeometry);
    }
    Ok(())
}

fn validate_style(color: &str, font_size: f64, opacity: f64) -> Result<(), PdfNoteError> {
    let valid_color = color.len() == 7
        && color.starts_with('#')
        && color[1..].bytes().all(|byte| byte.is_ascii_hexdigit());
    if !valid_color
        || !font_size.is_finite()
        || !(MIN_FONT_SIZE..=MAX_FONT_SIZE).contains(&font_size)
        || !opacity.is_finite()
        || !(MIN_OPACITY..=MAX_OPACITY).contains(&opacity)
    {
        return Err(PdfNoteError::AnnotationInvalidStyle);
    }
    Ok(())
}

fn fts_query(query: &str) -> String {
    query
        .split_whitespace()
        .filter(|term| !term.is_empty())
        .map(|term| format!("\"{}\"", term.replace('"', "\"\"")))
        .collect::<Vec<_>>()
        .join(" AND ")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::storage::{run_migrations, Pool};
    use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
    use std::str::FromStr;

    async fn test_pool() -> Pool {
        let options = SqliteConnectOptions::from_str("sqlite::memory:")
            .unwrap()
            .foreign_keys(true);
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect_with(options)
            .await
            .unwrap();
        run_migrations(&pool).await.unwrap();
        sqlx::query(
            "INSERT INTO papers (id, title, authors_json, added_at, updated_at)
             VALUES ('paper-1', 'Paper One', '[]', 1, 1),
                    ('paper-2', 'Paper Two', '[]', 1, 1)",
        )
        .execute(&pool)
        .await
        .unwrap();
        pool
    }

    fn input(content: &str) -> PdfNoteCreateInput {
        PdfNoteCreateInput {
            rect: PdfNoteRect {
                page: 2,
                x: 10.0,
                y: 20.0,
                width: 220.0,
                height: 120.0,
            },
            content: content.to_owned(),
            color: "#fff3a3".to_owned(),
            font_size: 12.0,
            opacity: 0.9,
        }
    }

    #[tokio::test]
    async fn pdf_note_crud_persists_and_increments_revision() {
        let pool = test_pool().await;
        let repo = PdfNoteRepo::new(&pool);
        let created = repo.create("paper-1", &input("")).await.unwrap();
        assert_eq!(created.revision, 0);
        assert_eq!(
            repo.list_by_paper("paper-1").await.unwrap(),
            vec![created.clone()]
        );

        let updated = repo
            .update(
                &created.id,
                &PdfNotePatch {
                    content: Some("latest text".to_owned()),
                    rect: Some(PdfNoteRect {
                        x: 40.0,
                        ..created.rect.clone()
                    }),
                    expected_revision: 0,
                    ..PdfNotePatch::default()
                },
            )
            .await
            .unwrap();
        assert_eq!(updated.revision, 1);
        assert_eq!(updated.content, "latest text");
        assert_eq!(updated.rect.x, 40.0);

        repo.delete(&created.id, 1).await.unwrap();
        assert!(repo.list_by_paper("paper-1").await.unwrap().is_empty());
    }

    #[tokio::test]
    async fn pdf_note_stale_update_and_delete_return_current_revision() {
        let pool = test_pool().await;
        let repo = PdfNoteRepo::new(&pool);
        let created = repo.create("paper-1", &input("first")).await.unwrap();
        let saved = repo
            .update(
                &created.id,
                &PdfNotePatch {
                    content: Some("newest".to_owned()),
                    expected_revision: 0,
                    ..PdfNotePatch::default()
                },
            )
            .await
            .unwrap();

        let stale = repo
            .update(
                &created.id,
                &PdfNotePatch {
                    content: Some("stale".to_owned()),
                    expected_revision: 0,
                    ..PdfNotePatch::default()
                },
            )
            .await
            .unwrap_err();
        match stale {
            PdfNoteError::AnnotationRevisionConflict { current } => {
                assert_eq!(current.revision, 1);
                assert_eq!(current.content, "newest");
            }
            other => panic!("unexpected error: {other:?}"),
        }
        assert!(matches!(
            repo.delete(&created.id, 0).await.unwrap_err(),
            PdfNoteError::AnnotationRevisionConflict { .. }
        ));
        assert_eq!(repo.get(&created.id).await.unwrap(), Some(saved));
    }

    #[tokio::test]
    async fn pdf_note_search_is_owned_by_pdf_notes_and_cascades() {
        let pool = test_pool().await;
        let repo = PdfNoteRepo::new(&pool);
        let note = repo
            .create("paper-1", &input("retrieval augmented generation evidence"))
            .await
            .unwrap();
        repo.create("paper-2", &input("unrelated retrieval note"))
            .await
            .unwrap();

        let hits = repo
            .search("retrieval generation", Some("paper-1"))
            .await
            .unwrap();
        assert_eq!(hits.len(), 1);
        assert_eq!(hits[0].note.id, note.id);
        assert!(hits[0].snippet.contains("retrieval"));

        sqlx::query("DELETE FROM papers WHERE id = 'paper-1'")
            .execute(&pool)
            .await
            .unwrap();
        assert!(repo.get(&note.id).await.unwrap().is_none());
        let fts_rows: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM pdf_notes_fts WHERE pdf_notes_fts MATCH 'generation'",
        )
        .fetch_one(&pool)
        .await
        .unwrap();
        assert_eq!(fts_rows, 0);
    }

    #[tokio::test]
    async fn pdf_note_validation_reports_stable_error_codes() {
        let pool = test_pool().await;
        let repo = PdfNoteRepo::new(&pool);
        assert!(matches!(
            repo.create("missing", &input("draft")).await.unwrap_err(),
            PdfNoteError::PaperNotFound
        ));

        let mut invalid_geometry = input("draft");
        invalid_geometry.rect.width = 0.0;
        assert!(matches!(
            repo.create("paper-1", &invalid_geometry).await.unwrap_err(),
            PdfNoteError::AnnotationInvalidGeometry
        ));

        let mut invalid_style = input("draft");
        invalid_style.opacity = 2.0;
        assert!(matches!(
            repo.create("paper-1", &invalid_style).await.unwrap_err(),
            PdfNoteError::AnnotationInvalidStyle
        ));
    }
}
