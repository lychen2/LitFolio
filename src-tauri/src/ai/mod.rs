//! LLM client (OpenAI-compatible chat + embeddings) and Settings persistence.

#![allow(dead_code, unused_imports)]

mod profile;
mod client;
mod summarize;

pub use profile::{LlmProfile, LlmConfig, TaskAssignments, TaskKind,
                  load_config, save_config, active_profile, active_profile_for_task};
pub use client::{ChatMessage, ChatResponse, chat_complete};
pub use summarize::{summarize_paper_text, quick_read_paper_text, TldrResult, QuickReadResult};
