mod explain;
mod terms;
mod translate;

use std::sync::Arc;

use anyhow::{anyhow, Result};
use chrono::Utc;
use tauri::State;

use crate::ai::{
    active_reading_profile, chat_complete_for_task, estimate_markdown_translation,
    freeze_reading_context, load_config, translate_markdown_text, ChatMessage, LlmProfile,
    MarkdownTranslationEstimate, MarkdownTranslationResult, ReadingContextEnvelope,
    ReadingContextRequest, SelectionContext, TaskKind, MARKDOWN_CHUNK_CHARS,
};
use crate::commands::ai_dispatch::run_reading_dispatch;
use crate::storage::{
    Highlight, HighlightRepo, HighlightSummaryUpdate, HighlightTranslationUpdate, Paper, PaperRepo,
    PaperTermRepo,
};
use crate::AppState;

use self::terms::build_term_insights;
pub use translate::ReaderTranslateResult;
use translate::{translate_selection, TranslateSelectionInput};

#[derive(Debug, Clone, serde::Serialize)]
pub struct ReaderMarkdownTranslationResult {
    pub markdown: String,
    pub target_lang: String,
    pub model: String,
    pub prompt_tokens: u32,
    pub completion_tokens: u32,
    pub cached: bool,
}

impl From<MarkdownTranslationResult> for ReaderMarkdownTranslationResult {
    fn from(result: MarkdownTranslationResult) -> Self {
        Self {
            markdown: result.markdown,
            target_lang: result.target_lang,
            model: result.model,
            prompt_tokens: result.prompt_tokens,
            completion_tokens: result.completion_tokens,
            cached: false,
        }
    }
}

const MAX_SELECTION_CHARS: usize = 2_000;
const MIN_SUMMARY_CHARS: usize = 240;

/// Freeze the reading context for a Reader action. The paper was already
/// loaded from storage (existence + ownership verified); the active accepted
/// revision supplies provenance when present.
async fn freeze_reader_context(
    state: &AppState,
    request: &ReadingContextRequest,
    title: &str,
    abstract_text: Option<&str>,
) -> Result<ReadingContextEnvelope, String> {
    let provenance = crate::storage::ProvenanceRepo::new(&state.pool);
    let active_revision = provenance
        .active_revision(&request.paper_id)
        .await
        .map_err(|e| e.to_string())?;
    freeze_reading_context(
        &request.paper_id,
        title,
        abstract_text,
        None,
        active_revision.as_ref(),
        request,
    )
    .map_err(|e| format!("{}: {}", e.category(), e))
}

#[tauri::command]
pub async fn reader_translate_selection(
    state: State<'_, Arc<AppState>>,
    paper_id: String,
    selection: String,
    target_lang: Option<String>,
) -> Result<ReaderTranslateResult, String> {
    let text = selection.trim();
    if text.is_empty() {
        return Err("empty selection".into());
    }
    let repo = PaperRepo::new(&state.pool);
    let term_repo = PaperTermRepo::new(&state.pool);
    let paper = load_paper(&repo, &paper_id)
        .await
        .map_err(|e| e.to_string())?;
    let clipped = truncate(text, MAX_SELECTION_CHARS);
    let terms = build_term_insights(&repo, &term_repo, &paper, &clipped)
        .await
        .map_err(|e| e.to_string())?;
    let cfg = load_config(&state.paths).map_err(|e| e.to_string())?;
    let profile = active_reading_profile(&cfg).map_err(|e| e.to_string())?;
    let lang = target_lang.unwrap_or_else(|| "Chinese".to_string());

    let envelope = freeze_reader_context(
        &state,
        &ReadingContextRequest {
            paper_id: paper_id.clone(),
            selection: Some(SelectionContext {
                text: clipped.clone(),
                page: None,
            }),
            highlight_id: None,
            revision_id: None,
            max_body_chars: None,
        },
        &paper.title,
        paper.abstract_text.as_deref(),
    )
    .await?;

    run_reading_dispatch(
        &state,
        "reader_translate_selection",
        &paper_id,
        &profile.name,
        &profile.chat_model,
        &envelope,
        async {
            translate_selection(TranslateSelectionInput {
                client: &state.http,
                profile: &profile,
                paper: &paper,
                selection: &clipped,
                terms: &terms,
                target_lang: &lang,
            })
            .await
        },
    )
    .await
}

