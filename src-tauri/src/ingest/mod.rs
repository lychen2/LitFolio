//! Ingest pipeline: PDF / BibTeX / RIS / DOI / arXiv / web search / topic.

#![allow(dead_code, unused_imports)]

mod doi;
mod arxiv;
mod bibtex;
mod paper_draft;
mod pdf;
mod search;
mod topic;

pub use doi::fetch_doi;
pub use arxiv::{fetch_arxiv, fetch_arxiv_category};
pub use bibtex::parse_bibtex;
pub use paper_draft::PaperDraft;
pub use pdf::{import_pdf_file, PdfImportResult};
pub use search::{bulk_by_citations, search_semantic_scholar, SearchResult};
pub use topic::{discover_topic, TopicReport, TopicRequest};
