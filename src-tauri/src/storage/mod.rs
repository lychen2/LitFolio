//! Storage layer: SQLite via sqlx, migrations, library paths.

#![allow(dead_code, unused_imports)]

mod db;
mod feed_defaults;
pub mod feeds;
mod folders;
mod highlights;
pub mod knowledge;
mod models;
pub mod notes;
mod paper_terms;
mod papers;
mod paths;
mod tags;

pub use db::{open_pool, run_migrations, Pool};
pub use feeds::{Feed, FeedItem, FeedRepo, FeedWithCounts, NewFeedItem};
pub use folders::{FolderRepo, FolderWithCount};
pub use highlights::{HighlightRepo, HighlightSummaryUpdate, HighlightTranslationUpdate};
pub use models::{Folder, Highlight, Paper, PaperTerm, ReadStatus, RelatedPaperTerm, Tag};
pub use paper_terms::{NewPaperTerm, PaperTermRepo};
pub use papers::PaperRepo;
pub use paths::{default_library_root, LibraryPaths};
pub use tags::{TagRepo, TagWithCount};
