//! Paper translation workflows.

use anyhow::{anyhow, Result};
use serde::{Deserialize, Serialize};

use super::client::{chat_complete_for_task, ChatMessage};
use super::json_utils::parse_lenient_value;
use super::profile::{LlmProfile, TaskKind};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TranslationResult {
    pub title: String,
    pub abstract_text: String,
    pub target_lang: String,
    pub model: String,
    pub prompt_tokens: u32,
    pub completion_tokens: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MarkdownTranslationResult {
    pub markdown: String,
    pub target_lang: String,
    pub model: String,
    pub prompt_tokens: u32,
    pub completion_tokens: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct MarkdownTranslationEstimate {
    pub source_chars: usize,
    pub cleaned_chars: usize,
    pub chunk_count: usize,
}

pub fn estimate_markdown_translation(
    markdown: &str,
    max_chunk_chars: usize,
) -> MarkdownTranslationEstimate {
    let source_chars = markdown.chars().count();
    let source_markdown = clean_pdf_markdown_for_translation(markdown);
    let cleaned_chars = source_markdown.chars().count();
    let chunk_count = split_markdown_chunks(&source_markdown, max_chunk_chars).len();
    MarkdownTranslationEstimate {
        source_chars,
        cleaned_chars,
        chunk_count,
    }
}

pub const MARKDOWN_CHUNK_CHARS: usize = 2_400;

const SYSTEM_PROMPT: &str = "You are a precise scientific translator. \
Translate the supplied paper title and abstract to the requested language. \
Preserve technical terms (model names, algorithm names, mathematical symbols, \
units, dataset names) verbatim. Do not paraphrase or summarize. \
Return ONLY JSON in this exact shape: {\"title\": \"...\", \"abstract\": \"...\"}.";

const MARKDOWN_SYSTEM_PROMPT: &str = "You are a senior academic translator and Markdown preservation engine.\n\n\
Non-negotiable rules:\n\
1. Translate natural-language prose into the target language.\n\
2. Preserve Markdown structure exactly: heading levels, list markers, table pipes/alignment rows, blockquotes, blank-line block boundaries, links, images, footnote markers, citations, and code fences.\n\
3. Do not create new headings, bullets, numbering, summaries, prefaces, explanations, or wrapper code fences.\n\
4. Keep formulas, LaTeX, URLs, DOIs, citation keys, model names, dataset names, variable names, and code unchanged.\n\
5. For Markdown tables, keep the same row count, column count, separator row, and cell order; translate only prose inside cells.\n\
6. Delete PDF extraction artifacts if they appear: standalone page numbers, Page N, N of M, repeated page headers/footers, and <!-- page:N --> comments.\n\
7. Do not leave source-language prose untranslated unless it is a proper noun, technical identifier, code, URL, DOI, citation, formula, or dataset/model name.\n\
8. If a chunk is code/formula-only, return it unchanged.\n\n\
Return ONLY the translated Markdown chunk.";

pub async fn translate_markdown_text(
    client: &reqwest::Client,
    profile: &LlmProfile,
    title: &str,
    markdown: &str,
    target_lang: &str,
) -> Result<MarkdownTranslationResult> {
    let source_markdown = clean_pdf_markdown_for_translation(markdown);
    let chunks = split_markdown_chunks(&source_markdown, MARKDOWN_CHUNK_CHARS);
    if chunks.is_empty() {
        return Err(anyhow!("empty markdown"));
    }
    let total = chunks.len();
    let mut translated = Vec::with_capacity(total);
    let mut stats = MarkdownTranslationStats {
        model: profile.chat_model.clone(),
        prompt_tokens: 0,
        completion_tokens: 0,
    };

    for (idx, chunk) in chunks.iter().enumerate() {
        let chunk_translations = translate_markdown_chunk_with_retries(
            client,
            profile,
            title,
            target_lang,
            idx,
            total,
            chunk,
            &mut stats,
        )
        .await?;
        translated.extend(chunk_translations);
    }

    Ok(MarkdownTranslationResult {
        markdown: clean_translated_markdown(&translated.join("\n\n")),
        target_lang: target_lang.to_string(),
        model: stats.model,
        prompt_tokens: stats.prompt_tokens,
        completion_tokens: stats.completion_tokens,
    })
}

struct MarkdownTranslationStats {
    model: String,
    prompt_tokens: u32,
    completion_tokens: u32,
}

struct PendingMarkdownChunk {
    markdown: String,
    max_chars: usize,
}

enum MarkdownChunkAttempt {
    Complete(String),
    LengthLimited,
}

#[allow(clippy::too_many_arguments)] // retry loop mirrors chunk call signature
async fn translate_markdown_chunk_with_retries(
    client: &reqwest::Client,
    profile: &LlmProfile,
    title: &str,
    target_lang: &str,
    chunk_idx: usize,
    total_chunks: usize,
    chunk: &str,
    stats: &mut MarkdownTranslationStats,
) -> Result<Vec<String>> {
    let mut pending = vec![PendingMarkdownChunk {
        markdown: chunk.to_string(),
        max_chars: MARKDOWN_CHUNK_CHARS,
    }];
    let mut translated = Vec::new();

    while let Some(current) = pending.pop() {
        match translate_markdown_chunk(
            client,
            profile,
            title,
            target_lang,
            chunk_idx,
            total_chunks,
            &current.markdown,
            stats,
        )
        .await?
        {
            MarkdownChunkAttempt::Complete(text) => translated.push(text),
            MarkdownChunkAttempt::LengthLimited => {
                let retry_max_chars = current.max_chars.min(current.markdown.len()) / 2;
                if retry_max_chars == 0 {
                    return Err(markdown_output_limit_error(chunk_idx));
                }
                let retry_chunks = split_markdown_chunks(&current.markdown, retry_max_chars);
                if retry_chunks.len() <= 1 {
                    return Err(markdown_output_limit_error(chunk_idx));
                }
                pending.extend(retry_chunks.into_iter().rev().map(|markdown| {
                    PendingMarkdownChunk {
                        markdown,
                        max_chars: retry_max_chars,
                    }
                }));
            }
        }
    }

    Ok(translated)
}

#[allow(clippy::too_many_arguments)] // per-chunk LLM call needs full context
async fn translate_markdown_chunk(
    client: &reqwest::Client,
    profile: &LlmProfile,
    title: &str,
    target_lang: &str,
    chunk_idx: usize,
    total_chunks: usize,
    chunk: &str,
    stats: &mut MarkdownTranslationStats,
) -> Result<MarkdownChunkAttempt> {
    let user_content = format!(
        "Target language: {target_lang}\nPaper title: {title}\nChunk: {}/{}\n\nMarkdown chunk:\n{}",
        chunk_idx + 1,
        total_chunks,
        chunk
    );
    let resp = chat_complete_for_task(
        client,
        profile,
        TaskKind::Translate,
        &[
            ChatMessage {
                role: "system".into(),
                content: MARKDOWN_SYSTEM_PROMPT.into(),
            },
            ChatMessage {
                role: "user".into(),
                content: user_content,
            },
        ],
    )
    .await?;

    stats.model = resp.model;
    stats.prompt_tokens += resp.prompt_tokens;
    stats.completion_tokens += resp.completion_tokens;
    if resp
        .finish_reason
        .as_deref()
        .is_some_and(is_length_finish_reason)
    {
        return Ok(MarkdownChunkAttempt::LengthLimited);
    }

    let chunk_translation = strip_markdown_fence(&resp.content, chunk);
    if chunk_translation.trim().is_empty() {
        return Err(anyhow!(
            "empty markdown translation for chunk {}",
            chunk_idx + 1
        ));
    }
    Ok(MarkdownChunkAttempt::Complete(chunk_translation))
}

fn markdown_output_limit_error(chunk_idx: usize) -> anyhow::Error {
    anyhow!(
        "markdown translation for chunk {} exceeded model output limit; increase max_tokens or retry with smaller chunks",
        chunk_idx + 1
    )
}

pub async fn translate_paper_text(
    client: &reqwest::Client,
    profile: &LlmProfile,
    title: &str,
    abstract_text: Option<&str>,
    target_lang: &str,
) -> Result<TranslationResult> {
    let user_content = format!(
        "Target language: {target_lang}\n\nTitle:\n{title}\n\nAbstract:\n{}",
        abstract_text.unwrap_or("(no abstract supplied)"),
    );
    let resp = chat_complete_for_task(
        client,
        profile,
        TaskKind::Translate,
        &[
            ChatMessage {
                role: "system".into(),
                content: SYSTEM_PROMPT.into(),
            },
            ChatMessage {
                role: "user".into(),
                content: user_content,
            },
        ],
    )
    .await?;
    let cleaned_content = strip_think_tags(&resp.content);
    let v = parse_lenient_value(&cleaned_content);
    let title_tx = v
        .get("title")
        .and_then(|x| x.as_str())
        .unwrap_or("")
        .trim()
        .to_string();
    let abstract_tx = v
        .get("abstract")
        .and_then(|x| x.as_str())
        .unwrap_or("")
        .trim()
        .to_string();
    Ok(TranslationResult {
        title: title_tx,
        abstract_text: abstract_tx,
        target_lang: target_lang.to_string(),
        model: resp.model,
        prompt_tokens: resp.prompt_tokens,
        completion_tokens: resp.completion_tokens,
    })
}

fn is_length_finish_reason(reason: &str) -> bool {
    reason.eq_ignore_ascii_case("length") || reason.eq_ignore_ascii_case("max_tokens")
}

#[derive(Clone, Debug)]
struct MarkdownPageLine {
    text: String,
    in_fence: bool,
}

fn clean_pdf_markdown_for_translation(markdown: &str) -> String {
    let pages = split_markdown_pages(markdown);
    let repeated_margin = repeated_margin_line_keys(&pages);
    let mut out = Vec::new();
    for page in pages {
        for line in page {
            let trimmed = line.text.trim();
            if line.in_fence {
                out.push(line.text.trim_end().to_string());
                continue;
            }
            if trimmed.is_empty() {
                push_cleaned_markdown_line(&mut out, String::new());
                continue;
            }
            if is_page_artifact_line(trimmed) || repeated_margin.contains(&line_key(trimmed)) {
                continue;
            }
            push_cleaned_markdown_line(&mut out, line.text.trim_end().to_string());
        }
        push_cleaned_markdown_line(&mut out, String::new());
    }
    normalize_markdown_blank_lines(&out.join("\n"))
}

fn clean_translated_markdown(markdown: &str) -> String {
    let mut out = Vec::new();
    let mut fence: Option<MarkdownFence> = None;
    for line in markdown.lines() {
        let trimmed = line.trim();
        if let Some(open) = fence {
            out.push(line.trim_end().to_string());
            if closes_fence(trimmed, open) {
                fence = None;
            }
            continue;
        }
        if let Some(open) = opening_fence(trimmed) {
            fence = Some(open);
            out.push(line.trim_end().to_string());
            continue;
        }
        if is_page_artifact_line(trimmed) {
            continue;
        }
        push_cleaned_markdown_line(&mut out, line.trim_end().to_string());
    }
    normalize_markdown_blank_lines(&out.join("\n"))
}

fn split_markdown_pages(markdown: &str) -> Vec<Vec<MarkdownPageLine>> {
    let mut pages = Vec::<Vec<MarkdownPageLine>>::new();
    let mut current = Vec::<MarkdownPageLine>::new();
    let mut fence: Option<MarkdownFence> = None;
    for line in markdown.lines() {
        let trimmed = line.trim();
        if let Some(open) = fence {
            current.push(MarkdownPageLine {
                text: line.to_string(),
                in_fence: true,
            });
            if closes_fence(trimmed, open) {
                fence = None;
            }
            continue;
        }
        if let Some(open) = opening_fence(trimmed) {
            fence = Some(open);
            current.push(MarkdownPageLine {
                text: line.to_string(),
                in_fence: true,
            });
            continue;
        }
        if is_page_comment(trimmed) {
            if !current.is_empty() {
                pages.push(current);
                current = Vec::new();
            }
            continue;
        }
        current.push(MarkdownPageLine {
            text: line.to_string(),
            in_fence: false,
        });
    }
    if !current.is_empty() {
        pages.push(current);
    }
    pages
}

fn repeated_margin_line_keys(pages: &[Vec<MarkdownPageLine>]) -> std::collections::HashSet<String> {
    if pages.len() < 3 {
        return std::collections::HashSet::new();
    }
    let mut counts = std::collections::HashMap::<String, usize>::new();
    for page in pages {
        let mut seen = std::collections::HashSet::new();
        for line in page
            .iter()
            .filter(|line| !line.in_fence)
            .take(4)
            .chain(page.iter().rev().filter(|line| !line.in_fence).take(4))
        {
            let trimmed = line.text.trim();
            if is_repeatable_margin_line(trimmed) {
                seen.insert(line_key(trimmed));
            }
        }
        for key in seen {
            *counts.entry(key).or_default() += 1;
        }
    }
    counts
        .into_iter()
        .filter_map(|(key, count)| (count >= 2).then_some(key))
        .collect()
}

fn is_repeatable_margin_line(line: &str) -> bool {
    !line.is_empty() && line.len() <= 120 && !looks_like_caption(line)
}

fn line_key(line: &str) -> String {
    line.split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .to_lowercase()
}

fn push_cleaned_markdown_line(out: &mut Vec<String>, line: String) {
    if line.is_empty() && out.last().is_some_and(String::is_empty) {
        return;
    }
    out.push(line);
}

fn normalize_markdown_blank_lines(markdown: &str) -> String {
    let mut out = Vec::new();
    let mut fence: Option<MarkdownFence> = None;
    for line in markdown.lines() {
        let trimmed = line.trim();
        if let Some(open) = fence {
            out.push(line.trim_end().to_string());
            if closes_fence(trimmed, open) {
                fence = None;
            }
            continue;
        }
        if let Some(open) = opening_fence(trimmed) {
            fence = Some(open);
            out.push(line.trim_end().to_string());
            continue;
        }
        push_cleaned_markdown_line(&mut out, line.trim_end().to_string());
    }
    while out.first().is_some_and(String::is_empty) {
        out.remove(0);
    }
    while out.last().is_some_and(String::is_empty) {
        out.pop();
    }
    out.join("\n")
}

fn is_page_artifact_line(line: &str) -> bool {
    if line.is_empty() {
        return false;
    }
    let without_heading = line.trim_start_matches('#').trim();
    is_page_comment(without_heading)
        || is_standalone_page_number(without_heading)
        || is_page_label(without_heading)
}

fn is_page_comment(line: &str) -> bool {
    let lower = line.to_ascii_lowercase();
    lower.starts_with("<!-- page:") && lower.ends_with("-->")
}

fn is_standalone_page_number(line: &str) -> bool {
    let digits = line.chars().filter(|ch| ch.is_ascii_digit()).count();
    digits > 0
        && digits <= 4
        && line
            .chars()
            .all(|ch| ch.is_ascii_digit() || ch.is_whitespace() || matches!(ch, '-' | '–' | '—'))
}

fn is_page_label(line: &str) -> bool {
    let lower = line.to_ascii_lowercase();
    if let Some(rest) = lower.strip_prefix("page") {
        return is_standalone_page_number(rest.trim());
    }
    if let Some(inner) = line.strip_prefix('第').and_then(|s| s.strip_suffix('页')) {
        return is_standalone_page_number(inner.trim());
    }
    let compact = lower.split_whitespace().collect::<Vec<_>>().join(" ");
    if let Some((left, right)) = compact.split_once(" of ") {
        return is_standalone_page_number(left.trim()) && is_standalone_page_number(right.trim());
    }
    if let Some((left, right)) = compact.split_once('/') {
        return is_standalone_page_number(left.trim()) && is_standalone_page_number(right.trim());
    }
    false
}

fn looks_like_caption(line: &str) -> bool {
    let lower = line.trim_start_matches('#').trim().to_ascii_lowercase();
    lower.starts_with("fig.") || lower.starts_with("figure ") || lower.starts_with("table ")
}

fn split_markdown_chunks(markdown: &str, max_chars: usize) -> Vec<String> {
    let mut chunks = Vec::new();
    let mut current = String::new();
    for block in markdown_blocks(markdown) {
        if block.len() > max_chars {
            push_chunk(&mut chunks, &mut current);
            if is_unsplittable_markdown_block(&block) {
                chunks.push(block);
            } else {
                split_large_block(&block, max_chars, &mut chunks);
            }
            continue;
        }
        let next_len = current.len() + usize::from(!current.is_empty()) * 2 + block.len();
        if next_len > max_chars {
            push_chunk(&mut chunks, &mut current);
        }
        if !current.is_empty() {
            current.push_str("\n\n");
        }
        current.push_str(&block);
    }
    push_chunk(&mut chunks, &mut current);
    chunks
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
struct MarkdownFence {
    ch: u8,
    len: usize,
}

fn markdown_blocks(markdown: &str) -> Vec<String> {
    let lines = markdown.lines().collect::<Vec<_>>();
    let mut blocks = Vec::new();
    let mut current = String::new();
    let mut fence: Option<MarkdownFence> = None;
    for (idx, line) in lines.iter().enumerate() {
        if fence.is_none()
            && (opening_fence(line).is_some() || is_table_start_at(&lines, idx))
            && !current.trim().is_empty()
        {
            push_chunk(&mut blocks, &mut current);
        }
        if !current.is_empty() {
            current.push('\n');
        }
        current.push_str(line.trim_end());
        if let Some(open) = fence {
            if closes_fence(line, open) {
                fence = None;
            }
        } else if let Some(open) = opening_fence(line) {
            fence = Some(open);
        }
        if fence.is_none() && line.trim().is_empty() {
            push_chunk(&mut blocks, &mut current);
        }
    }
    push_chunk(&mut blocks, &mut current);
    blocks
}

fn opening_fence(line: &str) -> Option<MarkdownFence> {
    let trimmed = line.trim_start().as_bytes();
    let ch = *trimmed.first()?;
    if ch != b'`' && ch != b'~' {
        return None;
    }
    let len = trimmed.iter().take_while(|b| **b == ch).count();
    (len >= 3).then_some(MarkdownFence { ch, len })
}

fn closes_fence(line: &str, fence: MarkdownFence) -> bool {
    let trimmed = line.trim_start().as_bytes();
    let len = trimmed.iter().take_while(|b| **b == fence.ch).count();
    len >= fence.len && trimmed[len..].iter().all(u8::is_ascii_whitespace)
}

fn is_unsplittable_markdown_block(block: &str) -> bool {
    is_fenced_code_block(block) || is_markdown_table(block)
}

fn is_fenced_code_block(block: &str) -> bool {
    block.lines().next().and_then(opening_fence).is_some()
}

fn is_markdown_table(block: &str) -> bool {
    let mut lines = block.lines();
    let Some(header) = lines.next() else {
        return false;
    };
    let Some(separator) = lines.next() else {
        return false;
    };
    is_table_start(header, separator)
}

fn is_table_start_at(lines: &[&str], idx: usize) -> bool {
    let Some(header) = lines.get(idx) else {
        return false;
    };
    let Some(separator) = lines.get(idx + 1) else {
        return false;
    };
    is_table_start(header, separator)
}

fn is_table_start(header: &str, separator: &str) -> bool {
    header.contains('|')
        && separator.contains('|')
        && separator
            .chars()
            .all(|ch| ch == '|' || ch == '-' || ch == ':' || ch.is_whitespace())
}

fn split_large_block(block: &str, max_chars: usize, chunks: &mut Vec<String>) {
    let mut current = String::new();
    for line in block.lines().map(str::trim_end) {
        if line.len() > max_chars {
            push_chunk(chunks, &mut current);
            split_large_line(line, max_chars, chunks);
            continue;
        }
        let next_len = current.len() + usize::from(!current.is_empty()) + line.len();
        if next_len > max_chars {
            push_chunk(chunks, &mut current);
        }
        if !current.is_empty() {
            current.push('\n');
        }
        current.push_str(line);
    }
    push_chunk(chunks, &mut current);
}

fn split_large_line(line: &str, max_chars: usize, chunks: &mut Vec<String>) {
    let mut remaining = line.trim();
    while remaining.len() > max_chars {
        let split_at = line_split_boundary(remaining, max_chars);
        let (left, right) = remaining.split_at(split_at);
        if !left.trim().is_empty() {
            chunks.push(left.trim().to_string());
        }
        remaining = right.trim_start();
    }
    if !remaining.is_empty() {
        chunks.push(remaining.to_string());
    }
}

fn line_split_boundary(line: &str, max_chars: usize) -> usize {
    let limit = line
        .char_indices()
        .map(|(idx, _)| idx)
        .take_while(|idx| *idx <= max_chars)
        .last()
        .unwrap_or(line.len());
    if limit == 0 {
        return line
            .char_indices()
            .nth(1)
            .map_or(line.len(), |(idx, _)| idx);
    }
    line[..limit]
        .char_indices()
        .rev()
        .find_map(|(idx, ch)| ch.is_whitespace().then_some(idx))
        .filter(|idx| *idx > 0)
        .unwrap_or(limit)
}

fn push_chunk(chunks: &mut Vec<String>, current: &mut String) {
    let trimmed = current.trim();
    if !trimmed.is_empty() {
        chunks.push(trimmed.to_string());
    }
    current.clear();
}

pub(crate) fn strip_think_tags(text: &str) -> String {
    let mut out = text.to_string();
    while let Some(start) = out.find("<think>") {
        if let Some(end) = out[start..].find("</think>") {
            out.replace_range(start..start + end + 8, "");
        } else {
            out.truncate(start);
            break;
        }
    }
    out.trim().to_string()
}

fn strip_markdown_fence(raw: &str, source_chunk: &str) -> String {
    let unthought = strip_think_tags(raw);
    let trimmed = unthought.trim();
    if is_fenced_code_block(source_chunk) {
        return trimmed.to_string();
    }
    let mut lines = trimmed.lines();
    let Some(first) = lines.next() else {
        return String::new();
    };
    let Some(fence) = opening_fence(first) else {
        return trimmed.to_string();
    };
    let info = first.trim_start()[fence.len..].trim();
    if !(info.eq_ignore_ascii_case("markdown") || info.eq_ignore_ascii_case("md")) {
        return trimmed.to_string();
    }
    let mut rest = lines.collect::<Vec<_>>();
    if rest.last().is_some_and(|line| closes_fence(line, fence)) {
        rest.pop();
    }
    rest.join("\n").trim().to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_translation_json() {
        let v = parse_lenient_value(r#"{"title":"标题","abstract":"摘要"}"#);
        assert_eq!(v["title"], "标题");
        assert_eq!(v["abstract"], "摘要");
    }

    #[test]
    fn markdown_chunks_split_on_blank_lines() {
        let markdown = "# Title\n\nFirst paragraph.\n\nSecond paragraph.\n\nThird paragraph.";

        let chunks = split_markdown_chunks(markdown, 28);

        assert_eq!(
            chunks,
            vec![
                "# Title\n\nFirst paragraph.",
                "Second paragraph.",
                "Third paragraph."
            ]
        );
    }

    #[test]
    fn markdown_chunks_keep_fenced_code_with_blank_lines_together() {
        let markdown = "# Title\n\n```python\nprint(1)\n\nprint(2)\n```\n\nAfter.";

        let chunks = split_markdown_chunks(markdown, 24);

        assert_eq!(
            chunks,
            vec![
                "# Title".to_string(),
                "```python\nprint(1)\n\nprint(2)\n```".to_string(),
                "After.".to_string()
            ]
        );
    }

    #[test]
    fn markdown_chunks_keep_large_tables_together() {
        let table = "| A | B |\n|---|---|\n| one | two |\n| three | four |";

        let chunks = split_markdown_chunks(table, 10);

        assert_eq!(chunks, vec![table.to_string()]);
    }

    #[test]
    fn markdown_chunks_split_long_single_lines() {
        let markdown = "Alpha beta gamma delta epsilon zeta eta theta.";

        let chunks = split_markdown_chunks(markdown, 18);

        assert!(chunks.len() > 1);
        assert!(chunks.iter().all(|chunk| chunk.len() <= 18));
        assert_eq!(chunks.join(" "), markdown);
    }

    #[test]
    fn markdown_chunks_split_heading_from_fenced_code() {
        let code = "```python\nprint(1)\n\nprint(2)\n```";
        let markdown = format!("## Listing\n{code}");

        let chunks = split_markdown_chunks(&markdown, 12);

        assert_eq!(chunks, vec!["## Listing".to_string(), code.to_string()]);
    }

    #[test]
    fn markdown_chunks_split_caption_from_large_table() {
        let table = "| A | B |\n|---|---|\n| one | two |\n| three | four |";
        let markdown = format!("Table 1\n{table}");

        let chunks = split_markdown_chunks(&markdown, 12);

        assert_eq!(chunks, vec!["Table 1".to_string(), table.to_string()]);
    }

    #[test]
    fn estimates_markdown_translation_chunks_without_model_call() {
        let markdown = "# Title\n\nFirst paragraph.\n\nSecond paragraph.";

        let estimate = estimate_markdown_translation(markdown, 28);

        assert_eq!(estimate.chunk_count, 2);
        assert_eq!(estimate.source_chars, markdown.chars().count());
        assert!(estimate.cleaned_chars <= estimate.source_chars);
    }

    #[test]
    fn estimate_reports_empty_markdown_without_chunks() {
        let estimate = estimate_markdown_translation("   ", 28);

        assert_eq!(estimate.chunk_count, 0);
        assert_eq!(estimate.cleaned_chars, 0);
    }

    #[tokio::test]
    async fn markdown_translation_errors_when_length_limited_chunk_cannot_split() {
        let table = "| A | B |\n|---|---|\n| one | two |";
        let body = chat_body("partial", "length", 1, 1);
        let base_url = serve_chat_once(&body).await;
        let client = reqwest::Client::new();
        let err =
            translate_markdown_text(&client, &profile(&base_url), "A paper", table, "Chinese")
                .await
                .unwrap_err()
                .to_string();

        assert!(err.contains("chunk 1 exceeded model output limit"));
        assert!(err.contains("increase max_tokens"));
    }

    #[tokio::test]
    async fn markdown_translation_retries_length_limited_chunk_with_smaller_chunks() {
        let first_paragraph = "Alpha sentence about methods. "
            .repeat(40)
            .trim_end()
            .to_string();
        let second_paragraph = "Beta sentence about results. "
            .repeat(40)
            .trim_end()
            .to_string();
        let markdown = format!("{first_paragraph}\n\n{second_paragraph}");
        assert_eq!(
            split_markdown_chunks(&markdown, MARKDOWN_CHUNK_CHARS).len(),
            1
        );
        let retry_max_chars = MARKDOWN_CHUNK_CHARS.min(markdown.len()) / 2;
        let retry_chunks = split_markdown_chunks(&markdown, retry_max_chars);
        assert!(retry_chunks.len() > 1);

        let translations = (1..=retry_chunks.len())
            .map(|idx| format!("第{idx}段译文。"))
            .collect::<Vec<_>>();
        let bodies = std::iter::once(chat_body("partial translation", "length", 1, 1))
            .chain(
                translations
                    .iter()
                    .enumerate()
                    .map(|(idx, text)| chat_body(text, "stop", (idx + 2) as u32, (idx + 3) as u32)),
            )
            .collect::<Vec<_>>();
        let (base_url, requests) = serve_chat_sequence(bodies).await;
        let client = reqwest::Client::new();

        let result = translate_markdown_text(
            &client,
            &profile(&base_url),
            "A paper",
            &markdown,
            "Chinese",
        )
        .await
        .unwrap();

        assert_eq!(result.markdown, translations.join("\n\n"));
        let requests = requests.lock().await;
        let user_contents = requests
            .iter()
            .map(|request| request_user_content(request))
            .collect::<Vec<_>>();
        assert_eq!(user_contents.len(), retry_chunks.len() + 1);
        assert!(user_contents[0].contains("Chunk: 1/1"));
        assert!(user_contents[0].contains(&first_paragraph));
        assert!(user_contents[0].contains(&second_paragraph));
        for (chunk, request) in retry_chunks.iter().zip(user_contents.iter().skip(1)) {
            assert!(request.contains(chunk));
        }
    }

    #[tokio::test]
    async fn markdown_translation_retries_length_limited_long_line_with_smaller_chunks() {
        let markdown = "Alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu.";
        assert_eq!(
            split_markdown_chunks(markdown, MARKDOWN_CHUNK_CHARS).len(),
            1
        );
        let retry_max_chars = MARKDOWN_CHUNK_CHARS.min(markdown.len()) / 2;
        let retry_chunks = split_markdown_chunks(markdown, retry_max_chars);
        assert!(retry_chunks.len() > 1);
        assert!(retry_chunks
            .iter()
            .all(|chunk| chunk.len() <= retry_max_chars));

        let translations = (1..=retry_chunks.len())
            .map(|idx| format!("第{idx}小段。"))
            .collect::<Vec<_>>();
        let bodies = std::iter::once(chat_body("partial translation", "length", 1, 1))
            .chain(
                translations
                    .iter()
                    .enumerate()
                    .map(|(idx, text)| chat_body(text, "stop", (idx + 2) as u32, (idx + 3) as u32)),
            )
            .collect::<Vec<_>>();
        let (base_url, requests) = serve_chat_sequence(bodies).await;
        let client = reqwest::Client::new();

        let result =
            translate_markdown_text(&client, &profile(&base_url), "A paper", markdown, "Chinese")
                .await
                .unwrap();

        assert_eq!(result.markdown, translations.join("\n\n"));
        assert_eq!(requests.lock().await.len(), retry_chunks.len() + 1);
    }

    async fn serve_chat_once(body: &str) -> String {
        use tokio::io::{AsyncReadExt, AsyncWriteExt};
        use tokio::net::TcpListener;

        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        let response = format!(
            "HTTP/1.1 200 OK\r\ncontent-type: application/json\r\ncontent-length: {}\r\nconnection: close\r\n\r\n{}",
            body.len(),
            body
        );
        tokio::spawn(async move {
            let (mut socket, _) = listener.accept().await.unwrap();
            let mut request = [0_u8; 2048];
            let _ = socket.read(&mut request).await.unwrap();
            socket.write_all(response.as_bytes()).await.unwrap();
        });
        format!("http://{addr}/v1")
    }

    async fn serve_chat_sequence(
        bodies: Vec<String>,
    ) -> (String, std::sync::Arc<tokio::sync::Mutex<Vec<String>>>) {
        use tokio::io::AsyncWriteExt;
        use tokio::net::TcpListener;

        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        let requests = std::sync::Arc::new(tokio::sync::Mutex::new(Vec::new()));
        let request_log = std::sync::Arc::clone(&requests);
        tokio::spawn(async move {
            for body in bodies {
                let (mut socket, _) = listener.accept().await.unwrap();
                let request = read_http_request(&mut socket).await;
                request_log.lock().await.push(request);
                let response = format!(
                    "HTTP/1.1 200 OK\r\ncontent-type: application/json\r\ncontent-length: {}\r\nconnection: close\r\n\r\n{}",
                    body.len(),
                    body
                );
                socket.write_all(response.as_bytes()).await.unwrap();
            }
        });
        (format!("http://{addr}/v1"), requests)
    }

    async fn read_http_request(socket: &mut tokio::net::TcpStream) -> String {
        use tokio::io::AsyncReadExt;
        let mut request = Vec::new();
        let mut buf = [0_u8; 1024];
        loop {
            let n = socket.read(&mut buf).await.unwrap();
            if n == 0 {
                break;
            }
            request.extend_from_slice(&buf[..n]);
            let Some(header_end) = http_header_end(&request) else {
                continue;
            };
            let content_length = http_content_length(&request[..header_end]);
            let expected_len = header_end + 4 + content_length;
            if request.len() >= expected_len {
                break;
            }
        }
        String::from_utf8(request).unwrap()
    }

    fn http_header_end(request: &[u8]) -> Option<usize> {
        request.windows(4).position(|window| window == b"\r\n\r\n")
    }

    fn http_content_length(headers: &[u8]) -> usize {
        String::from_utf8_lossy(headers)
            .lines()
            .find_map(|line| {
                let (name, value) = line.split_once(':')?;
                name.eq_ignore_ascii_case("content-length")
                    .then(|| value.trim().parse().unwrap())
            })
            .unwrap_or(0)
    }

    fn chat_body(
        content: &str,
        finish_reason: &str,
        prompt_tokens: u32,
        completion_tokens: u32,
    ) -> String {
        serde_json::json!({
            "id": "x",
            "model": "limit-model",
            "choices": [{
                "message": { "role": "assistant", "content": content },
                "finish_reason": finish_reason,
            }],
            "usage": {
                "prompt_tokens": prompt_tokens,
                "completion_tokens": completion_tokens,
                "total_tokens": prompt_tokens + completion_tokens,
            },
        })
        .to_string()
    }

    fn request_user_content(request: &str) -> String {
        let body = request.split_once("\r\n\r\n").unwrap().1;
        let value: serde_json::Value = serde_json::from_str(body).unwrap();
        value["messages"]
            .as_array()
            .unwrap()
            .iter()
            .find(|message| message["role"] == "user")
            .and_then(|message| message["content"].as_str())
            .unwrap()
            .to_string()
    }

    fn profile(base_url: &str) -> LlmProfile {
        LlmProfile {
            name: "test".into(),
            base_url: base_url.into(),
            api_key: String::new(),
            chat_model: "test-model".into(),
            embed_model: None,
            max_tokens: 128,
            temperature: 0.2,
        }
    }

    #[test]
    fn markdown_chunks_respect_longer_fence_delimiters() {
        let markdown = "````\n```\n\ninner\n````";

        let chunks = split_markdown_chunks(markdown, 8);

        assert_eq!(chunks, vec![markdown.to_string()]);
    }

    #[test]
    fn cleans_pdf_page_artifacts_and_repeated_headers() {
        let markdown = "<!-- page:1 -->\nLitFolio Header\n1\n# Title\nBody one.\nFooter Text\n\n<!-- page:2 -->\nLitFolio Header\nPage 2\n## Method\nBody two.\nFooter Text\n\n<!-- page:3 -->\nLitFolio Header\n3 of 10\n## Results\nBody three.\nFooter Text";

        let cleaned = clean_pdf_markdown_for_translation(markdown);

        assert!(!cleaned.contains("LitFolio Header"));
        assert!(!cleaned.contains("Footer Text"));
        assert!(!cleaned.contains("<!-- page:"));
        assert!(!cleaned.contains("Page 2"));
        assert!(cleaned.contains("# Title"));
        assert!(cleaned.contains("Body three."));
    }

    #[test]
    fn cleaning_keeps_page_like_lines_inside_code_fence() {
        let markdown = "```text\n1\nPage 2\n```";

        assert_eq!(clean_pdf_markdown_for_translation(markdown), markdown);
    }

    #[test]
    fn cleaning_keeps_page_comments_and_blank_lines_inside_code_fence() {
        let markdown = "```text\nline 1\n\n<!-- page:2 -->\n\nPage 2\n```";

        assert_eq!(clean_pdf_markdown_for_translation(markdown), markdown);
    }

    #[test]
    fn cleaning_keeps_code_fence_spanning_page_comment_while_dropping_margins() {
        let markdown = "<!-- page:1 -->\nRepeated Header\n```text\n1\n\n<!-- page:2 -->\n\nPage 2\n```\nRepeated Footer\n\n<!-- page:3 -->\nRepeated Header\nBody\nRepeated Footer\n\n<!-- page:4 -->\nRepeated Header\nMore body\nRepeated Footer";

        let cleaned = clean_pdf_markdown_for_translation(markdown);

        assert!(cleaned.contains("```text\n1\n\n<!-- page:2 -->\n\nPage 2\n```"));
        assert!(!cleaned.contains("Repeated Header"));
        assert!(!cleaned.contains("Repeated Footer"));
    }

    #[test]
    fn clean_translated_markdown_keeps_page_like_lines_inside_code_fence() {
        let markdown = "```text\n1\nPage 2\n<!-- page:2 -->\n```\n\n正文";

        assert_eq!(clean_translated_markdown(markdown), markdown);
    }

    #[test]
    fn clean_translated_markdown_removes_model_page_artifacts() {
        let markdown = "# 标题\n\n第 1 页\n\n正文\n\n<!-- page:2 -->";

        assert_eq!(clean_translated_markdown(markdown), "# 标题\n\n正文");
    }

    #[test]
    fn keeps_legitimate_fenced_code_reply() {
        let code = "```python\nprint(1)\n```";

        assert_eq!(strip_markdown_fence(code, code), code);
    }

    #[test]
    fn keeps_legitimate_markdown_fenced_code_reply() {
        let code = "```markdown\n# literal markdown fixture\n```";

        assert_eq!(strip_markdown_fence(code, code), code);
    }
    #[test]
    fn strips_markdown_fence_wrapping_model_reply() {
        assert_eq!(
            strip_markdown_fence("```markdown\n# 译文\n```", "# Source"),
            "# 译文"
        );
    }
}
