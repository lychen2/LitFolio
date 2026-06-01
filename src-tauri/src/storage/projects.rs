//! Research projects: goal-oriented workspaces linking papers and assets.

use anyhow::{anyhow, Context, Result};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use sqlx::Row;

use super::{db::Pool, papers::row_to_paper, Paper};

const PROJECT_STATUSES: &[&str] = &["active", "paused", "archived"];

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResearchProject {
    pub id: i64,
    pub name: String,
    pub description: Option<String>,
    pub research_question: Option<String>,
    pub target_output: Option<String>,
    pub status: String,
    pub due_date: Option<i64>,
    pub paper_count: i64,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectDraft {
    pub name: String,
    pub description: Option<String>,
    pub research_question: Option<String>,
    pub target_output: Option<String>,
    pub status: String,
    pub due_date: Option<i64>,
}

pub struct ProjectRepo<'a> {
    pool: &'a Pool,
}

impl<'a> ProjectRepo<'a> {
    pub fn new(pool: &'a Pool) -> Self {
        Self { pool }
    }

    pub async fn list(&self) -> Result<Vec<ResearchProject>> {
        let rows = sqlx::query(project_select_sql("ORDER BY p.updated_at DESC").as_str())
            .fetch_all(self.pool)
            .await
            .context("list projects")?;
        rows.into_iter().map(row_to_project).collect()
    }

    pub async fn get(&self, id: i64) -> Result<Option<ResearchProject>> {
        let sql = project_select_sql("WHERE p.id = ?1");
        let row = sqlx::query(sql.as_str())
            .bind(id)
            .fetch_optional(self.pool)
            .await
            .context("get project")?;
        row.map(row_to_project).transpose()
    }

    pub async fn create(&self, draft: &ProjectDraft) -> Result<ResearchProject> {
        validate_draft(draft)?;
        let now = Utc::now().timestamp();
        let id = sqlx::query(
            "INSERT INTO research_projects
             (name, description, research_question, target_output, status, due_date, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7)",
        )
        .bind(draft.name.trim())
        .bind(trimmed_optional(draft.description.as_deref()))
        .bind(trimmed_optional(draft.research_question.as_deref()))
        .bind(trimmed_optional(draft.target_output.as_deref()))
        .bind(draft.status.trim())
        .bind(draft.due_date)
        .bind(now)
        .execute(self.pool)
        .await
        .context("create project")?
        .last_insert_rowid();
        self.get(id)
            .await?
            .ok_or_else(|| anyhow!("created project missing"))
    }

    pub async fn update(&self, id: i64, draft: &ProjectDraft) -> Result<()> {
        validate_draft(draft)?;
        let updated_at = Utc::now().timestamp();
        let result = sqlx::query(
            "UPDATE research_projects
             SET name = ?1, description = ?2, research_question = ?3, target_output = ?4,
                 status = ?5, due_date = ?6, updated_at = ?7
             WHERE id = ?8",
        )
        .bind(draft.name.trim())
        .bind(trimmed_optional(draft.description.as_deref()))
        .bind(trimmed_optional(draft.research_question.as_deref()))
        .bind(trimmed_optional(draft.target_output.as_deref()))
        .bind(draft.status.trim())
        .bind(draft.due_date)
        .bind(updated_at)
        .bind(id)
        .execute(self.pool)
        .await
        .context("update project")?;
        ensure_changed(result.rows_affected(), id)
    }

    pub async fn delete(&self, id: i64) -> Result<()> {
        let result = sqlx::query("DELETE FROM research_projects WHERE id = ?1")
            .bind(id)
            .execute(self.pool)
            .await
            .context("delete project")?;
        ensure_changed(result.rows_affected(), id)
    }

    pub async fn list_papers(&self, id: i64) -> Result<Vec<Paper>> {
        let rows = sqlx::query(
            "SELECT p.* FROM papers p
             JOIN project_papers pp ON pp.paper_id = p.id
             WHERE pp.project_id = ?1
             ORDER BY pp.added_at DESC",
        )
        .bind(id)
        .fetch_all(self.pool)
        .await
        .context("list project papers")?;
        rows.into_iter().map(row_to_paper).collect()
    }

    pub async fn add_paper(&self, project_id: i64, paper_id: &str) -> Result<()> {
        let now = Utc::now().timestamp();
        sqlx::query(
            "INSERT OR IGNORE INTO project_papers (project_id, paper_id, added_at)
             VALUES (?1, ?2, ?3)",
        )
        .bind(project_id)
        .bind(paper_id)
        .bind(now)
        .execute(self.pool)
        .await
        .context("add project paper")?;
        self.touch(project_id).await
    }

    pub async fn remove_paper(&self, project_id: i64, paper_id: &str) -> Result<()> {
        sqlx::query("DELETE FROM project_papers WHERE project_id = ?1 AND paper_id = ?2")
            .bind(project_id)
            .bind(paper_id)
            .execute(self.pool)
            .await
            .context("remove project paper")?;
        self.touch(project_id).await
    }

    async fn touch(&self, id: i64) -> Result<()> {
        sqlx::query("UPDATE research_projects SET updated_at = ?1 WHERE id = ?2")
            .bind(Utc::now().timestamp())
            .bind(id)
            .execute(self.pool)
            .await
            .context("touch project")?;
        Ok(())
    }
}

fn project_select_sql(tail: &str) -> String {
    format!(
        "SELECT p.*, COUNT(pp.paper_id) AS paper_count
         FROM research_projects p
         LEFT JOIN project_papers pp ON pp.project_id = p.id
         {tail}
         GROUP BY p.id"
    )
}

fn row_to_project(row: sqlx::sqlite::SqliteRow) -> Result<ResearchProject> {
    Ok(ResearchProject {
        id: row.try_get("id")?,
        name: row.try_get("name")?,
        description: row.try_get("description")?,
        research_question: row.try_get("research_question")?,
        target_output: row.try_get("target_output")?,
        status: row.try_get("status")?,
        due_date: row.try_get("due_date")?,
        paper_count: row.try_get("paper_count").unwrap_or(0),
        created_at: row.try_get("created_at")?,
        updated_at: row.try_get("updated_at")?,
    })
}

fn validate_draft(draft: &ProjectDraft) -> Result<()> {
    if draft.name.trim().is_empty() {
        return Err(anyhow!("project name is required"));
    }
    if !PROJECT_STATUSES.contains(&draft.status.trim()) {
        return Err(anyhow!("invalid project status: {}", draft.status));
    }
    Ok(())
}

fn ensure_changed(rows: u64, id: i64) -> Result<()> {
    if rows == 0 {
        return Err(anyhow!("project {id} not found"));
    }
    Ok(())
}

fn trimmed_optional(value: Option<&str>) -> Option<String> {
    value
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
}
