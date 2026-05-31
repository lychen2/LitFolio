use anyhow::Result;
use sqlx::Row;

use crate::storage::models::{Paper, ReadStatus};

pub(crate) fn row_to_paper(row: sqlx::sqlite::SqliteRow) -> Result<Paper> {
    let authors_raw: Option<String> = row.try_get("authors_json").ok();
    let authors = parse_json_vec(authors_raw.as_deref());
    let findings_raw: Option<String> = row.try_get("key_findings_json").ok();
    let key_findings = parse_json_vec(findings_raw.as_deref());
    let status_str: String = row.try_get("read_status")?;
    Ok(Paper {
        id: row.try_get("id")?,
        title: row.try_get("title")?,
        authors,
        year: row.try_get("year").ok(),
        venue: row.try_get("venue").ok(),
        doi: row.try_get("doi").ok(),
        arxiv_id: row.try_get("arxiv_id").ok(),
        abstract_text: row.try_get("abstract").ok(),
        pdf_path: row.try_get("pdf_path").ok(),
        note_path: row.try_get("note_path").ok(),
        added_at: row.try_get("added_at")?,
        updated_at: row.try_get("updated_at")?,
        read_status: ReadStatus::from_db(&status_str),
        tldr: row.try_get("tldr").ok(),
        research_question: row.try_get("research_question").ok(),
        method: row.try_get("method").ok(),
        dataset: row.try_get("dataset").ok(),
        key_findings,
        limitations: row.try_get("limitations").ok(),
        comparison: row.try_get("comparison").ok(),
        title_translated: row.try_get("title_translated").ok(),
        abstract_translated: row.try_get("abstract_translated").ok(),
        translate_target_lang: row.try_get("translate_target_lang").ok(),
        translated_at: row.try_get("translated_at").ok(),
        bibtex: row.try_get("bibtex").ok(),
        last_exported_at: row.try_get("last_exported_at").ok(),
    })
}

fn parse_json_vec(raw: Option<&str>) -> Vec<String> {
    raw.map(|s| serde_json::from_str(s).unwrap_or_default())
        .unwrap_or_default()
}
