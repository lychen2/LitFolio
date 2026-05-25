//! IPC command: `topic_survey` — orchestrates Phase 1 (plan_survey) → Phase 2
//! (ground_survey) → Phase 3 (annotate_survey, optional) and flattens the
//! result into the wire shape the frontend consumes.
//!
//! Progress events are emitted at phase boundaries on the channel
//! `topic-survey-progress`. Per-subarea progress during grounding is left out
//! of MVP — the whole grounding call is one event.

use std::collections::HashMap;
use std::sync::Arc;

use serde::Serialize;
use serde_json::json;
use tauri::{AppHandle, Emitter, State};

use crate::ai::{
    active_profile_for_task, annotate_survey, load_config, plan_survey, AnnotateInputPaper,
    LlmConfig, PiHint, SurveyAnnotation, SurveySkeleton, TaskKind,
};
use crate::ingest::{ground_survey, GroundedSubarea};
use crate::AppState;

#[derive(Debug, Clone, Serialize)]
pub struct TopicSurvey {
    pub topic: String,
    pub subareas: Vec<SurveySubareaResult>,
    pub key_pis: Vec<PiHint>,
    pub must_read_ids: Vec<String>,
    pub annotated: bool,
    pub plan_model: String,
    pub plan_tokens: u32,
    pub annotate_model: Option<String>,
    pub annotate_tokens: u32,
}

#[derive(Debug, Clone, Serialize)]
pub struct SurveySubareaResult {
    pub name: String,
    pub year_range: Option<(i32, i32)>,
    pub summary: String,
    pub search_terms: Vec<String>,
    pub papers: Vec<SurveyPaper>,
}

#[derive(Debug, Clone, Serialize)]
pub struct SurveyPaper {
    pub id: String,
    pub title: String,
    pub authors: Vec<String>,
    pub year: Option<i32>,
    pub venue: Option<String>,
    pub doi: Option<String>,
    pub arxiv_id: Option<String>,
    pub abstract_text: Option<String>,
    pub citation_count: Option<u32>,
    pub influential_citation_count: Option<u32>,
    pub why_important: Option<String>,
    pub must_read: bool,
}

const DEFAULT_TOPK: usize = 6;

#[tauri::command]
pub async fn topic_survey(
    app: AppHandle,
    state: State<'_, Arc<AppState>>,
    topic: String,
    annotate: Option<bool>,
    per_subarea_topk: Option<u32>,
) -> Result<TopicSurvey, String> {
    let want_annotate = annotate.unwrap_or(true);
    let topk = per_subarea_topk.map(|n| n as usize).unwrap_or(DEFAULT_TOPK);

    let cfg = load_config(&state.paths).map_err(|e| survey_error("读取 LLM 配置", "未解析", e))?;
    let prof = active_profile_for_task(&cfg, TaskKind::TopicSurvey)
        .map_err(|e| survey_error("选择综述模型", "未解析", e))?;
    let profile_label = format!("{} / {}", prof.name, prof.chat_model);

    let _ = app.emit("topic-survey-progress", json!({ "phase": "planning" }));
    let skeleton = plan_survey(&state.http, &prof, &topic)
        .await
        .map_err(|e| survey_error("规划领域结构", &profile_label, e))?;

    let _ = app.emit(
        "topic-survey-progress",
        json!({
            "phase": "grounding",
            "subarea_total": skeleton.subareas.len(),
        }),
    );
    let grounded = ground_survey(&state.http, &skeleton, topk)
        .await
        .map_err(|e| survey_error("Semantic Scholar 检索", &profile_label, e))?;

    let annotation = if want_annotate {
        let _ = app.emit("topic-survey-progress", json!({ "phase": "annotating" }));
        try_annotate(&state.http, &cfg, &grounded).await
    } else {
        None
    };

    let _ = app.emit("topic-survey-progress", json!({ "phase": "done" }));
    Ok(assemble(&topic, skeleton, grounded, annotation))
}

fn survey_error(stage: &str, profile_label: &str, err: anyhow::Error) -> String {
    let chain = err
        .chain()
        .map(|e| e.to_string())
        .collect::<Vec<_>>()
        .join(" | ");
    tracing::error!(
        stage = stage,
        model = profile_label,
        error = chain,
        "topic survey failed"
    );
    format!("综述生成失败\n阶段: {stage}\n模型: {profile_label}\n原因: {chain}")
}

