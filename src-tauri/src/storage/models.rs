//! Core domain models persisted in SQLite.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ReadStatus {
    Unread,
    Reading,
    Read,
    Must,
}

impl ReadStatus {
    pub fn as_str(self) -> &'static str {
        match self {
            ReadStatus::Unread => "unread",
            ReadStatus::Reading => "reading",
            ReadStatus::Read => "read",
            ReadStatus::Must => "must",
        }
    }
    pub fn from_db(s: &str) -> Self {
        match s {
            "reading" => Self::Reading,
            "read" => Self::Read,
            "must" => Self::Must,
            _ => Self::Unread,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Paper {
    pub id: String,
    pub title: String,
    pub authors: Vec<String>,
    pub year: Option<i32>,
    pub venue: Option<String>,
    pub doi: Option<String>,
    pub arxiv_id: Option<String>,
    pub abstract_text: Option<String>,
    pub pdf_path: Option<String>,
    pub note_path: Option<String>,
    pub added_at: i64,
    pub updated_at: i64,
    pub read_status: ReadStatus,
    pub tldr: Option<String>,
    pub research_question: Option<String>,
    pub method: Option<String>,
    pub dataset: Option<String>,
    pub key_findings: Vec<String>,
    pub limitations: Option<String>,
    pub comparison: Option<String>,
    pub title_translated: Option<String>,
    pub abstract_translated: Option<String>,
    pub translate_target_lang: Option<String>,
    pub translated_at: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Tag {
    pub id: i64,
    pub name: String,
    pub parent_id: Option<i64>,
    pub color: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Folder {
    pub id: i64,
    pub name: String,
    pub parent_id: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Highlight {
    pub id: String,
    pub paper_id: String,
    pub page: i32,
    pub rect: serde_json::Value,
    pub color: String,
    pub text: String,
    pub note: Option<String>,
    pub created_at: i64,
}
