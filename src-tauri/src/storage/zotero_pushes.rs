//! Push state queries against the zotero_pushes table.

use anyhow::Result;
use sqlx::SqlitePool;

pub async fn get_pushed_at(pool: &SqlitePool, paper_id: &str) -> Result<Option<i64>> {
    sqlx::query_scalar("SELECT pushed_at FROM zotero_pushes WHERE paper_id = ?1")
        .bind(paper_id)
        .fetch_optional(pool)
        .await
        .map_err(Into::into)
}

pub async fn record_push(pool: &SqlitePool, paper_id: &str, pushed_at: i64) -> Result<()> {
    sqlx::query(
        "INSERT INTO zotero_pushes (paper_id, pushed_at) VALUES (?1, ?2)
         ON CONFLICT(paper_id) DO UPDATE SET pushed_at = excluded.pushed_at",
    )
    .bind(paper_id)
    .bind(pushed_at)
    .execute(pool)
    .await?;
    Ok(())
}
