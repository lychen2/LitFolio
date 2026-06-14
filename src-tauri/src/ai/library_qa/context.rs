use std::collections::HashMap;

use crate::storage::{Highlight, Paper};

use super::AskSource;

const MAX_CONTEXT_TOKENS: usize = 10_000;
const MAX_SNIPPET_TOKENS: usize = 800;
const MAX_HIGHLIGHTS_PER_PAPER: usize = 3;
const MAX_HIGHLIGHT_TEXT_CHARS: usize = 240;

pub(super) fn build_sources(
    papers: &[Paper],
    highlights: &HashMap<String, Vec<Highlight>>,
    document_snippets: &HashMap<String, String>,
    terms: &[String],
) -> Vec<AskSource> {
    let mut sources = papers
        .iter()
        .filter_map(|p| {
            let hl = highlights.get(&p.id).map(Vec::as_slice).unwrap_or(&[]);
            let document = document_snippets.get(&p.id).map(String::as_str);
            let snippet = paper_snippet(p, hl, document, terms);
            if snippet.is_empty() {
                return None;
            }
            Some((
                paper_relevance_score(p, &snippet, terms),
                AskSource {
                    paper_id: p.id.clone(),
                    title: p.title.clone(),
                    year: p.year,
                    authors: p.authors.clone(),
                    snippet,
                },
            ))
        })
        .collect::<Vec<_>>();
    sources.sort_by_key(|entry| std::cmp::Reverse(entry.0));
    sources.into_iter().map(|(_, source)| source).collect()
}

fn paper_snippet(
    p: &Paper,
    highlights: &[Highlight],
    document_snippet: Option<&str>,
    terms: &[String],
) -> String {
    let mut parts = Vec::new();
    push_part(&mut parts, "TL;DR", p.tldr.as_deref());
    push_part(&mut parts, "Abstract", p.abstract_text.as_deref());
    push_part(&mut parts, "Document excerpts (Markdown)", document_snippet);
    push_if_relevant(&mut parts, "Problem", p.research_question.as_deref(), terms);
    push_if_relevant(&mut parts, "Method", p.method.as_deref(), terms);
    push_if_relevant(&mut parts, "Comparison", p.comparison.as_deref(), terms);
    push_if_relevant(&mut parts, "Limitations", p.limitations.as_deref(), terms);

    if !p.key_findings.is_empty() {
        parts.push(format!("Key findings: {}", p.key_findings.join("; ")));
    }
    let quotes = highlight_quotes(highlights);
    if !quotes.is_empty() {
        parts.push(format!("User highlights: {}", quotes.join(" / ")));
    }
    truncate_to_tokens(&parts.join("\n"), MAX_SNIPPET_TOKENS)
}

fn highlight_quotes(highlights: &[Highlight]) -> Vec<String> {
    highlights
        .iter()
        .take(MAX_HIGHLIGHTS_PER_PAPER)
        .filter_map(|h| {
            let text = h.text.trim();
            (!text.is_empty()).then(|| format!("\"{}\"", truncate(text, MAX_HIGHLIGHT_TEXT_CHARS)))
        })
        .collect()
}

fn push_part(parts: &mut Vec<String>, label: &str, value: Option<&str>) {
    if let Some(text) = value.map(str::trim).filter(|s| !s.is_empty()) {
        parts.push(format!("{label}: {text}"));
    }
}

fn push_if_relevant(parts: &mut Vec<String>, label: &str, value: Option<&str>, terms: &[String]) {
    if let Some(text) = value.map(str::trim).filter(|s| !s.is_empty()) {
        if terms.is_empty() || token_overlap_score(text, terms) > 0 {
            parts.push(format!("{label}: {text}"));
        }
    }
}

fn paper_relevance_score(paper: &Paper, snippet: &str, terms: &[String]) -> usize {
    title_overlap_score(&paper.title, terms) * 4 + token_overlap_score(snippet, terms)
}

fn title_overlap_score(title: &str, terms: &[String]) -> usize {
    token_overlap_score(title, terms)
}

fn token_overlap_score(text: &str, terms: &[String]) -> usize {
    if terms.is_empty() {
        return 0;
    }
    let tokens = text_tokens(text);
    terms
        .iter()
        .map(|term| {
            text_tokens(term)
                .into_iter()
                .filter(|token| tokens.contains(token))
                .count()
        })
        .sum()
}

fn text_tokens(text: &str) -> Vec<String> {
    let mut tokens = text
        .split(|ch: char| !ch.is_alphanumeric())
        .filter_map(|raw| {
            let token = raw.trim().to_lowercase();
            (token.chars().count() >= 3).then_some(token)
        })
        .collect::<Vec<_>>();
    tokens.sort();
    tokens.dedup();
    tokens
}

pub(super) fn build_context(sources: &[AskSource]) -> String {
    let mut out = String::new();
    for (idx, source) in sources.iter().enumerate() {
        let block = source_block(idx + 1, source);
        if estimate_tokens(&out) + estimate_tokens(&block) > MAX_CONTEXT_TOKENS {
            break;
        }
        out.push_str(&block);
    }
    out
}

fn source_block(index: usize, source: &AskSource) -> String {
    let authors = source
        .authors
        .iter()
        .take(4)
        .cloned()
        .collect::<Vec<_>>()
        .join(", ");
    let year = source
        .year
        .map(|y| y.to_string())
        .unwrap_or_else(|| "n.d.".into());
    format!(
        "[{index}] {} ({year})\nAuthors: {authors}\n{}\n\n",
        source.title, source.snippet,
    )
}

