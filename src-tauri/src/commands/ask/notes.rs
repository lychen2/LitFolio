use chrono::Utc;

use crate::ai::AskSource;

use super::SaveAskNoteInput;

pub(super) const DEFAULT_SOURCE_LIMIT: i64 = 8;
pub(super) const MAX_SOURCE_LIMIT: i64 = 20;
const MAX_SLUG_LEN: usize = 48;

pub(super) fn normalize_limit(limit: Option<i64>) -> i64 {
    limit
        .unwrap_or(DEFAULT_SOURCE_LIMIT)
        .clamp(1, MAX_SOURCE_LIMIT)
}

pub(super) fn note_slug(question: &str) -> String {
    let mut slug = String::new();
    let mut last_dash = false;
    for ch in question.chars() {
        if ch.is_ascii_alphanumeric() {
            slug.push(ch.to_ascii_lowercase());
            last_dash = false;
            continue;
        }
        if (ch.is_ascii_whitespace() || ch == '-' || ch == '_') && !slug.is_empty() && !last_dash {
            slug.push('-');
            last_dash = true;
        }
        if slug.len() >= MAX_SLUG_LEN {
            break;
        }
    }
    let slug = slug.trim_matches('-');
    let base = if slug.is_empty() { "ask-note" } else { slug };
    format!("{}-{}", Utc::now().format("%Y%m%d-%H%M%S"), base)
}

pub(super) fn render_note(input: &SaveAskNoteInput, generated_at: String) -> String {
    let mut out = String::new();
    out.push_str("# AI 问答笔记\n\n");
    out.push_str(&format!("- 生成时间: {generated_at}\n"));
    write_model_and_terms(&mut out, input);
    out.push('\n');
    out.push_str("## 问题\n\n");
    out.push_str(input.question.trim());
    out.push_str("\n\n## 结论\n\n");
    out.push_str(input.answer.trim());
    if !input.sources.is_empty() {
        out.push_str("\n\n## 证据来源\n\n");
        for (idx, source) in input.sources.iter().enumerate() {
            write_source(&mut out, idx + 1, source);
        }
    }
    out
}

fn write_model_and_terms(out: &mut String, input: &SaveAskNoteInput) {
    if !input.model.trim().is_empty() {
        out.push_str(&format!("- 模型: {}\n", input.model.trim()));
    }
    if !input.terms.is_empty() {
        out.push_str(&format!("- 检索词: {}\n", input.terms.join(" · ")));
    }
}

fn write_source(out: &mut String, index: usize, source: &AskSource) {
    out.push_str(&format!("### [{index}] {}\n\n", source.title.trim()));
    if !source.authors.is_empty() || source.year.is_some() {
        let authors = source.authors.join(", ");
        let year = source
            .year
            .map(|value| value.to_string())
            .unwrap_or_else(|| "n.d.".into());
        out.push_str(&format!("- 作者: {}\n", authors));
        out.push_str(&format!("- 年份: {year}\n\n"));
    }
    out.push_str("```text\n");
    out.push_str(source.snippet.trim());
    out.push_str("\n```\n\n");
}