/// Annotation is best-effort: a missing profile or a failed LLM call must not
/// fail the whole survey, since the un-annotated survey is still useful.
async fn try_annotate(
    http: &reqwest::Client,
    cfg: &LlmConfig,
    grounded: &[GroundedSubarea],
) -> Option<SurveyAnnotation> {
    let prof = match active_profile_for_task(cfg, TaskKind::TopicSurvey) {
        Ok(p) => p,
        Err(e) => {
            tracing::warn!("topic_survey: skipping annotation — profile missing: {e}");
            return None;
        }
    };
    let input: Vec<(String, Vec<AnnotateInputPaper>)> = grounded
        .iter()
        .map(|g| {
            let papers: Vec<AnnotateInputPaper> = g
                .papers
                .iter()
                .filter_map(|p| {
                    // Annotation key MUST match the SurveyPaper.id we emit downstream
                    // (same paper_id-or-"doi:"-fallback rule).
                    let id = paper_identity(p)?;
                    Some(AnnotateInputPaper {
                        id,
                        title: p.draft.title.clone(),
                        year: p.draft.year,
                        abstract_text: p.draft.abstract_text.clone(),
                    })
                })
                .collect();
            (g.spec.name.clone(), papers)
        })
        .collect();
    if !input.iter().any(|(_, ps)| !ps.is_empty()) {
        return None;
    }
    match annotate_survey(http, &prof, &input).await {
        Ok(a) => Some(a),
        Err(e) => {
            tracing::warn!("topic_survey: annotation LLM call failed, shipping un-annotated: {e}");
            None
        }
    }
}

fn assemble(
    topic: &str,
    skeleton: SurveySkeleton,
    grounded: Vec<GroundedSubarea>,
    annotation: Option<SurveyAnnotation>,
) -> TopicSurvey {
    let (annotated, annotate_model, annotate_tokens, paper_notes, must_read_ids) = match annotation
    {
        Some(a) => (
            true,
            Some(a.model),
            a.prompt_tokens.saturating_add(a.completion_tokens),
            a.paper_notes,
            a.must_read_ids,
        ),
        None => (false, None, 0, HashMap::new(), Vec::new()),
    };

    let subareas: Vec<SurveySubareaResult> = grounded
        .into_iter()
        .map(|g| {
            let papers: Vec<SurveyPaper> = g
                .papers
                .into_iter()
                .filter_map(|h| {
                    let id = paper_identity(&h)?;
                    let note = paper_notes.get(&id);
                    Some(SurveyPaper {
                        id,
                        title: h.draft.title,
                        authors: h.draft.authors,
                        year: h.draft.year,
                        venue: h.draft.venue,
                        doi: h.draft.doi,
                        arxiv_id: h.draft.arxiv_id,
                        abstract_text: h.draft.abstract_text,
                        citation_count: h.citation_count,
                        influential_citation_count: h.influential_citation_count,
                        why_important: note
                            .map(|n| n.why_important.clone())
                            .filter(|s| !s.is_empty()),
                        must_read: note.map(|n| n.must_read).unwrap_or(false),
                    })
                })
                .collect();
            SurveySubareaResult {
                name: g.spec.name,
                year_range: g.spec.year_range,
                summary: g.spec.summary,
                search_terms: g.spec.search_terms,
                papers,
            }
        })
        .collect();

    TopicSurvey {
        topic: topic.into(),
        subareas,
        key_pis: skeleton.key_pis,
        must_read_ids,
        annotated,
        plan_model: skeleton.model,
        plan_tokens: skeleton
            .prompt_tokens
            .saturating_add(skeleton.completion_tokens),
        annotate_model,
        annotate_tokens,
    }
}

fn paper_identity(h: &crate::ingest::SearchResult) -> Option<String> {
    if let Some(id) = &h.paper_id {
        if !id.is_empty() {
            return Some(id.clone());
        }
    }
    if let Some(doi) = &h.draft.doi {
        if !doi.is_empty() {
            return Some(format!("doi:{doi}"));
        }
    }
    None
}