fn estimate_tokens(text: &str) -> usize {
    let mut weighted_chars = 0usize;
    for ch in text.chars() {
        weighted_chars += if ch.is_ascii() { 1 } else { 2 };
    }
    weighted_chars.div_ceil(4)
}

fn truncate_to_tokens(s: &str, max_tokens: usize) -> String {
    if estimate_tokens(s) <= max_tokens {
        return s.to_string();
    }
    let chars: Vec<char> = s.chars().collect();
    let mut lo = 0;
    let mut hi = chars.len();
    while lo < hi {
        let mid = (lo + hi).div_ceil(2);
        let candidate: String = chars[..mid].iter().collect();
        if estimate_tokens(&candidate) <= max_tokens {
            lo = mid;
        } else {
            hi = mid - 1;
        }
    }
    let mut out: String = chars[..lo].iter().collect();
    out.push_str("...");
    out
}

pub(super) fn truncate(s: &str, max: usize) -> String {
    if s.chars().count() <= max {
        return s.to_string();
    }
    let mut out: String = s.chars().take(max).collect();
    out.push_str("...");
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::storage::ReadStatus;
    use serde_json::json;

    #[test]
    fn builds_source_snippet_with_no_highlights() {
        let highlights = HashMap::new();
        let documents = HashMap::new();
        let sources = build_sources(&[paper()], &highlights, &documents, &[]);
        assert_eq!(sources.len(), 1);
        assert!(sources[0].snippet.contains("TL;DR"));
        assert!(sources[0].snippet.contains("Key findings"));
        assert!(sources[0].snippet.contains("Comparison"));
    }

    #[test]
    fn includes_highlights_in_snippet() {
        let mut highlights = HashMap::new();
        highlights.insert("p1".into(), vec![highlight("important quoted passage")]);
        let documents = HashMap::new();
        let sources = build_sources(&[paper()], &highlights, &documents, &[]);
        assert!(sources[0].snippet.contains("User highlights"));
        assert!(sources[0].snippet.contains("important quoted passage"));
    }

    #[test]
    fn includes_document_markdown_snippet() {
        let highlights = HashMap::new();
        let mut documents = HashMap::new();
        documents.insert(
            "p1".into(),
            "## Method\nUses a sparse attention block.".into(),
        );
        let sources = build_sources(&[paper()], &highlights, &documents, &[]);
        assert!(sources[0].snippet.contains("Document excerpts"));
        assert!(sources[0].snippet.contains("sparse attention"));
    }

    #[test]
    fn relevance_filter_skips_unrelated_sections() {
        let highlights = HashMap::new();
        let documents = HashMap::new();
        let sources = build_sources(&[paper()], &highlights, &documents, &["methods".into()]);
        assert_eq!(sources.len(), 1);
        assert!(!sources[0].snippet.contains("Comparison"));
    }

    #[test]
    fn relevance_filter_uses_token_overlap() {
        let highlights = HashMap::new();
        let documents = HashMap::new();
        let mut paper = paper();
        paper.method = Some("Uses graph neural networks for citation ranking".into());
        let sources = build_sources(
            &[paper],
            &highlights,
            &documents,
            &["neural ranking".into()],
        );
        assert!(sources[0].snippet.contains("Method"));
    }

    #[test]
    fn title_overlap_ranks_source_first() {
        let highlights = HashMap::new();
        let documents = HashMap::new();
        let mut title_hit = paper();
        title_hit.id = "title".into();
        title_hit.title = "Graph Retrieval for Scientific Papers".into();
        let mut body_hit = paper();
        body_hit.id = "body".into();
        body_hit.title = "Unrelated".into();
        body_hit.tldr = Some("Graph retrieval appears in the abstract body".into());
        let sources = build_sources(
            &[body_hit, title_hit],
            &highlights,
            &documents,
            &["graph retrieval".into()],
        );
        assert_eq!(sources[0].paper_id, "title");
    }

    fn paper() -> Paper {
        Paper {
            id: "p1".into(),
            title: "A".into(),
            authors: vec!["Ada".into()],
            year: Some(2024),
            venue: None,
            doi: None,
            arxiv_id: None,
            abstract_text: Some("abstract".into()),
            pdf_path: Some("/tmp/a.pdf".into()),
            note_path: None,
            added_at: 0,
            updated_at: 0,
            read_status: ReadStatus::Unread,
            tldr: Some("short".into()),
            research_question: None,
            method: None,
            dataset: None,
            key_findings: vec!["finding".into()],
            limitations: None,
            comparison: Some("differs from baseline by X".into()),
            title_translated: None,
            abstract_translated: None,
            translate_target_lang: None,
            translated_at: None,
            bibtex: None,
            last_exported_at: None,
        }
    }

    fn highlight(text: &str) -> Highlight {
        Highlight {
            id: "h".into(),
            paper_id: "p1".into(),
            page: 1,
            rect: json!({}),
            color: "yellow".into(),
            label: None,
            text: text.into(),
            note: None,
            summary_text: None,
            summary_model: None,
            summarized_at: None,
            translation_text: None,
            translation_target_lang: None,
            translation_model: None,
            translated_at: None,
            explanation_text: None,
            explanation_model: None,
            explained_at: None,
            created_at: 0,
        }
    }
}
