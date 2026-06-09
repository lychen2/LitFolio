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

    #[tokio::test]
    async fn migrations_create_expected_latest_schema() {
        let pool = mem_pool().await;
        run_migrations(&pool).await.expect("migrations run");
        assert_table(&pool, "papers_fts").await;
        assert_table(&pool, "paper_documents").await;
        assert_table(&pool, "paper_documents_fts").await;
        assert_table(&pool, "feed_items").await;
        assert_table(&pool, "paper_embeddings").await;
        assert_column(&pool, "feed_items", "metadata_json").await;
        assert_column(&pool, "feed_items", "metadata_checked_at").await;
        assert_column(&pool, "highlights", "explanation_text").await;
        assert_column(&pool, "highlights", "explanation_model").await;
        assert_trigger(&pool, "papers_ai").await;
        assert_trigger(&pool, "papers_au").await;
        assert_trigger(&pool, "paper_documents_ai").await;
        assert_trigger(&pool, "paper_documents_au").await;
        assert_index(&pool, "idx_paper_embeddings_model").await;
    }

    #[tokio::test]
    async fn migrations_are_idempotent() {
        let pool = mem_pool().await;
        run_migrations(&pool).await.expect("first migration run");
        run_migrations(&pool).await.expect("second migration run");
        assert_column(&pool, "papers", "last_exported_at").await;
        assert_column(&pool, "topic_alert_results", "alert_id").await;
    }

    #[tokio::test]
    async fn migrations_upgrade_old_0001_fixture_db() {
        let dir = std::env::temp_dir().join(format!("litera-old-db-{}", ulid::Ulid::new()));
        std::fs::create_dir_all(&dir).unwrap();
        let db_path = dir.join("library.sqlite");
        let pool = open_pool(&db_path).await.unwrap();
        sqlx::raw_sql(include_str!("../../tests/fixtures/old_0001_library.sql"))
            .execute(&pool)
            .await
            .unwrap();

        run_migrations(&pool).await.expect("old fixture migrates");
        run_migrations(&pool).await.expect("old fixture reruns");

        assert_old_fixture_data_survived(&pool).await;
        assert_latest_tables_work_after_upgrade(&pool).await;
        pool.close().await;
        let _ = std::fs::remove_dir_all(dir);
    }

    async fn assert_table(pool: &Pool, name: &str) {
        assert_schema_object(pool, "table", name).await;
    }

    async fn assert_trigger(pool: &Pool, name: &str) {
        assert_schema_object(pool, "trigger", name).await;
    }

    async fn assert_index(pool: &Pool, name: &str) {
        assert_schema_object(pool, "index", name).await;
    }

    async fn assert_schema_object(pool: &Pool, kind: &str, name: &str) {
        let exists: i64 =
            sqlx::query_scalar("SELECT COUNT(*) FROM sqlite_master WHERE type = ?1 AND name = ?2")
                .bind(kind)
                .bind(name)
                .fetch_one(pool)
                .await
                .unwrap();
        assert_eq!(exists, 1, "missing {kind} {name}");
    }

    async fn assert_column(pool: &Pool, table: &str, column: &str) {
        let escaped = table.replace('"', "\"\"");
        let sql = format!(r#"PRAGMA table_info("{escaped}")"#);
        let rows: Vec<(i64, String, String, i64, Option<String>, i64)> =
            sqlx::query_as(&sql).fetch_all(pool).await.unwrap();
        assert!(
            rows.iter().any(|(_, name, _, _, _, _)| name == column),
            "missing column {table}.{column}"
        );
    }

    async fn assert_old_fixture_data_survived(pool: &Pool) {
        let title: String = sqlx::query_scalar("SELECT title FROM papers WHERE id = ?1")
            .bind("paper-old-1")
            .fetch_one(pool)
            .await
            .unwrap();
        assert_eq!(title, "Old Library Paper");

        let highlight_count: i64 =
            sqlx::query_scalar("SELECT COUNT(*) FROM highlights WHERE paper_id = ?1")
                .bind("paper-old-1")
                .fetch_one(pool)
                .await
                .unwrap();
        assert_eq!(highlight_count, 1);

        let tag_count: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM paper_tags WHERE paper_id = ?1 AND tag_id = 1",
        )
        .bind("paper-old-1")
        .fetch_one(pool)
        .await
        .unwrap();
        assert_eq!(tag_count, 1);
    }

    async fn assert_latest_tables_work_after_upgrade(pool: &Pool) {
        assert_column(pool, "papers", "comparison").await;
        assert_column(pool, "papers", "bibtex").await;
        assert_column(pool, "highlights", "explanation_text").await;
        assert_table(pool, "smart_collections").await;
        assert_table(pool, "paper_embeddings").await;
        assert_table(pool, "paper_documents").await;
        assert_table(pool, "concepts").await;
        assert_trigger(pool, "papers_au").await;

        let fts_hits: i64 =
            sqlx::query_scalar("SELECT COUNT(*) FROM papers_fts WHERE papers_fts MATCH ?1")
                .bind("retrieval")
                .fetch_one(pool)
                .await
                .unwrap();
        assert_eq!(fts_hits, 1);

        sqlx::query("UPDATE papers SET title = ?1 WHERE id = ?2")
            .bind("Updated Fixture Vector Search")
            .bind("paper-old-1")
            .execute(pool)
            .await
            .unwrap();
        let updated_hits: i64 =
            sqlx::query_scalar("SELECT COUNT(*) FROM papers_fts WHERE papers_fts MATCH ?1")
                .bind("vector")
                .fetch_one(pool)
                .await
                .unwrap();
        assert_eq!(updated_hits, 1);
    }
}
