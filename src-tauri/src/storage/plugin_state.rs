//! Persisted plugin host state (migration 0043).
//!
//! The host owns enable/disable authority; rows record the durable decision
//! and the monotonic per-plugin generation used to stale-out old bindings.

use anyhow::Result;
use sqlx::Row;

use super::Pool;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PluginStateRow {
    pub plugin_id: String,
    pub enabled: bool,
    pub generation: i64,
}

pub struct PluginStateRepo<'a> {
    pool: &'a Pool,
}

impl<'a> PluginStateRepo<'a> {
    pub fn new(pool: &'a Pool) -> Self {
        Self { pool }
    }

    pub async fn list(&self) -> Result<Vec<PluginStateRow>> {
        let rows = sqlx::query(
            "SELECT plugin_id, enabled, generation FROM plugin_state ORDER BY plugin_id",
        )
        .fetch_all(self.pool)
        .await?;
        Ok(rows
            .into_iter()
            .map(|r| PluginStateRow {
                plugin_id: r.get("plugin_id"),
                enabled: r.get::<i64, _>("enabled") != 0,
                generation: r.get("generation"),
            })
            .collect())
    }

    /// Mark enabled and bump the generation. Returns the new generation —
    /// durable before any binding is issued.
    pub async fn enable(&self, plugin_id: &str) -> Result<i64> {
        let row = sqlx::query(
            "INSERT INTO plugin_state (plugin_id, enabled, generation, updated_at)
             VALUES (?1, 1, 1, unixepoch())
             ON CONFLICT(plugin_id) DO UPDATE SET
                enabled = 1,
                generation = plugin_state.generation + 1,
                updated_at = excluded.updated_at
             RETURNING generation",
        )
        .bind(plugin_id)
        .fetch_one(self.pool)
        .await?;
        Ok(row.get("generation"))
    }

    pub async fn disable(&self, plugin_id: &str) -> Result<()> {
        sqlx::query(
            "UPDATE plugin_state SET enabled = 0, updated_at = unixepoch() WHERE plugin_id = ?1",
        )
        .bind(plugin_id)
        .execute(self.pool)
        .await?;
        Ok(())
    }
}
