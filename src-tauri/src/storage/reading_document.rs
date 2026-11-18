//! Read-only adapter from canonical reader blocks to the existing AI/export body interface.

use serde::Deserialize;
use std::collections::HashMap;
use std::fmt::Write;
use std::time::SystemTime;

use super::{LibraryPaths, PaperDocumentRepo, Pool, ReadingCatalogItem};

/// File stamps avoid decoding every document after an unrelated library edit.
#[derive(Default)]
pub(crate) struct DocumentProjection {
    indexed: HashMap<String, (SystemTime, u64)>,
}

impl DocumentProjection {
    pub(crate) async fn project(
        &mut self,
        pool: &Pool,
        paths: &LibraryPaths,
        items: &[ReadingCatalogItem],
    ) -> anyhow::Result<()> {
        let repo = PaperDocumentRepo::new(pool);
        for item in items {
            let path = paths.root.join("reading").join(&item.id).join("paper.json");
            let Ok(metadata) = std::fs::metadata(path) else { continue };
            let stamp = (metadata.modified()?, metadata.len());
            if self.indexed.get(&item.id) == Some(&stamp) {
                continue;
            }
            if let Some(body) = read_original(paths, &item.id) {
                repo.upsert_markdown(&item.id, &body).await?;
            }
            self.indexed.insert(item.id.clone(), stamp);
        }
        Ok(())
    }
}

#[derive(Default, Deserialize)]
struct PaperDocument {
    #[serde(default)]
    blocks: Vec<Block>,
    #[serde(default)]
    references: Vec<Reference>,
}

#[derive(Deserialize)]
struct Block {
    #[serde(rename = "type")]
    kind: String,
    #[serde(default)]
    en: String,
    #[serde(default)]
    level: usize,
    #[serde(default)]
    ordered: bool,
    #[serde(default)]
    items: Vec<OriginalText>,
    #[serde(default)]
    tex: String,
    #[serde(default)]
    caption_en: String,
    #[serde(default)]
    image_en: String,
    #[serde(default)]
    rows: Vec<Vec<String>>,
}

#[derive(Deserialize)]
struct OriginalText {
    #[serde(default)]
    en: String,
}

#[derive(Deserialize)]
struct Reference {
    text: String,
}

pub(super) fn read_original(paths: &LibraryPaths, paper_id: &str) -> Option<String> {
    let file = std::fs::File::open(paths.root.join("reading").join(paper_id).join("paper.json")).ok()?;
    let paper: PaperDocument = serde_json::from_reader(std::io::BufReader::new(file)).ok()?;
    let mut body = String::new();
    for block in &paper.blocks {
        match block.kind.as_str() {
            "para" | "heading" => {
                if block.en.trim().is_empty() {
                    continue;
                }
                if block.kind == "heading" {
                    for _ in 0..block.level.clamp(1, 6) {
                        body.push('#');
                    }
                    body.push(' ');
                }
                append_original(&mut body, &block.en);
            }
            "list" => {
                for (index, item) in block.items.iter().enumerate() {
                    if item.en.trim().is_empty() {
                        continue;
                    }
                    if block.ordered {
                        let _ = write!(body, "{}. ", index + 1);
                    } else {
                        body.push_str("- ");
                    }
                    append_original(&mut body, &item.en);
                }
            }
            "math" => {
                if !block.tex.trim().is_empty() {
                    body.push_str("$$\n");
                    body.push_str(block.tex.trim());
                    body.push_str("\n$$\n\n");
                }
            }
            "table" => {
                append_original(&mut body, &block.caption_en);
                // Upstream overwrites `head` when translating; it is not a reliable source field.
                for row in &block.rows {
                    body.push('|');
                    for cell in row {
                        body.push(' ');
                        body.push_str(cell);
                        body.push_str(" |");
                    }
                    body.push('\n');
                }
                body.push('\n');
            }
            "figure" => {
                append_original(&mut body, &block.caption_en);
                append_original(&mut body, &block.image_en);
            }
            "references" => {
                for reference in &paper.references {
                    append_original(&mut body, &reference.text);
                }
            }
            _ => {}
        }
    }
    if body.trim().is_empty() { None } else { Some(body) }
}

