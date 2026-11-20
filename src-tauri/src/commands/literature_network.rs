use std::{sync::Arc, time::Duration};

use tauri::State;

use crate::literature_network::{self as network, LiteratureNetwork};
use crate::{storage::PaperRepo, AppState};

#[tauri::command]
pub(crate) async fn literature_network(
    state: State<'_, Arc<AppState>>,
    paper_ids: Vec<String>,
) -> Result<LiteratureNetwork, String> {
    require_enabled(&state).await?;
    let repo = PaperRepo::new(&state.pool);
    tokio::time::timeout(
        Duration::from_secs(30),
        network::load(&repo, &state.http, paper_ids),
    )
    .await
    .map_err(|_| "OpenAlex literature network request timed out".to_owned())?
    .map_err(|error| format!("{error:#}"))
}

pub(crate) async fn require_enabled(state: &AppState) -> Result<(), String> {
    let entries = crate::plugin_host::list_plugins(state).await.map_err(|e| e.to_string())?;
    if entries.iter().any(|(manifest, enabled, _)| manifest.id == "literature-network" && *enabled) {
        Ok(())
    } else {
        Err("Literature Network plugin is disabled".into())
    }
}
