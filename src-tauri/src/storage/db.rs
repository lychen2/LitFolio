//! SQLite connection pool and migrations.

use anyhow::{Context, Result};
use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
use std::path::Path;
use std::str::FromStr;

pub type Pool = sqlx::SqlitePool;

/// Open a SQLite pool at `db_path`, creating the file if missing.
pub async fn open_pool(db_path: &Path) -> Result<Pool> {
    if let Some(parent) = db_path.parent() {
        std::fs::create_dir_all(parent)
            .with_context(|| format!("create parent dir {}", parent.display()))?;
    }
    let url = format!("sqlite://{}", db_path.display());
    let opts = SqliteConnectOptions::from_str(&url)?
        .create_if_missing(true)
        .foreign_keys(true)
        .journal_mode(sqlx::sqlite::SqliteJournalMode::Wal)
        .synchronous(sqlx::sqlite::SqliteSynchronous::Normal);
    let pool = SqlitePoolOptions::new()
        .max_connections(8)
        .connect_with(opts)
        .await
        .with_context(|| format!("connect sqlite at {}", db_path.display()))?;
    Ok(pool)
}

static MIGRATOR: sqlx::migrate::Migrator = sqlx::migrate!("./migrations");

pub async fn run_migrations(pool: &Pool) -> Result<()> {
    MIGRATOR.run(pool).await.context("run sqlx migrations")?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    async fn mem_pool() -> Pool {
        let opts = SqliteConnectOptions::from_str("sqlite::memory:")
            .unwrap()
            .foreign_keys(true);
        SqlitePoolOptions::new()
            .max_connections(1)
            .connect_with(opts)
            .await
            .unwrap()
    }

    #[tokio::test]
    async fn migrations_apply_to_memory_db() {
        let pool = mem_pool().await;
        run_migrations(&pool).await.expect("migrations run");
        let count: (i64,) = sqlx::query_as(
            "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='papers'",
        )
        .fetch_one(&pool)
        .await
        .unwrap();
        assert_eq!(count.0, 1);
    }
}