fn append_original(body: &mut String, text: &str) {
    let text = text.trim();
    if text.is_empty() {
        return;
    }
    // Sentence-alignment delimiters belong to the reader, not the AI input.
    for ch in text.chars() {
        body.push(if ch == '‖' { ' ' } else { ch });
    }
    body.push_str("\n\n");
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[tokio::test]
    async fn prepared_originals_update_search_without_rewriting_unchanged_or_legacy_documents() {
        use crate::storage::{open_pool, run_migrations, PaperRepo};

        let dir = std::env::temp_dir().join(format!("litfolio-reading-index-{}", ulid::Ulid::new()));
        let paths = LibraryPaths::new(&dir);
        paths.ensure().unwrap();
        let pool = open_pool(&paths.db_file()).await.unwrap();
        run_migrations(&pool).await.unwrap();
        for id in ["prepared", "reference"] {
            sqlx::query("INSERT INTO papers (id, title, authors_json, added_at, updated_at, read_status)
                         VALUES (?1, 'Fixture', '[]', 1, 1, 'unread')")
                .bind(id).execute(&pool).await.unwrap();
        }
        let items: Vec<ReadingCatalogItem> = serde_json::from_value(json!([
            {"id":"prepared", "title":"Fixture", "status":"unread"},
            {"id":"reference", "title":"Fixture", "status":"unread"}
        ])).unwrap();
        let workspace = dir.join("reading/prepared");
        std::fs::create_dir_all(&workspace).unwrap();
        let path = workspace.join("paper.json");
        std::fs::write(&path, r#"{"blocks":[{"type":"para","en":"quasar original","zh":"translationonly"}]}"#).unwrap();
        PaperDocumentRepo::new(&pool).upsert_markdown("reference", "retained earlier body").await.unwrap();
        let mut projection = DocumentProjection::default();
        projection.project(&pool, &paths, &items).await.unwrap();
        let papers = PaperRepo::new(&pool);
        assert_eq!(papers.search("quasar", 10).await.unwrap()[0].id, "prepared");
        assert!(papers.search("translationonly", 10).await.unwrap().is_empty());
        assert_eq!(papers.search("retained", 10).await.unwrap()[0].id, "reference");

        sqlx::query("UPDATE paper_documents SET updated_at = 7 WHERE paper_id = 'prepared'")
            .execute(&pool).await.unwrap();
        projection.project(&pool, &paths, &items).await.unwrap();
        // A fresh service also avoids an identical database/FTS write.
        DocumentProjection::default().project(&pool, &paths, &items).await.unwrap();
        let updated_at: i64 = sqlx::query_scalar("SELECT updated_at FROM paper_documents WHERE paper_id = 'prepared'")
            .fetch_one(&pool).await.unwrap();
        assert_eq!(updated_at, 7);

        std::fs::write(&path, r#"{"blocks":[{"type":"para","en":"pulsar revised original paragraph"}]}"#).unwrap();
        projection.project(&pool, &paths, &items).await.unwrap();
        assert!(papers.search("quasar", 10).await.unwrap().is_empty());
        assert_eq!(papers.search("pulsar", 10).await.unwrap()[0].id, "prepared");
        pool.close().await;
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn ai_body_reads_current_original_blocks_and_retains_legacy_fallback() {
        let dir = std::env::temp_dir().join(format!("litfolio-reading-body-{}", ulid::Ulid::new()));
        let paths = LibraryPaths::new(&dir);
        paths.write_paper_markdown("paper", "stale extraction").unwrap();
        let workspace = dir.join("reading/paper");
        std::fs::create_dir_all(&workspace).unwrap();
        let path = workspace.join("paper.json");
        std::fs::write(&path, json!({"blocks": [
            {"type": "heading", "level": 2, "en": "Methods", "zh": "译文"},
            {"type": "para", "en": "Original one.‖Original two.", "zh": "译文"},
            {"type": "list", "ordered": true, "items": [{"en": "First", "zh": "译文"}]},
            {"type": "math", "tex": "x^2"},
            {"type": "table", "head": [["译文"]], "caption_en": "Table 1", "rows": [["A", "12"]]},
            {"type": "figure", "caption_en": "Figure 1", "image_en": "Source label"},
            {"type": "references"}
        ], "references": [{"id": "1", "text": "Author (2025)"}]}).to_string()).unwrap();
        let body = paths.read_pdf_text("paper").unwrap();
        for expected in ["## Methods", "Original one. Original two.", "1. First", "$$\nx^2\n$$", "| A | 12 |", "Figure 1", "Source label", "Author (2025)"] {
            assert!(body.contains(expected), "missing {expected}");
        }
        assert!(!body.contains("译文"));
        assert!(!body.contains("stale extraction"));
        std::fs::write(&path, r#"{"blocks":[{"type":"para","zh":"译文"}]}"#).unwrap();
        assert_eq!(paths.read_pdf_text("paper").as_deref(), Some("stale extraction"));
        std::fs::write(&path, "incomplete JSON").unwrap();
        assert_eq!(paths.read_pdf_text("paper").as_deref(), Some("stale extraction"));
        std::fs::remove_dir_all(dir).unwrap();
    }
}
