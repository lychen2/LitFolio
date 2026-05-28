//! LLM client (OpenAI-compatible chat + embeddings) and Settings persistence.

#![allow(dead_code, unused_imports)]

mod client;
mod concept_extract;
pub mod json_utils;
mod library_qa;
pub mod prompts;
pub mod link_discover;
pub mod lit_review;
mod models;
mod profile;
mod query_expand;
mod summarize;
mod topic_survey;
mod topic_survey_annotate;
mod translate;

pub use client::{chat_complete, ChatMessage, ChatResponse};
pub use concept_extract::{extract_concepts, ExtractedConcept, ExtractedRelation};
pub use library_qa::{answer_library_question, empty_result, AskLibraryResult, AskSource};
pub use link_discover::{discover_links, DiscoveredLink};
pub use models::list_models;
pub use profile::{
    active_profile, active_profile_for_task, load_config, save_config, LlmConfig, LlmProfile,
    TaskAssignments, TaskKind,
};
pub use query_expand::{expand_search_query, ExpandedQuery};
pub use summarize::{quick_read_paper_text, summarize_paper_text, QuickReadResult, TldrResult};
pub use topic_survey::{plan_survey, PiHint, SubareaSpec, SurveySkeleton};
pub use topic_survey_annotate::{annotate_survey, AnnotateInputPaper, PaperNote, SurveyAnnotation};
pub use translate::{translate_paper_text, TranslationResult};
pub use lit_review::{generate_review, GroupingStrategy, LitReviewResult};
