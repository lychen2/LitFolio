use std::collections::BTreeSet;

use anyhow::Result;
use regex::Regex;
use serde::{Deserialize, Serialize};

use crate::commands::term_filter::is_term_candidate;
use crate::storage::{Paper, PaperRepo, PaperTerm, PaperTermRepo};

const MAX_TERMS: usize = 8;
const MAX_LINKED_PAPERS: usize = 3;
const MAX_SNIPPET_CHARS: usize = 180;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TermInsight {
    pub term: String,
    pub local_definition: String,
    pub local_evidence: String,
    pub linked_papers: Vec<LinkedPaper>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LinkedPaper {
    pub paper_id: String,
    pub title: String,
    pub year: Option<i32>,
    pub relation: String,
    pub snippet: String,
}

pub async fn build_term_insights(
    repo: &PaperRepo<'_>,
    term_repo: &PaperTermRepo<'_>,
    paper: &Paper,
    selection: &str,
) -> Result<Vec<TermInsight>> {
    let terms = match_terms(
        selection,
        &term_repo.list_by_paper(&paper.id).await.unwrap_or_default(),
    );
    let terms = if terms.is_empty() {
        extract_terms(selection)
            .into_iter()
            .map(|term| StoredOrRawTerm::Raw(term))
            .collect()
    } else {
        terms
    };
    let mut insights = Vec::new();
    for term in terms {
        let term_text = term.term().to_string();
        let local_evidence = term
            .stored_evidence()
            .unwrap_or_else(|| local_evidence(paper, &term_text));
        let linked_papers = linked_papers(repo, paper, &term_text).await?;
        if local_evidence.is_empty() && linked_papers.is_empty() {
            continue;
        }
        insights.push(TermInsight {
            local_definition: term.stored_definition().unwrap_or_else(|| {
                derive_local_definition(&term_text, &local_evidence, linked_papers.first())
            }),
            local_evidence,
            linked_papers,
            term: term_text,
        });
    }
    Ok(insights)
}

enum StoredOrRawTerm {
    Stored(PaperTerm),
    Raw(String),
}

impl StoredOrRawTerm {
    fn term(&self) -> &str {
        match self {
            StoredOrRawTerm::Stored(term) => &term.term,
            StoredOrRawTerm::Raw(term) => term,
        }
    }

    fn stored_definition(&self) -> Option<String> {
        match self {
            StoredOrRawTerm::Stored(term) => Some(term.local_definition.clone()),
            StoredOrRawTerm::Raw(_) => None,
        }
    }

    fn stored_evidence(&self) -> Option<String> {
        match self {
            StoredOrRawTerm::Stored(term) => Some(term.local_evidence.clone()),
            StoredOrRawTerm::Raw(_) => None,
        }
    }
}

fn match_terms(selection: &str, terms: &[PaperTerm]) -> Vec<StoredOrRawTerm> {
    let lower_selection = selection.to_lowercase();
    terms
        .iter()
        .filter(|term| lower_selection.contains(&term.normalized_term))
        .cloned()
        .map(StoredOrRawTerm::Stored)
        .collect()
}

fn extract_terms(selection: &str) -> Vec<String> {
    // Selection-time extraction: capture acronyms (SSIM), Title-Case proper
    // nouns ("MetaDesigner"), and 1-3 word noun phrases. The shared term
    // filter rejects sentence fragments downstream so we can keep these regex
    // patterns broad.
    let acronym_re = Regex::new(r"\b[A-Z][A-Z0-9-]{1,}\b").expect("valid acronym regex");
    let title_re = Regex::new(r"\b[A-Z][a-z]{3,}\b").expect("valid title regex");
    let phrase_re =
        Regex::new(r"\b(?:[A-Z][a-z]+(?:[- ][A-Za-z0-9]+){0,3}|[a-z]+(?:[- ][a-z]+){1,3})\b")
            .expect("valid phrase regex");
    let mut seen = BTreeSet::new();
    for cap in acronym_re.find_iter(selection) {
        push_term(&mut seen, cap.as_str());
    }
    for cap in title_re.find_iter(selection) {
        push_term(&mut seen, cap.as_str());
    }
    for cap in phrase_re.find_iter(selection) {
        push_term(&mut seen, cap.as_str());
    }
    seen.into_iter().take(MAX_TERMS).collect()
}

fn push_term(seen: &mut BTreeSet<String>, raw: &str) {
    let term = raw.trim_matches(|ch: char| !ch.is_alphanumeric() && ch != '-' && ch != ' ');
    // Single source of truth on what counts as a real term — keeps the
    // selection-time and corpus-time extractors in sync.
    if !is_term_candidate(term) {
        return;
    }
    seen.insert(term.to_string());
}

fn local_evidence(paper: &Paper, term: &str) -> String {
    let candidates = [
        paper.abstract_text.as_deref(),
        paper.tldr.as_deref(),
        paper.research_question.as_deref(),
        paper.method.as_deref(),
        paper.comparison.as_deref(),
        paper.limitations.as_deref(),
    ];
    for text in candidates.into_iter().flatten() {
        if let Some(snippet) = find_snippet(text, term) {
            return snippet;
        }
    }
    String::new()
}

async fn linked_papers(
    repo: &PaperRepo<'_>,
    current: &Paper,
    term: &str,
) -> Result<Vec<LinkedPaper>> {
    let hits = repo.search(term, 12).await.unwrap_or_default();
    let mut links = Vec::new();
    for paper in hits {
        if paper.id == current.id {
            continue;
        }
        let snippet = paper_snippet(&paper, term);
        if snippet.is_empty() {
            continue;
        }
        let relation = classify_relation(&paper, term);
        links.push(LinkedPaper {
            paper_id: paper.id,
            title: paper.title,
            year: paper.year,
            relation,
            snippet,
        });
        if links.len() >= MAX_LINKED_PAPERS {
            break;
        }
    }
    Ok(links)
}

fn paper_snippet(paper: &Paper, term: &str) -> String {
    let candidates = [
        paper.abstract_text.as_deref(),
        paper.tldr.as_deref(),
        paper.method.as_deref(),
        paper.comparison.as_deref(),
        paper.limitations.as_deref(),
    ];
    for text in candidates.into_iter().flatten() {
        if let Some(snippet) = find_snippet(text, term) {
            return snippet;
        }
    }
    String::new()
}

fn find_snippet(text: &str, needle: &str) -> Option<String> {
    let haystack = text.trim();
    if haystack.is_empty() {
        return None;
    }
    let lower_hay = haystack.to_lowercase();
    let lower_needle = needle.to_lowercase();
    let idx = lower_hay.find(&lower_needle)?;
    let start = idx.saturating_sub(60);
    let end = (idx + needle.len() + 80).min(haystack.len());
    Some(truncate(haystack[start..end].trim(), MAX_SNIPPET_CHARS))
}

fn derive_local_definition(term: &str, evidence: &str, linked: Option<&LinkedPaper>) -> String {
    if !evidence.is_empty() {
        return format!("当前论文在这段上下文里把 {term} 放在该论证链中使用。");
    }
    if let Some(paper) = linked {
        return format!(
            "{term} 在库内其他论文中也出现过，可从「{}」继续回看。",
            paper.title
        );
    }
    format!("{term} 是本次选段中的关键术语。")
}

fn classify_relation(paper: &Paper, term: &str) -> String {
    let lower_term = term.to_lowercase();
    let method = paper.method.as_deref().unwrap_or("").to_lowercase();
    let comparison = paper.comparison.as_deref().unwrap_or("").to_lowercase();
    if method.contains(&lower_term) {
        return "方法实现".into();
    }
    if comparison.contains(&lower_term) {
        return "对比讨论".into();
    }
    "相关提及".into()
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

    #[test]
    fn extracts_terms_from_selection() {
        let terms =
            extract_terms("We compare Transformer encoders with CNN baselines on ImageNet.");
        assert!(terms.iter().any(|term| term == "Transformer"));
        assert!(terms.iter().any(|term| term == "CNN"));
    }

    #[test]
    fn snippet_finds_local_window() {
        let snippet = find_snippet(
            "This paper introduces retrieval augmented generation for long-context QA.",
            "generation",
        )
        .unwrap();
        assert!(snippet.contains("retrieval augmented generation"));
    }
}
