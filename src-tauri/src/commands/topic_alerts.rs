//! Topic alert IPC commands.

use std::sync::Arc;

use tauri::State;

use crate::ingest::{search_semantic_scholar, SearchResult};
use crate::storage::{TopicAlert, TopicAlertRepo, TopicAlertResult, TopicAlertResultInsert};
use crate::AppState;

#[tauri::command]
pub async fn topic_alerts_list(state: State<'_, Arc<AppState>>) -> Result<Vec<TopicAlert>, String> {
    TopicAlertRepo::new(&state.pool)
        .list()
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn topic_alert_create(
    state: State<'_, Arc<AppState>>,
    query: String,
    frequency: String,
    target_folder_id: Option<i64>,
    auto_import: bool,
) -> Result<i64, String> {
    TopicAlertRepo::new(&state.pool)
        .create(&query, &frequency, target_folder_id, auto_import)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn topic_alert_delete(state: State<'_, Arc<AppState>>, id: i64) -> Result<(), String> {
    TopicAlertRepo::new(&state.pool)
        .delete(id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn topic_alert_results_list(
    state: State<'_, Arc<AppState>>,
    alert_id: i64,
    unseen_only: Option<bool>,
) -> Result<Vec<TopicAlertResult>, String> {
    TopicAlertRepo::new(&state.pool)
        .list_results(alert_id, unseen_only.unwrap_or(false))
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn topic_alert_result_mark_seen(
    state: State<'_, Arc<AppState>>,
    result_id: i64,
) -> Result<(), String> {
    TopicAlertRepo::new(&state.pool)
        .mark_seen(result_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn topic_alert_mark_all_seen(
    state: State<'_, Arc<AppState>>,
    alert_id: i64,
) -> Result<(), String> {
    TopicAlertRepo::new(&state.pool)
        .mark_all_seen(alert_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn topic_alert_unseen_count(state: State<'_, Arc<AppState>>) -> Result<i64, String> {
    TopicAlertRepo::new(&state.pool)
        .unseen_count()
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn topic_alert_run(
    state: State<'_, Arc<AppState>>,
    alert_id: i64,
) -> Result<usize, String> {
    let repo = TopicAlertRepo::new(&state.pool);
    let alerts = repo.list().await.map_err(|e| e.to_string())?;
    let alert = alerts
        .into_iter()
        .find(|a| a.id == alert_id)
        .ok_or_else(|| "alert not found".to_string())?;

    let results = search_semantic_scholar(&state.http, &alert.query, 20)
        .await
        .map_err(|e| e.to_string())?;

    let added = add_alert_results(&repo, alert_id, &results).await?;

    repo.update_last_run(alert_id)
        .await
        .map_err(|e| e.to_string())?;
    Ok(added)
}

#[tauri::command]
pub async fn topic_alert_run_all(state: State<'_, Arc<AppState>>) -> Result<usize, String> {
    let repo = TopicAlertRepo::new(&state.pool);
    let pending = repo.pending_alerts().await.map_err(|e| e.to_string())?;
    let mut total_added = 0usize;

    for alert in pending {
        let results = search_semantic_scholar(&state.http, &alert.query, 20)
            .await
            .map_err(|e| format!("run alert {}: {e}", alert.id))?;

        total_added += add_alert_results(&repo, alert.id, &results).await?;
        repo.update_last_run(alert.id)
            .await
            .map_err(|e| format!("update alert {} last_run_at: {e}", alert.id))?;
    }

    Ok(total_added)
}

async fn add_alert_results(
    repo: &TopicAlertRepo<'_>,
    alert_id: i64,
    results: &[SearchResult],
) -> Result<usize, String> {
    let mut added = 0usize;
    for result in results {
        let doi = result.draft.doi.as_deref();
        let arxiv_id = result.draft.arxiv_id.as_deref();
        if repo
            .result_exists(doi, arxiv_id)
            .await
            .map_err(|e| format!("check alert {alert_id} duplicate result: {e}"))?
        {
            continue;
        }
        let authors = result.draft.authors.join(", ");
        let insert = TopicAlertResultInsert {
            alert_id,
            paper_doi: doi,
            paper_arxiv_id: arxiv_id,
            title: &result.draft.title,
            authors: Some(&authors),
            year: result.draft.year,
            abstract_text: result.draft.abstract_text.as_deref(),
        };
        repo.add_result(&insert)
            .await
            .map_err(|e| format!("add alert {alert_id} result '{}': {e}", result.draft.title))?;
        added += 1;
    }
    Ok(added)
}