#[tauri::command]
pub async fn paper_translated_markdown_get(
    state: State<'_, Arc<AppState>>,
    paper_id: String,
    target_lang: Option<String>,
) -> Result<Option<ReaderMarkdownTranslationResult>, String> {
    let cfg = load_config(&state.paths).map_err(|e| e.to_string())?;
    let lang = target_lang.unwrap_or(cfg.output_language);
    let repo = PaperRepo::new(&state.pool);
    load_paper(&repo, &paper_id)
        .await
        .map_err(|e| e.to_string())?;
    let Some(source) = state.paths.read_pdf_text(&paper_id) else {
        return Ok(None);
    };
    Ok(state
        .paths
        .read_translated_paper_markdown_cache(&paper_id, &lang, &source)
        .map(|cache| ReaderMarkdownTranslationResult {
            markdown: cache.markdown,
            target_lang: lang,
            model: cache.model,
            prompt_tokens: 0,
            completion_tokens: 0,
            cached: true,
        }))
}

/// Read the paper's original Markdown body with no AI or network involvement.
/// Prepared reader originals take precedence over retained extraction caches.
/// When neither exists, local PDF extraction caches its result through
/// [`crate::commands::summaries::load_or_extract_pdf_body`].
#[tauri::command]
pub async fn paper_markdown_get(
    state: State<'_, Arc<AppState>>,
    paper_id: String,
) -> Result<Option<String>, String> {
    paper_markdown_get_impl(state.inner().as_ref(), &paper_id).await
}

async fn paper_markdown_get_impl(
    state: &AppState,
    paper_id: &str,
) -> Result<Option<String>, String> {
    let repo = PaperRepo::new(&state.pool);
    let paper = load_paper(&repo, paper_id)
        .await
        .map_err(|e| e.to_string())?;
    Ok(crate::commands::summaries::load_or_extract_pdf_body(
        &state.paths,
        paper_id,
        paper.pdf_path.as_deref(),
    )
    .await)
}

#[tauri::command]
pub async fn paper_translate_markdown_estimate(
    state: State<'_, Arc<AppState>>,
    paper_id: String,
) -> Result<Option<MarkdownTranslationEstimate>, String> {
    let repo = PaperRepo::new(&state.pool);
    let paper = load_paper(&repo, &paper_id)
        .await
        .map_err(|e| e.to_string())?;
    let Some(body) = crate::commands::summaries::load_or_extract_pdf_body(
        &state.paths,
        &paper_id,
        paper.pdf_path.as_deref(),
    )
    .await
    else {
        return Ok(None);
    };
    Ok(Some(estimate_markdown_translation(
        &body,
        MARKDOWN_CHUNK_CHARS,
    )))
}

#[tauri::command]
pub async fn paper_translate_markdown(
    state: State<'_, Arc<AppState>>,
    paper_id: String,
    target_lang: Option<String>,
) -> Result<ReaderMarkdownTranslationResult, String> {
    let cfg = load_config(&state.paths).map_err(|e| e.to_string())?;
    let profile = active_reading_profile(&cfg)
        .map_err(|e| e.to_string())?
        .clone();
    let lang = target_lang.unwrap_or(cfg.output_language);
    let repo = PaperRepo::new(&state.pool);
    let paper = load_paper(&repo, &paper_id)
        .await
        .map_err(|e| e.to_string())?;
    let body = crate::commands::summaries::load_or_extract_pdf_body(
        &state.paths,
        &paper_id,
        paper.pdf_path.as_deref(),
    )
    .await
    .ok_or_else(|| "paper markdown is not available".to_string())?;

    let envelope = freeze_reader_context(
        &state,
        &ReadingContextRequest {
            paper_id: paper_id.clone(),
            selection: None,
            highlight_id: None,
            revision_id: None,
            max_body_chars: None,
        },
        &paper.title,
        paper.abstract_text.as_deref(),
    )
    .await?;

    let result = run_reading_dispatch(
        &state,
        "paper_translate_markdown",
        &paper_id,
        &profile.name,
        &profile.chat_model,
        &envelope,
        translate_markdown_text(&state.http, &profile, &paper.title, &body, &lang),
    )
    .await?;
    state
        .paths
        .write_translated_paper_markdown(
            &paper_id,
            &lang,
            &result.markdown,
            &body,
            &result.model,
            Utc::now().timestamp(),
        )
        .map_err(|e| e.to_string())?;
    Ok(ReaderMarkdownTranslationResult::from(result))
}

