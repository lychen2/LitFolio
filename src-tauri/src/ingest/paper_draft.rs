//! A `PaperDraft` is the unified result of any ingest source before it
//! is persisted into `papers`. Different importers (DOI/arXiv/BibTeX/PDF)
//! all converge on this shape so the storage layer never special-cases sources.

use chrono::Utc;
use serde::{Deserialize, Serialize};
use ulid::Ulid;

use crate::storage::{Paper, ReadStatus};

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct PaperDraft {
    pub title: String,
    pub authors: Vec<String>,
    pub year: Option<i32>,
    pub venue: Option<String>,
    pub doi: Option<String>,
    pub arxiv_id: Option<String>,
    pub abstract_text: Option<String>,
}

impl PaperDraft {
    pub fn into_paper(self) -> Paper {
        let now = Utc::now().timestamp();
        Paper {
            id: Ulid::new().to_string(),
            title: self.title,
            authors: self.authors,
            year: self.year,
            venue: self.venue,
            doi: self.doi,
            arxiv_id: self.arxiv_id,
            abstract_text: self.abstract_text,
            pdf_path: None,
            note_path: None,
            added_at: now,
            updated_at: now,
            read_status: ReadStatus::Unread,
            tldr: None,
            research_question: None,
            method: None,
            dataset: None,
            key_findings: vec![],
            limitations: None,
            comparison: None,
            title_translated: None,
            abstract_translated: None,
            translate_target_lang: None,
            translated_at: None,
        }
    }
}
