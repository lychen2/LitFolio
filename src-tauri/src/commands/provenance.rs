//! Provenance IPC commands: accepted document revisions, source segments,
//! source links/snapshots, indexed backlinks, revision-safe note saves,
//! deterministic backfill/remap, and provenance export.

use serde::Serialize;
use std::sync::Arc;

use tauri::State;

use crate::storage::{
    BackfillReport, DocumentCandidate, DocumentRevision, NoteRevision, NoteSaveResult, Pool,
    ProvenanceError, ProvenanceExport, ProvenanceRepo, RemapReport, SourceLink, SourceSegment,
};
use crate::AppState;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceLinkResolution {
    pub status: String,
    pub link: SourceLink,
}

async fn selected_paper_ids(
    pool: &Pool,
    paper_id: Option<String>,
) -> Result<Vec<String>, ProvenanceError> {
    match paper_id {
        Some(paper_id) => Ok(vec![paper_id]),
        None => sqlx::query_scalar::<_, String>("SELECT id FROM papers ORDER BY id")
            .fetch_all(pool)
            .await
            .map_err(ProvenanceError::from),
    }
}

#[tauri::command]
pub async fn document_candidate_stage(
    state: State<'_, Arc<AppState>>,
    candidate: DocumentCandidate,
) -> Result<DocumentCandidate, ProvenanceError> {
    ProvenanceRepo::new(&state.pool).validate_candidate(&candidate)?;
    Ok(candidate)
}

#[tauri::command]
pub async fn document_accept(
    state: State<'_, Arc<AppState>>,
    paper_id: String,
    candidate: DocumentCandidate,
) -> Result<DocumentRevision, ProvenanceError> {
    ProvenanceRepo::new(&state.pool)
        .accept_candidate(&state.paths, &paper_id, &candidate)
        .await
}

#[tauri::command]
pub async fn document_revisions_list(
    state: State<'_, Arc<AppState>>,
    paper_id: String,
) -> Result<Vec<DocumentRevision>, ProvenanceError> {
    ProvenanceRepo::new(&state.pool)
        .revisions_list(&paper_id)
        .await
}

#[tauri::command]
pub async fn source_segment_list(
    state: State<'_, Arc<AppState>>,
    paper_id: String,
    revision_id: Option<String>,
) -> Result<Vec<SourceSegment>, ProvenanceError> {
    let repo = ProvenanceRepo::new(&state.pool);
    match revision_id {
        Some(revision_id) => repo.segments_for_revision(&revision_id).await,
        None => match repo.active_revision(&paper_id).await? {
            Some(revision) => repo.segments_for_revision(&revision.revision_id).await,
            None => Ok(Vec::new()),
        },
    }
}

#[tauri::command]
pub async fn source_link_create(
    state: State<'_, Arc<AppState>>,
    paper_id: String,
    anchor_domain: String,
    anchor_id: String,
    segment_id: String,
) -> Result<SourceLink, ProvenanceError> {
    ProvenanceRepo::new(&state.pool)
        .link_create(&paper_id, &anchor_domain, &anchor_id, &segment_id)
        .await
}

#[tauri::command]
pub async fn source_link_resolve(
    state: State<'_, Arc<AppState>>,
    link_id: String,
) -> Result<SourceLinkResolution, ProvenanceError> {
    let repo = ProvenanceRepo::new(&state.pool);
    let mut link = repo
        .get_link(&link_id)
        .await?
        .ok_or(ProvenanceError::SnapshotMissing)?;
    let (status, resolved_revision_id, resolved_segment_id) =
        repo.resolve_link_target(&link).await?;
    link.resolution = status.clone();
    link.resolved_revision_id = resolved_revision_id;
    link.resolved_segment_id = resolved_segment_id;
    Ok(SourceLinkResolution { status, link })
}

#[tauri::command]
pub async fn source_link_list_for_anchor(
    state: State<'_, Arc<AppState>>,
    anchor_domain: String,
    anchor_id: String,
) -> Result<Vec<SourceLink>, ProvenanceError> {
    ProvenanceRepo::new(&state.pool)
        .links_for_anchor(&anchor_domain, &anchor_id)
        .await
}

#[tauri::command]
pub async fn backlinks_list(
    state: State<'_, Arc<AppState>>,
    paper_id: String,
    segment_id: Option<String>,
) -> Result<Vec<crate::storage::BacklinkRow>, ProvenanceError> {
    ProvenanceRepo::new(&state.pool)
        .backlinks(&paper_id, segment_id.as_deref())
        .await
}

#[tauri::command]
pub async fn note_revisions_list(
    state: State<'_, Arc<AppState>>,
    paper_id: String,
) -> Result<Vec<NoteRevision>, ProvenanceError> {
    ProvenanceRepo::new(&state.pool)
        .note_revisions(&paper_id)
        .await
}

#[tauri::command]
pub async fn provenance_backfill(
    state: State<'_, Arc<AppState>>,
    paper_id: Option<String>,
) -> Result<BackfillReport, ProvenanceError> {
    let repo = ProvenanceRepo::new(&state.pool);
    let paper_ids = selected_paper_ids(&state.pool, paper_id).await?;
    let mut papers = Vec::with_capacity(paper_ids.len());
    for id in paper_ids {
        papers.push(repo.backfill(&state.paths, &id).await?);
    }
    Ok(BackfillReport {
        schema_version: crate::storage::PROVENANCE_SCHEMA_VERSION,
        total_papers: papers.len() as i64,
        created_revisions: papers.iter().filter(|paper| paper.created).count() as i64,
        papers,
    })
}

#[tauri::command]
pub async fn provenance_remap(
    state: State<'_, Arc<AppState>>,
    paper_id: Option<String>,
) -> Result<RemapReport, ProvenanceError> {
    let repo = ProvenanceRepo::new(&state.pool);
    let paper_ids = selected_paper_ids(&state.pool, paper_id).await?;
    let mut links_recomputed = 0i64;
    let mut changed = 0i64;
    for id in &paper_ids {
        let report = repo.remap(id).await?;
        links_recomputed += report.links_recomputed;
        changed += report.changed;
    }
    Ok(RemapReport {
        schema_version: crate::storage::PROVENANCE_SCHEMA_VERSION,
        paper_ids,
        links_recomputed,
        changed,
    })
}

#[tauri::command]
pub async fn provenance_export(
    state: State<'_, Arc<AppState>>,
    paper_id: Option<String>,
) -> Result<ProvenanceExport, ProvenanceError> {
    let paper_ids = selected_paper_ids(&state.pool, paper_id).await?;
    ProvenanceRepo::new(&state.pool).export(&paper_ids).await
}

#[tauri::command]
pub async fn note_save_provenance(
    state: State<'_, Arc<AppState>>,
    paper_id: String,
    content: String,
    expected_revision: Option<i64>,
) -> Result<NoteSaveResult, ProvenanceError> {
    ProvenanceRepo::new(&state.pool)
        .note_save(&state.paths, &paper_id, &content, expected_revision)
        .await
}
