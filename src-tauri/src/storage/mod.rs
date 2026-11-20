//! Storage layer: SQLite via sqlx, migrations, library paths.

#![allow(dead_code, unused_imports)]

mod ai_executions;
mod candidates;
mod db;
mod feed_defaults;
pub mod feeds;
mod folders;
mod highlights;
pub mod jobs;
pub mod knowledge;
mod legacy_reader_notes;
mod models;
mod note_sections;
pub mod notes;
mod paper_documents;
mod paper_terms;
mod papers;
mod paths;
mod pdf_notes;
mod plugin_state;
mod provenance;
pub mod reading_catalog;
pub(crate) mod reading_document;
pub mod retrieval;
mod tags;
pub mod topic_alerts;

pub use ai_executions::{AiExecutionRepo, ExecutionRecord};
pub use candidates::{CandidateDraft, CandidatePaper, CandidateRepo};
pub use db::{open_pool, run_migrations, Pool};
pub use feeds::{Feed, FeedItem, FeedRepo, FeedWithCounts, NewFeedItem};
pub use folders::{FolderRepo, FolderWithCount};
pub use highlights::{
    HighlightExplanationUpdate, HighlightRepo, HighlightSummaryUpdate, HighlightTranslationUpdate,
};
pub use jobs::{JobDraft, JobProgress, JobRecord, JobRepo};
pub use legacy_reader_notes::{
    export_legacy_reader_notes, preview_legacy_reader_notes, LegacyReaderNotesError,
    LegacyReaderNotesPreview, LegacyReaderNotesReport,
};
pub use models::{Folder, Highlight, Paper, PaperTerm, ReadStatus, RelatedPaperTerm, Tag};
pub use note_sections::{NoteSection, NoteSectionRepo};
pub use paper_documents::{PaperDocumentIndexStatus, PaperDocumentRepo};
pub use paper_terms::{NewPaperTerm, PaperTermRepo};
pub use papers::PaperRepo;
#[cfg(not(target_os = "android"))]
pub use paths::default_library_root;
pub use paths::LibraryPaths;
pub use pdf_notes::{
    PdfNote, PdfNoteCreateInput, PdfNoteError, PdfNotePatch, PdfNoteRect, PdfNoteRepo,
    PdfNoteSearchResult,
};
pub use plugin_state::{PluginStateRepo, PluginStateRow};
pub use provenance::{
    BackfillPaperReport, BackfillReport, BacklinkRow, CandidateSegment, DocumentCandidate,
    DocumentRevision, NoteRevision, NoteSaveResult, ProvenanceError, ProvenanceExport,
    ProvenanceRepo, RemapReport, SourceLink, SourceSegment, PROVENANCE_SCHEMA_VERSION,
    PROVENANCE_TARGET_VERSION,
};
pub use reading_catalog::{project_reading_catalog, CatalogReadStatus, ReadingCatalogItem};
pub use retrieval::{unified_search, UnifiedSearchResult};
pub use tags::{TagRepo, TagWithCount};
pub use topic_alerts::{TopicAlert, TopicAlertRepo, TopicAlertResult, TopicAlertResultInsert};
