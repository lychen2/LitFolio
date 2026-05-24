//! Storage layer: SQLite via sqlx, migrations, library paths.

#![allow(dead_code, unused_imports)]

mod db;
mod paths;
mod papers;
mod models;
mod tags;

pub use db::{open_pool, run_migrations, Pool};
pub use paths::{LibraryPaths, default_library_root};
pub use models::{Paper, ReadStatus, Tag, Folder, Highlight};
pub use papers::PaperRepo;
pub use tags::{TagRepo, TagWithCount};
