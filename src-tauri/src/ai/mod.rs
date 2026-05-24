//! LLM client (OpenAI-compatible chat + embeddings) and Settings persistence.

#![allow(dead_code, unused_imports)]

mod profile;
mod client;
mod summarize;

pub use profile::{LlmProfile, LlmConfig, load_config, save_config, active_profile};
pub use client::{ChatMessage, ChatResponse, chat_complete};
pub use summarize::{summarize_paper_text, quick_read_paper_text, TldrResult, QuickReadResult};
