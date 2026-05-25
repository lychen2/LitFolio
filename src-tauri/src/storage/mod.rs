//! Storage layer: SQLite via sqlx, migrations, library paths.

#![allow(dead_code, unused_imports)]

mod db;
pub mod feeds;
mod folders;
mod highlights;
mod models;
pub mod notes;
mod papers;
mod paths;
mod tags;

pub use db::{open_pool, run_migrations, Pool};
pub use feeds::{Feed, FeedItem, FeedRepo, FeedWithCounts, NewFeedItem};
pub use folders::{FolderRepo, FolderWithCount};
pub use highlights::HighlightRepo;
pub use models::{Folder, Highlight, Paper, ReadStatus, Tag};
pub use papers::PaperRepo;
pub use paths::{default_library_root, LibraryPaths};
pub use tags::{TagRepo, TagWithCount};
