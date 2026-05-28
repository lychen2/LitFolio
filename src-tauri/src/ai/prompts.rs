//! Prompt templates for LLM tasks.
//!
//! Each public constant is a `{system, user}` pair. The user template uses
//! `{{name}}` placeholders that callers replace with `str::replace`.

// ── explain_terms (reader_terms) ──────────────────────────────────────

pub const EXPLAIN_TERMS_SYSTEM: &str =
    "You explain technical terms for an academic reading workspace.";

pub const EXPLAIN_TERMS_USER: &str = "\
Paper title: {title}

Terms:
{items}

Return ONLY JSON: {\"definitions\": [{\"term\": \"...\", \"definition\": \"...\"}]}.
Rules:
- Write Chinese definitions.
- Each definition must be one short sentence.
- Explain how the term is used in this paper, not a generic dictionary entry.
- For acronyms with a known full form, surface the full form in the first clause of the definition (e.g. \"SSIM (Structural Similarity Index Measure) 在本文中…\").
- Do not include terms that are not in the input list.";

// ── reader_translate ──────────────────────────────────────────────────

pub const READER_TRANSLATE_SYSTEM: &str =
    "You are a precise scientific translator for in-context reading assistance.";

pub const READER_TRANSLATE_USER: &str = "\
Target language: {lang}
Paper title: {title}

Selection:
{selection}

Glossary:
{glossary}

Output exactly this JSON and nothing else:
{\"translation\": \"...\"}
Replace ... with your translation. No markdown, no explanation.";

// ── highlight summarize ───────────────────────────────────────────────

pub const SUMMARIZE_HIGHLIGHT_SYSTEM: &str =
    "You compress technical passages into one precise sentence for a research reader.";

pub const SUMMARIZE_HIGHLIGHT_USER: &str = "\
Paper title: {title}

Highlighted passage:
{selection}

Output exactly this JSON and nothing else:
{\"summary\": \"...\"}
Replace ... with one Chinese sentence (\u{2264}36 chars), capturing the main claim. No markdown, no explanation.";
