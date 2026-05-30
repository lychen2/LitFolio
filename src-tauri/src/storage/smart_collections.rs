//! Smart collections: saved filter rules that auto-match papers.

use anyhow::{Context, Result};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use sqlx::Row;

use super::db::Pool;
use super::Paper;

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

        let mut out = Vec::new();
        for r in rows {
            let rules_json: String = r.try_get("rules").unwrap_or_default();
            let rules: FilterRule =
                serde_json::from_str(&rules_json).unwrap_or(FilterRule::Group {
                    combinator: "and".into(),
                    rules: vec![],
                });
            out.push(SmartCollection {
                id: r.try_get("id").unwrap_or(0),
                name: r.try_get("name").unwrap_or_default(),
                rules,
                created_at: r.try_get("created_at").unwrap_or(0),
                updated_at: r.try_get("updated_at").unwrap_or(0),
            });
        }
        Ok(out)
    }

    pub async fn get(&self, id: i64) -> Result<Option<SmartCollection>> {
        let row = sqlx::query(
            "SELECT id, name, rules, created_at, updated_at FROM smart_collections WHERE id = ?1",
        )
        .bind(id)
        .fetch_optional(self.pool)
        .await
        .context("get smart collection")?;

        Ok(row.map(|r| {
            let rules_json: String = r.try_get("rules").unwrap_or_default();
            let rules: FilterRule =
                serde_json::from_str(&rules_json).unwrap_or(FilterRule::Group {
                    combinator: "and".into(),
                    rules: vec![],
                });
            SmartCollection {
                id: r.try_get("id").unwrap_or(0),
                name: r.try_get("name").unwrap_or_default(),
                rules,
                created_at: r.try_get("created_at").unwrap_or(0),
                updated_at: r.try_get("updated_at").unwrap_or(0),
            }
        }))
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
        let (where_clause, params) = build_where_clause(&coll.rules);
        execute_paper_query(self.pool, &where_clause, &params).await
    }
}

// ─── Rule → SQL translation ─────────────────────────────────────────────

struct SqlParam {
    value: String,
}

fn build_where_clause(rule: &FilterRule) -> (String, Vec<String>) {
    let mut params = Vec::new();
    let clause = rule_to_sql(rule, &mut params);
    (clause, params)
}

fn rule_to_sql(rule: &FilterRule, params: &mut Vec<String>) -> String {
    match rule {
        FilterRule::Condition {
            field,
            operator,
            value,
        } => condition_to_sql(field, operator, value, params),
        FilterRule::Group { combinator, rules } => {
            if rules.is_empty() {
                return "1=1".into();
            }
            let joiner = if combinator.to_lowercase() == "or" {
                " OR "
            } else {
                " AND "
            };
            let parts: Vec<String> = rules.iter().map(|r| rule_to_sql(r, params)).collect();
            format!("({})", parts.join(joiner))
        }
    }
}

