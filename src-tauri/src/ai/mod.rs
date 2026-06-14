//! LLM client (OpenAI-compatible chat + embeddings) and Settings persistence.

mod client;
mod concept_extract;
pub mod json_utils;
mod library_qa;
pub mod link_discover;
pub mod lit_review;
mod models;
mod profile;
pub mod prompts;
mod query_expand;
mod summarize;
mod topic_survey;
mod topic_survey_annotate;
mod translate;

pub use client::{chat_complete, ChatMessage};
pub use concept_extract::{extract_concepts, ExtractedConcept};
pub use library_qa::{
    answer_library_question, empty_result, local_search_result, AskLibraryResult, AskSource,
    LibraryQuestionRequest,
};
pub use link_discover::discover_links;
pub use lit_review::{generate_review, GroupingStrategy, LitReviewResult};
pub use models::list_models;
pub use profile::{
    active_profile, active_profile_for_task, load_config, save_config, LlmConfig, LlmProfile,
    TaskKind,
};
pub use query_expand::{expand_search_query, ExpandedQuery};
pub use summarize::{
    quick_read_paper_text, summarize_paper_text, PaperSummaryRequest, QuickReadResult, TldrResult,
};
pub use topic_survey::{plan_survey, PiHint, SubareaSpec, SurveySkeleton};
pub use topic_survey_annotate::{annotate_survey, AnnotateInputPaper, SurveyAnnotation};
pub use translate::{translate_paper_text, TranslationResult};