#[tauri::command]
pub async fn highlight_translate(
    state: State<'_, Arc<AppState>>,
    highlight_id: String,
    target_lang: Option<String>,
) -> Result<Highlight, String> {
    let highlight_repo = HighlightRepo::new(&state.pool);
    let highlight = load_highlight(&highlight_repo, &highlight_id)
        .await
        .map_err(|e| e.to_string())?;
    let text = highlight.text.trim();
    if text.is_empty() {
        return Err("highlight text is empty".into());
    }
    let paper_repo = PaperRepo::new(&state.pool);
    let term_repo = PaperTermRepo::new(&state.pool);
    let paper = load_paper(&paper_repo, &highlight.paper_id)
        .await
        .map_err(|e| e.to_string())?;
    let clipped = truncate(text, MAX_SELECTION_CHARS);
    let terms = build_term_insights(&paper_repo, &term_repo, &paper, &clipped)
        .await
        .map_err(|e| e.to_string())?;
    let cfg = load_config(&state.paths).map_err(|e| e.to_string())?;
    let profile = active_reading_profile(&cfg).map_err(|e| e.to_string())?;
    let lang = target_lang.unwrap_or_else(|| "Chinese".to_string());

    let envelope = freeze_reader_context(
        &state,
        &ReadingContextRequest {
            paper_id: highlight.paper_id.clone(),
            selection: Some(SelectionContext {
                text: clipped.clone(),
                page: Some(highlight.page),
            }),
            highlight_id: Some(highlight_id.clone()),
            revision_id: None,
            max_body_chars: None,
        },
        &paper.title,
        paper.abstract_text.as_deref(),
    )
    .await?;

    let result = run_reading_dispatch(
        &state,
        "highlight_translate",
        &highlight.paper_id,
        &profile.name,
        &profile.chat_model,
        &envelope,
        async {
            translate_selection(TranslateSelectionInput {
                client: &state.http,
                profile: &profile,
                paper: &paper,
                selection: &clipped,
                terms: &terms,
                target_lang: &lang,
            })
            .await
        },
    )
    .await?;
    if result.translation.trim().is_empty() {
        return Err("empty translation response".into());
    }
    highlight_repo
        .update_translation(
            &highlight_id,
            &HighlightTranslationUpdate {
                text: &result.translation,
                target_lang: &lang,
                model: &result.model,
                translated_at: Utc::now().timestamp(),
            },
        )
        .await
        .map_err(|e| e.to_string())?;
    load_highlight(&highlight_repo, &highlight_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn highlight_summarize(
    state: State<'_, Arc<AppState>>,
    highlight_id: String,
) -> Result<Highlight, String> {
    let highlight_repo = HighlightRepo::new(&state.pool);
    let highlight = load_highlight(&highlight_repo, &highlight_id)
        .await
        .map_err(|e| e.to_string())?;
    let text = highlight.text.trim();
    if text.is_empty() {
        return Err("highlight text is empty".into());
    }
    if text.chars().count() < MIN_SUMMARY_CHARS {
        return Err("highlight too short to summarize".into());
    }
    let paper_repo = PaperRepo::new(&state.pool);
    let paper = load_paper(&paper_repo, &highlight.paper_id)
        .await
        .map_err(|e| e.to_string())?;
    let cfg = load_config(&state.paths).map_err(|e| e.to_string())?;
    let profile = active_reading_profile(&cfg).map_err(|e| e.to_string())?;
    let clipped = truncate(text, MAX_SELECTION_CHARS);

    let envelope = freeze_reader_context(
        &state,
        &ReadingContextRequest {
            paper_id: highlight.paper_id.clone(),
            selection: Some(SelectionContext {
                text: clipped.clone(),
                page: Some(highlight.page),
            }),
            highlight_id: Some(highlight_id.clone()),
            revision_id: None,
            max_body_chars: None,
        },
        &paper.title,
        paper.abstract_text.as_deref(),
    )
    .await?;

    let result = run_reading_dispatch(
        &state,
        "highlight_summarize",
        &highlight.paper_id,
        &profile.name,
        &profile.chat_model,
        &envelope,
        async { summarize_highlight(&state.http, &profile, &paper, &clipped).await },
    )
    .await?;
    if result.summary.trim().is_empty() {
        return Err("empty summary response".into());
    }
    highlight_repo
        .update_summary(
            &highlight_id,
            &HighlightSummaryUpdate {
                text: &result.summary,
                model: &result.model,
                summarized_at: Utc::now().timestamp(),
            },
        )
        .await
        .map_err(|e| e.to_string())?;
    load_highlight(&highlight_repo, &highlight_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn highlight_explain(
    state: State<'_, Arc<AppState>>,
    highlight_id: String,
) -> Result<Highlight, String> {
    explain::highlight_explain_impl(state, highlight_id).await
}

pub(crate) async fn load_paper(repo: &PaperRepo<'_>, paper_id: &str) -> Result<Paper> {
    repo.get(paper_id)
        .await
        .map_err(|e| anyhow!(e))?
        .ok_or_else(|| anyhow!("paper not found"))
}

pub(super) async fn load_highlight(
    repo: &HighlightRepo<'_>,
    highlight_id: &str,
) -> Result<Highlight> {
    repo.get(highlight_id)
        .await?
        .ok_or_else(|| anyhow!("highlight not found"))
}

struct HighlightSummaryResult {
    summary: String,
    model: String,
}

async fn summarize_highlight(
    client: &reqwest::Client,
    profile: &LlmProfile,
    paper: &Paper,
    selection: &str,
) -> Result<HighlightSummaryResult> {
    let user_content = crate::ai::prompts::SUMMARIZE_HIGHLIGHT_USER
        .replace("{title}", &paper.title)
        .replace("{selection}", selection);
    let resp = chat_complete_for_task(
        client,
        profile,
        TaskKind::Tldr,
        &[
            ChatMessage {
                role: "system".into(),
                content: crate::ai::prompts::SUMMARIZE_HIGHLIGHT_SYSTEM.into(),
            },
            ChatMessage {
                role: "user".into(),
                content: user_content,
            },
        ],
    )
    .await?;
    Ok(HighlightSummaryResult {
        summary: parse_json_lenient(&resp.content)
            .get("summary")
            .and_then(|value| value.as_str())
            .unwrap_or("")
            .trim()
            .to_string(),
        model: resp.model,
    })
}

fn parse_json_lenient(raw: &str) -> serde_json::Value {
    let trimmed = raw.trim();
    let body = strip_code_fence(trimmed);
    if let Ok(value) = serde_json::from_str::<serde_json::Value>(body) {
        return value;
    }
    if let Some(end) = body.rfind('}') {
        if let Some(start) = body[..end].rfind('{') {
            if let Ok(value) = serde_json::from_str::<serde_json::Value>(&body[start..=end]) {
                return value;
            }
        }
    }
    serde_json::json!({})
}

fn strip_code_fence(text: &str) -> &str {
    let stripped = text
        .strip_prefix("```json")
        .or_else(|| text.strip_prefix("```"))
        .unwrap_or(text);
    stripped
        .trim_start_matches('\n')
        .trim_end_matches("```")
        .trim()
}

fn truncate(text: &str, max_chars: usize) -> String {
    if text.chars().count() <= max_chars {
        return text.to_string();
    }
    let mut clipped = text.chars().take(max_chars).collect::<String>();
    clipped.push_str("...");
    clipped
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::storage::{open_pool, run_migrations, LibraryPaths, ReadStatus};
    use tokio::sync::Mutex as AsyncMutex;
    use tokio_util::sync::CancellationToken;

    #[tokio::test]
    async fn paper_markdown_get_reads_prepared_originals_before_legacy_cache() {
        let (state, root) = test_state().await;
        let paper_id = "prepared-paper";
        seed_paper(&state, paper_id, Some("/nonexistent/source.pdf".to_string())).await;
        state.paths.write_paper_markdown(paper_id, "Earlier extraction").unwrap();
        let workspace = state.paths.root.join("reading").join(paper_id);
        std::fs::create_dir_all(&workspace).unwrap();
        std::fs::write(workspace.join("paper.json"),
            r#"{"blocks":[{"type":"para","en":"Prepared original","zh":"译文"}]}"#).unwrap();

        let body = paper_markdown_get_impl(&state, paper_id).await.unwrap().unwrap();
        assert_eq!(body, "Prepared original\n\n");
        state.pool.close().await;
        std::fs::remove_dir_all(root).unwrap();
    }

    /// Cached `document.md` wins and the stored PDF path is never consulted.
    #[tokio::test]
    async fn paper_markdown_get_returns_cached_document_markdown() {
        let (state, root) = test_state().await;
        let paper_id = ulid::Ulid::new().to_string();
        seed_paper(
            &state,
            &paper_id,
            Some("/nonexistent/source.pdf".to_string()),
        )
        .await;
        state
            .paths
            .write_paper_markdown(&paper_id, "# Cached body\n\nCached paragraph.")
            .unwrap();

        let markdown = paper_markdown_get_impl(&state, &paper_id).await.unwrap();

        assert_eq!(
            markdown.as_deref(),
            Some("# Cached body\n\nCached paragraph.")
        );
        state.pool.close().await;
        std::fs::remove_dir_all(root).ok();
    }

    /// Without a cache, extraction runs locally on the stored PDF and caches
    /// its result back to `document.md` so the next read skips extraction.
    #[tokio::test]
    async fn paper_markdown_get_extracts_and_caches_stored_pdf() {
        let (state, root) = test_state().await;
        let paper_id = "paper-extract";
        let pdf_path = state.paths.paper_dir(paper_id).join("source.pdf");
        std::fs::create_dir_all(pdf_path.parent().unwrap()).unwrap();
        std::fs::write(
            &pdf_path,
            minimal_pdf("Original markdown body from the extraction tier."),
        )
        .unwrap();
        seed_paper(
            &state,
            paper_id,
            Some(pdf_path.to_string_lossy().into_owned()),
        )
        .await;

        let markdown = paper_markdown_get_impl(&state, paper_id).await.unwrap();

        let markdown = markdown.expect("extraction tier should produce a body");
        assert!(
            markdown.contains("Original markdown body from the extraction tier."),
            "unexpected body: {markdown}"
        );
        assert_eq!(
            state.paths.read_paper_markdown(paper_id).as_deref(),
            Some(markdown.as_str())
        );
        state.pool.close().await;
        std::fs::remove_dir_all(root).ok();
    }

    /// A paper whose PDF is missing and has no cache yields `None` rather than
    /// an error, matching the translation cache read path.
    #[tokio::test]
    async fn paper_markdown_get_returns_none_without_cache_or_readable_pdf() {
        let (state, root) = test_state().await;
        let paper_id = ulid::Ulid::new().to_string();
        seed_paper(
            &state,
            &paper_id,
            Some("/nonexistent/source.pdf".to_string()),
        )
        .await;

        let markdown = paper_markdown_get_impl(&state, &paper_id).await.unwrap();

        assert!(markdown.is_none());
        state.pool.close().await;
        std::fs::remove_dir_all(root).ok();
    }

    #[tokio::test]
    async fn paper_markdown_get_rejects_unknown_paper() {
        let (state, root) = test_state().await;

        let error = paper_markdown_get_impl(&state, "missing-paper")
            .await
            .unwrap_err();

        assert!(
            error.contains("paper not found"),
            "unexpected error: {error}"
        );
        state.pool.close().await;
        std::fs::remove_dir_all(root).ok();
    }

    async fn seed_paper(state: &AppState, paper_id: &str, pdf_path: Option<String>) {
        let now = chrono::Utc::now().timestamp();
        let paper = Paper {
            id: paper_id.to_string(),
            title: "Extraction Fixture".into(),
            authors: vec!["Fixture Author".into()],
            year: Some(2026),
            venue: None,
            doi: None,
            arxiv_id: None,
            abstract_text: None,
            pdf_path,
            note_path: None,
            added_at: now,
            updated_at: now,
            read_status: ReadStatus::Unread,
            tldr: None,
            research_question: None,
            method: None,
            dataset: None,
            key_findings: vec![],
            limitations: None,
            comparison: None,
            title_translated: None,
            abstract_translated: None,
            translate_target_lang: None,
            translated_at: None,
            bibtex: None,
            last_exported_at: None,
        };
        PaperRepo::new(&state.pool).insert(&paper).await.unwrap();
    }

    async fn test_state() -> (AppState, std::path::PathBuf) {
        let root = std::env::temp_dir().join(format!("litera-reader-md-{}", ulid::Ulid::new()));
        let paths = LibraryPaths::new(&root);
        paths.ensure().unwrap();
        let pool = open_pool(&paths.db_file()).await.unwrap();
        run_migrations(&pool).await.unwrap();
        let state = AppState {
            pool,
            paths,
            http: reqwest::Client::new(),
            http_external: reqwest::Client::new(),
            host_network: crate::network_egress::HostNetworkState::new(Default::default()),
            ai_cancels: AsyncMutex::new(std::collections::HashMap::new()),
            batch_cancel: AsyncMutex::new(None::<CancellationToken>),
            sync_lock: AsyncMutex::new(()),
            plugin_host: crate::plugin_host::PluginHostState::new(),
        };
        (state, root)
    }

    /// Single-page PDF with one text run in Helvetica, built in-process so the
    /// extraction tier has real bytes to parse without a checked-in fixture.
    fn minimal_pdf(text: &str) -> Vec<u8> {
        use lopdf::content::{Content, Operation};
        use lopdf::{dictionary, Document, Object, Stream};

        let mut doc = Document::with_version("1.5");
        let pages_id = doc.new_object_id();
        let font_id = doc.add_object(dictionary! {
            "Type" => "Font",
            "Subtype" => "Type1",
            "BaseFont" => "Helvetica",
        });
        let resources_id = doc.add_object(dictionary! {
            "Font" => dictionary! { "F1" => font_id },
        });
        let content = Content {
            operations: vec![
                Operation::new("BT", vec![]),
                Operation::new("Tf", vec!["F1".into(), 12.into()]),
                Operation::new("Td", vec![72.into(), 720.into()]),
                Operation::new("Tj", vec![Object::string_literal(text)]),
                Operation::new("ET", vec![]),
            ],
        };
        let content_id = doc.add_object(Stream::new(dictionary! {}, content.encode().unwrap()));
        let page_id = doc.add_object(dictionary! {
            "Type" => "Page",
            "Parent" => pages_id,
            "Contents" => content_id,
        });
        doc.objects.insert(
            pages_id,
            Object::Dictionary(dictionary! {
                "Type" => "Pages",
                "Kids" => vec![page_id.into()],
                "Count" => 1,
                "Resources" => resources_id,
                "MediaBox" => vec![0.into(), 0.into(), 595.into(), 842.into()],
            }),
        );
        let catalog_id = doc.add_object(dictionary! {
            "Type" => "Catalog",
            "Pages" => pages_id,
        });
        doc.trailer.set("Root", catalog_id);
        let mut bytes = Vec::new();
        doc.save_to(&mut bytes).unwrap();
        bytes
    }
}
