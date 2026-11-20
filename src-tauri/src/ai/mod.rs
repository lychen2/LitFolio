//! LLM client (OpenAI-compatible chat + embeddings) and Settings persistence.

mod client;
pub mod json_utils;
mod models;
mod profile;
pub mod prompts;
mod query_expand;
pub mod reading;

pub use reading::{
    dispatch_with_cancel, freeze_reading_context, ReadingContextEnvelope, ReadingContextRequest,
    SelectionContext,
};
mod summarize;
mod topic_survey;
mod topic_survey_annotate;
mod translate;

pub use client::{chat_complete_for_task, chat_complete_with_task_kind, ChatMessage};
pub use models::{list_models, pull_model};
pub use profile::{
    active_profile, active_profile_for_task, active_reading_profile, load_config, save_config,
    LlmConfig, LlmProfile, TaskKind,
};
pub use query_expand::{expand_search_query, ExpandedQuery};
pub use summarize::{
    quick_read_paper_text, summarize_paper_text, PaperSummaryRequest, QuickReadResult, TldrResult,
};
pub use topic_survey::{plan_survey, PiHint, SubareaSpec, SurveySkeleton};
pub use topic_survey_annotate::{annotate_survey, AnnotateInputPaper, SurveyAnnotation};
pub use translate::{
    estimate_markdown_translation, translate_markdown_text, translate_paper_text,
    MarkdownTranslationEstimate, MarkdownTranslationResult, TranslationResult,
    MARKDOWN_CHUNK_CHARS,
};