fn condition_to_sql(
    field: &str,
    operator: &str,
    value: &serde_json::Value,
    params: &mut Vec<String>,
) -> String {
    match field.as_ref() {
        "read_status" => {
            let val = value.as_str().unwrap_or("unread");
            params.push(val.to_string());
            format!("p.read_status = ?{}", params.len())
        }
        "year" => {
            let val = value.as_i64().unwrap_or(0);
            params.push(val.to_string());
            match operator {
                "gt" | ">" => format!("p.year > ?{}", params.len()),
                "lt" | "<" => format!("p.year < ?{}", params.len()),
                "gte" | ">=" => format!("p.year >= ?{}", params.len()),
                "lte" | "<=" => format!("p.year <= ?{}", params.len()),
                _ => {
                    params.push(val.to_string());
                    format!("p.year = ?{}", params.len())
                }
            }
        }
        "title" => {
            let val = value.as_str().unwrap_or("");
            params.push(format!("%{}%", val));
            match operator {
                "contains" => format!("p.title LIKE ?{}", params.len()),
                "not_contains" => format!("p.title NOT LIKE ?{}", params.len()),
                _ => format!("p.title LIKE ?{}", params.len()),
            }
        }
        "tags" => {
            let tag_name = value.as_str().unwrap_or("");
            params.push(tag_name.to_string());
            format!(
                "p.id IN (SELECT pt.paper_id FROM paper_tags pt JOIN tags t ON t.id = pt.tag_id WHERE t.name = ?{})",
                params.len()
            )
        }
        "folders" => {
            let folder_id = value.as_i64().unwrap_or(0);
            params.push(folder_id.to_string());
            format!(
                "p.id IN (SELECT pf.paper_id FROM paper_folders pf WHERE pf.folder_id = ?{})",
                params.len()
            )
        }
        "venue" => {
            let val = value.as_str().unwrap_or("");
            params.push(format!("%{}%", val));
            match operator {
                "contains" => format!("p.venue LIKE ?{}", params.len()),
                _ => format!("p.venue LIKE ?{}", params.len()),
            }
        }
        _ => "1=1".into(),
    }
}

async fn execute_paper_query(
    pool: &Pool,
    where_clause: &str,
    params: &[String],
) -> Result<Vec<Paper>> {
    // Build the full SQL dynamically. We need to bind params sequentially.
    let sql = format!(
        "SELECT p.id, p.title, p.authors_json, p.year, p.venue, p.doi, p.arxiv_id,
                p.abstract_text, p.pdf_path, p.note_path, p.added_at, p.updated_at,
                p.read_status, p.tldr, p.research_question, p.method, p.dataset,
                p.key_findings_json, p.limitations, p.comparison,
                p.title_translated, p.abstract_translated, p.translate_target_lang,
                p.translated_at, p.bibtex, p.last_exported_at
         FROM papers p
         WHERE {}
         ORDER BY p.updated_at DESC",
        where_clause
    );

    let mut query = sqlx::query(&sql);
    for param in params {
        query = query.bind(param);
    }

    let rows = query
        .fetch_all(pool)
        .await
        .context("query smart collection papers")?;

    let mut papers = Vec::new();
    for r in rows {
        papers.push(super::papers::row_to_paper(r)?);
    }
    Ok(papers)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rule_serialization_roundtrip() {
        let rule = FilterRule::Group {
            combinator: "and".into(),
            rules: vec![
                FilterRule::Condition {
                    field: "read_status".into(),
                    operator: "equals".into(),
                    value: serde_json::json!("unread"),
                },
                FilterRule::Condition {
                    field: "year".into(),
                    operator: "gte".into(),
                    value: serde_json::json!(2024),
                },
            ],
        };
        let json = serde_json::to_string(&rule).unwrap();
        let back: FilterRule = serde_json::from_str(&json).unwrap();
        match back {
            FilterRule::Group { combinator, rules } => {
                assert_eq!(combinator, "and");
                assert_eq!(rules.len(), 2);
            }
            _ => panic!("expected group"),
        }
    }

    #[test]
    fn build_where_simple_condition() {
        let rule = FilterRule::Condition {
            field: "read_status".into(),
            operator: "equals".into(),
            value: serde_json::json!("unread"),
        };
        let (clause, params) = build_where_clause(&rule);
        assert!(clause.contains("read_status"));
        assert_eq!(params, vec!["unread"]);
    }

    #[test]
    fn build_where_group() {
        let rule = FilterRule::Group {
            combinator: "and".into(),
            rules: vec![
                FilterRule::Condition {
                    field: "year".into(),
                    operator: "gte".into(),
                    value: serde_json::json!(2024),
                },
                FilterRule::Condition {
                    field: "title".into(),
                    operator: "contains".into(),
                    value: serde_json::json!("transformer"),
                },
            ],
        };
        let (clause, params) = build_where_clause(&rule);
        assert!(clause.contains("AND"));
        assert_eq!(params.len(), 2);
    }
}
