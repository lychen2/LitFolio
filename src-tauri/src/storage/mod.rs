//! Storage layer: SQLite via sqlx, migrations, library paths.

#![allow(dead_code, unused_imports)]

mod comparisons;
pub mod concepts;
pub mod custom_fields;
mod db;
pub mod dedup;
pub mod embeddings;
mod feed_defaults;
pub mod feeds;
mod folders;
mod highlights;
pub mod knowledge;
mod models;
mod note_sections;
pub mod notes;
mod paper_links;
mod paper_terms;
mod papers;
mod paths;
pub mod queue;
pub mod retrieval;
pub mod smart_collections;
mod tags;
pub mod topic_alerts;

pub use comparisons::{ComparisonRepo, PaperComparison};
pub use concepts::{Concept, ConceptRelation, ConceptRepo, PaperConcept};
pub use custom_fields::{CustomFieldDef, CustomFieldRepo, PaperCustomField};
pub use db::{open_pool, run_migrations, Pool};
pub use dedup::{find_duplicate, merge_papers, scan_all_duplicates, DuplicatePair};
pub use embeddings::EmbeddingRepo;
pub use feeds::{Feed, FeedItem, FeedRepo, FeedWithCounts, NewFeedItem};
pub use folders::{FolderRepo, FolderWithCount};
pub use highlights::{
    HighlightExplanationUpdate, HighlightRepo, HighlightSummaryUpdate, HighlightTranslationUpdate,
};
pub use models::{Folder, Highlight, Paper, PaperTerm, ReadStatus, RelatedPaperTerm, Tag};
pub use note_sections::{NoteSection, NoteSectionRepo};
pub use paper_links::{GraphData, GraphEdge, GraphFilter, GraphNode, PaperLink, PaperLinkRepo};
pub use paper_terms::{NewPaperTerm, PaperTermRepo};
pub use papers::PaperRepo;
pub use paths::{default_library_root, LibraryPaths};
pub use queue::{QueueEntry, QueueRepo};
pub use retrieval::{unified_search, UnifiedSearchResult};
pub use smart_collections::{FilterRule, SmartCollection, SmartCollectionRepo};
pub use tags::{TagRepo, TagWithCount};
pub use topic_alerts::{TopicAlert, TopicAlertRepo, TopicAlertResult, TopicAlertResultInsert};
