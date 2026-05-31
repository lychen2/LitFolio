//! Smart collections: saved filter rules that auto-match papers.

use anyhow::{Context, Result};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use sqlx::Row;

use super::db::Pool;
use super::Paper;

mod query;
#[cfg(test)]
mod tests;

use query::{build_where_clause, execute_paper_query};

/// A smart collection with its serialized rule tree.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SmartCollection {
    pub id: i64,
    pub name: String,
    pub rules: FilterRule,
    pub created_at: i64,
    pub updated_at: i64,
}

/// Rule tree: either a leaf condition or a group with a combinator.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum FilterRule {
    #[serde(rename = "condition")]
    Condition {
        field: String,
        operator: String,
        value: serde_json::Value,
    },
    #[serde(rename = "group")]
    Group {
        combinator: String,
        rules: Vec<FilterRule>,
    },
}

pub struct SmartCollectionRepo<'a> {
    pool: &'a Pool,
}

impl<'a> SmartCollectionRepo<'a> {
    pub fn new(pool: &'a Pool) -> Self {
        Self { pool }
    }

    pub async fn list(&self) -> Result<Vec<SmartCollection>> {
        let rows = sqlx::query(
            "SELECT id, name, rules, created_at, updated_at FROM smart_collections ORDER BY name",
        )
        .fetch_all(self.pool)
        .await
        .context("list smart collections")?;

        rows.into_iter().map(row_to_collection).collect()
    }

    pub async fn get(&self, id: i64) -> Result<Option<SmartCollection>> {
        let row = sqlx::query(
            "SELECT id, name, rules, created_at, updated_at FROM smart_collections WHERE id = ?1",
        )
        .bind(id)
        .fetch_optional(self.pool)
        .await
        .context("get smart collection")?;

        row.map(row_to_collection).transpose()
    }

    pub async fn create(&self, name: &str, rules: &FilterRule) -> Result<i64> {
        let now = Utc::now().timestamp();
        let rules_json = serde_json::to_string(rules)?;
        let id = sqlx::query(
            "INSERT INTO smart_collections (name, rules, created_at, updated_at) VALUES (?1, ?2, ?3, ?4)",
        )
        .bind(name)
        .bind(&rules_json)
        .bind(now)
        .bind(now)
        .execute(self.pool)
        .await
        .context("create smart collection")?
        .last_insert_rowid();
        Ok(id)
    }

    pub async fn update(&self, id: i64, name: &str, rules: &FilterRule) -> Result<()> {
        let now = Utc::now().timestamp();
        let rules_json = serde_json::to_string(rules)?;
        sqlx::query(
            "UPDATE smart_collections SET name = ?1, rules = ?2, updated_at = ?3 WHERE id = ?4",
        )
        .bind(name)
        .bind(&rules_json)
        .bind(now)
        .bind(id)
        .execute(self.pool)
        .await
        .context("update smart collection")?;
        Ok(())
    }

    pub async fn delete(&self, id: i64) -> Result<()> {
        sqlx::query("DELETE FROM smart_collections WHERE id = ?1")
            .bind(id)
            .execute(self.pool)
            .await
            .context("delete smart collection")?;
        Ok(())
    }

    /// Query papers matching the smart collection's rules.
    pub async fn query_papers(&self, id: i64) -> Result<Vec<Paper>> {
        let coll = self
            .get(id)
            .await?
            .ok_or_else(|| anyhow::anyhow!("smart collection not found: {}", id))?;
        let (where_clause, params) = build_where_clause(&coll.rules)?;
        execute_paper_query(self.pool, &where_clause, &params).await
    }
}

fn row_to_collection(row: sqlx::sqlite::SqliteRow) -> Result<SmartCollection> {
    let rules_json: String = row.try_get("rules")?;
    let rules = serde_json::from_str(&rules_json).context("parse smart collection rules")?;
    Ok(SmartCollection {
        id: row.try_get("id")?,
        name: row.try_get("name")?,
        rules,
        created_at: row.try_get("created_at")?,
        updated_at: row.try_get("updated_at")?,
    })
}
