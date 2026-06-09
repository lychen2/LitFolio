//! Ingest pipeline: PDF / BibTeX / RIS / DOI / arXiv / web search / topic / RSS.

#![allow(dead_code, unused_imports)]

mod arxiv;
mod bibtex;
mod doi;
mod paper_draft;
mod pdf;
mod rss;
mod search;
mod topic;
mod topic_survey_retrieval;

pub use arxiv::{fetch_arxiv, fetch_arxiv_category};
pub use bibtex::parse_bibtex;
pub use doi::{
    fetch_doi, fetch_doi_pdf_links, fetch_scihub_pdf_url, scihub_download_pdf, search_doi_by_title,
};
pub use paper_draft::PaperDraft;
pub use pdf::{
    extract_full_text_from_path, extract_markdown_from_path, import_pdf_file, PdfImportResult,
};
pub use rss::{fetch_feed, FetchedFeed};
pub use search::{bulk_by_citations, search_semantic_scholar, SearchResult};
pub use topic::{discover_topic, discover_topic_multi, TopicReport, TopicRequest};
pub use topic_survey_retrieval::{ground_survey, GroundedSubarea};
