use crate::ai::{expand_search_query, LlmProfile};
use crate::storage::{retrieval, Paper, PaperRepo};
use crate::AppState;
use std::collections::{BTreeSet, HashMap};

pub(super) struct RetrievalRequest<'a> {
    pub profile: Option<&'a LlmProfile>,
    pub question: &'a str,
    pub limit: i64,
}

pub(super) struct RetrievalResult {
    pub papers: Vec<Paper>,
    pub used_terms: Vec<String>,
}

struct SearchRequest<'a> {
    question: &'a str,
    limit: i64,
    expanded_terms: &'a [String],
}

#[derive(Debug)]
struct ScoredPaper {
    paper: Paper,
    score: i64,
    matched_terms: BTreeSet<String>,
}

pub(super) async fn retrieve_papers(
    state: &AppState,
    repo: &PaperRepo<'_>,
    request: RetrievalRequest<'_>,
) -> RetrievalResult {
    let expanded_terms = match request.profile {
        Some(profile) => expand_terms(state, profile, request.question).await,
        None => Vec::new(),
    };
    let search = SearchRequest {
        question: request.question,
        limit: request.limit,
        expanded_terms: &expanded_terms,
    };
    let papers = hybrid_search(state, repo, search).await;
    let used_terms = terms_for_search(request.question, &expanded_terms);
    RetrievalResult { papers, used_terms }
}

fn add_candidates(
    scored: &mut HashMap<String, ScoredPaper>,
    hits: Vec<Paper>,
    base_score: i64,
    matched_term: &str,
) {
    let term = matched_term.trim();
    for (index, paper) in hits.into_iter().enumerate() {
        let increment = base_score + (20_i64 - index as i64).max(0);
        let entry = scored
            .entry(paper.id.clone())
            .or_insert_with(|| ScoredPaper {
                paper,
                score: 0,
                matched_terms: BTreeSet::new(),
            });
        entry.score += increment;
        if !term.is_empty() {
            entry.matched_terms.insert(term.to_string());
        }
    }
}

fn ranked_candidates(scored: HashMap<String, ScoredPaper>, limit: i64) -> Vec<Paper> {
    let mut entries = scored.into_values().collect::<Vec<_>>();
    entries.sort_by(|a, b| {
        b.score
            .cmp(&a.score)
            .then_with(|| b.matched_terms.len().cmp(&a.matched_terms.len()))
            .then_with(|| b.paper.year.unwrap_or(0).cmp(&a.paper.year.unwrap_or(0)))
            .then_with(|| b.paper.added_at.cmp(&a.paper.added_at))
    });
    entries
        .into_iter()
        .take(limit as usize)
        .map(|entry| entry.paper)
        .collect()
}

async fn hybrid_search(
    state: &AppState,
    repo: &PaperRepo<'_>,
    request: SearchRequest<'_>,
) -> Vec<Paper> {
    let mut scored: HashMap<String, ScoredPaper> = HashMap::new();
    let per_route_limit = (request.limit * 4).max(32);

    // Route 1: Title match
    let title_hits = explicit_title_search(repo, request.question, per_route_limit).await;
    add_candidates(&mut scored, title_hits, 1000, request.question);

    // Route 2: Expanded terms strict
    for term in request.expanded_terms {
        let escaped = retrieval::escape_fts(term);
        if !escaped.is_empty() {
            let hits = retrieval::search_papers(&state.pool, &escaped, per_route_limit)
                .await
                .unwrap_or_default();
            add_candidates(&mut scored, hits, 160, term);
        }
    }

    // Route 3: Raw question strict
    let raw_hits = repo
        .search(request.question, per_route_limit)
        .await
        .unwrap_or_default();
    add_candidates(&mut scored, raw_hits, 120, request.question);

    // Route 4: Expanded terms OR
    if !request.expanded_terms.is_empty() {
        let expanded_joined = request.expanded_terms.join(" ");
        let or_hits = expanded_or_search(repo, request.expanded_terms, per_route_limit).await;
        add_candidates(&mut scored, or_hits, 90, &expanded_joined);
    }

    // Route 5: Raw question OR
    let or_hits = repo
        .search_or(request.question, per_route_limit)
        .await
        .unwrap_or_default();
    add_candidates(&mut scored, or_hits, 70, request.question);

    // Route 6: Chinese fuzzy OR
    let fuzzy = fuzzy_phrases(request.question);
    if !fuzzy.is_empty() {
        let fuzzy_joined = fuzzy.join(" ");
        let fuzzy_hits = repo
            .search_or(&fuzzy_joined, per_route_limit)
            .await
            .unwrap_or_default();
        add_candidates(&mut scored, fuzzy_hits, 60, &fuzzy_joined);
    }

    ranked_candidates(scored, request.limit)
}

async fn explicit_title_search(repo: &PaperRepo<'_>, question: &str, limit: i64) -> Vec<Paper> {
    let titles = extract_quoted_titles(question);
    if titles.is_empty() {
        return Vec::new();
    }
    let mut papers = Vec::new();
    for title in titles {
        let strict_hits = repo.search(&title, 3).await.unwrap_or_default();
        let mut matched = matching_title_hits(strict_hits, &title);
        if matched.is_empty() {
            let broad_hits = repo.search_or(&title, 3).await.unwrap_or_default();
            matched = matching_title_hits(broad_hits, &title);
        }
        papers = merge_paper_lists(papers, matched, limit);
        if papers.len() >= limit as usize {
            break;
        }
    }
    papers
}

fn matching_title_hits(hits: Vec<Paper>, query_title: &str) -> Vec<Paper> {
    let query = normalize_title_for_match(query_title);
    hits.into_iter()
        .filter(|paper| {
            let title = normalize_title_for_match(&paper.title);
            title == query || title.contains(&query) || query.contains(&title)
        })
        .collect()
}

fn merge_paper_lists(mut primary: Vec<Paper>, secondary: Vec<Paper>, limit: i64) -> Vec<Paper> {
    for paper in secondary {
        if primary.iter().any(|existing| existing.id == paper.id) {
            continue;
        }
        primary.push(paper);
        if primary.len() >= limit as usize {
            break;
        }
    }
    primary
}

fn extract_quoted_titles(question: &str) -> Vec<String> {
    let mut titles = Vec::new();
    let mut current = String::new();
    let mut in_quote = false;
    for ch in question.chars() {
        if matches!(ch, '"' | '“' | '”') {
            if in_quote {
                push_title(&mut titles, &current);
                current.clear();
                in_quote = false;
            } else {
                in_quote = true;
                current.clear();
            }
            continue;
        }
        if in_quote {
            current.push(ch);
        }
    }
    titles.sort();
    titles.dedup();
    titles
}

fn push_title(titles: &mut Vec<String>, raw: &str) {
    let title = raw.trim();
    if title.chars().count() >= 8 && title.chars().any(|ch| ch.is_alphabetic()) {
        titles.push(title.to_string());
    }
}

fn normalize_title_for_match(title: &str) -> String {
    title
        .chars()
        .map(|ch| {
            if ch.is_alphanumeric() {
                ch.to_ascii_lowercase()
            } else {
                ' '
            }
        })
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

async fn expand_terms(state: &AppState, profile: &LlmProfile, question: &str) -> Vec<String> {
    match expand_search_query(&state.http, profile, question).await {
        Ok(eq) => eq.terms,
        Err(_) => Vec::new(),
    }
}

async fn expanded_or_search(
    repo: &PaperRepo<'_>,
    expanded_terms: &[String],
    limit: i64,
) -> Vec<Paper> {
    let all_words = expanded_terms.join(" ");
    repo.search_or(&all_words, limit).await.unwrap_or_default()
}

fn terms_for_search(question: &str, expanded_terms: &[String]) -> Vec<String> {
    let mut out = Vec::new();
    // 1. Expanded terms
    for term in expanded_terms {
        push_unique_term(&mut out, term);
    }
    // 2. Raw question
    push_unique_term(&mut out, question);
    // 3. Fuzzy phrases
    for phrase in fuzzy_phrases(question) {
        push_unique_term(&mut out, &phrase);
    }
    out
}

fn push_unique_term(out: &mut Vec<String>, raw: &str) {
    let term = raw.trim();
    if !term.is_empty() && !out.iter().any(|existing| existing == term) {
        out.push(term.to_string());
    }
}

/// Split a Chinese question into meaningful keyword phrases by stripping
/// common grammar particles and stop words. Used as a last-ditch fuzzy
/// search when the exact AND/OR strategies miss.
pub(super) fn fuzzy_phrases(question: &str) -> Vec<String> {
    let stop: &[char] = &[
        '的', '是', '了', '在', '和', '与', '及', '对', '把', '被', '从', '而', '且', '但', '或',
        '也', '都', '就', '着', '过', '之', '不', '要', '会', '能', '可', '以', '到', '为', '上',
        '中', '下', '有', '来', '去', '说', '想', '看', '用', '这', '那', '哪', '呢', '吗', '啊',
        '吧', '么', '嘛', '呀', '哦', '？', '，', '。', '！', '：', '；', '“', '”', '（', '）',
        '、', '《', '》', '…', '—', ' ', '\t', '\n', '\r',
    ];
    let mut phrases = Vec::new();
    let mut current = String::new();
    for ch in question.chars() {
        if stop.contains(&ch) {
            push_phrase(&mut phrases, &mut current);
        } else {
            current.push(ch);
        }
    }
    push_phrase(&mut phrases, &mut current);
    phrases.retain(|p| p.chars().filter(|c| !c.is_ascii_whitespace()).count() >= 2);
    phrases
}

fn push_phrase(phrases: &mut Vec<String>, current: &mut String) {
    let trimmed = current.trim();
    if !trimmed.is_empty() {
        phrases.push(trimmed.to_string());
    }
    current.clear();
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extracts_numbered_reference_titles() {
        let question = r#"1. D. Strickland and G. Mourou, "Compression of amplified chirped optical pulses,"
2. P. M. Paul et al., "Observation of a train of attosecond pulses from high harmonic generation,""#;
        let titles = extract_quoted_titles(question);
        assert_eq!(
            titles,
            vec![
                "Compression of amplified chirped optical pulses,".to_string(),
                "Observation of a train of attosecond pulses from high harmonic generation,"
                    .to_string(),
            ]
        );
    }

    #[test]
    fn normalizes_titles_for_punctuation_insensitive_match() {
        assert_eq!(
            normalize_title_for_match("Compression of amplified chirped optical pulses,"),
            "compression of amplified chirped optical pulses"
        );
        assert_eq!(
            normalize_title_for_match(
                "Towards zeptosecond-scale pulses from x-ray free-electron lasers"
            ),
            "towards zeptosecond scale pulses from x ray free electron lasers"
        );
    }

    fn paper(id: &str, title: &str, year: i32, added_at: &str) -> Paper {
        Paper {
            id: id.to_string(),
            title: title.to_string(),
            authors: Vec::new(),
            year: Some(year),
            venue: None,
            doi: None,
            arxiv_id: None,
            abstract_text: None,
            pdf_path: None,
            note_path: None,
            added_at: added_at.parse().unwrap(),
            updated_at: added_at.parse().unwrap(),
            read_status: crate::storage::ReadStatus::Unread,
            tldr: None,
            research_question: None,
            method: None,
            dataset: None,
            key_findings: Vec::new(),
            limitations: None,
            comparison: None,
            title_translated: None,
            abstract_translated: None,
            translate_target_lang: None,
            translated_at: None,
            bibtex: None,
            last_exported_at: None,
        }
    }

    #[test]
    fn ranked_candidates_prefers_multi_route_hit_over_single_route_hit() {
        let mut scored = HashMap::new();
        let a = paper("A", "Raw Match", 2025, "100");
        let b = paper("B", "Multi Route Match", 2024, "90");

        add_candidates(&mut scored, vec![a], 120, "raw");
        add_candidates(&mut scored, vec![b.clone()], 70, "or");
        add_candidates(&mut scored, vec![b], 60, "fuzzy");

        let ranked = ranked_candidates(scored, 2);
        assert_eq!(ranked[0].id, "B");
        assert_eq!(ranked[1].id, "A");
    }

    #[test]
    fn terms_for_search_keeps_expanded_raw_and_fuzzy_terms() {
        let question = "飞秒激光在材料加工中的应用";
        let expanded_terms = vec![
            "femtosecond laser".to_string(),
            "laser micromachining".to_string(),
        ];

        let terms = terms_for_search(question, &expanded_terms);

        assert!(terms.iter().any(|term| term == "femtosecond laser"));
        assert!(terms.iter().any(|term| term == "laser micromachining"));
        assert!(terms.iter().any(|term| term == question));
        assert!(terms
            .iter()
            .any(|term| term == "飞秒激光" || term == "材料加工"));
    }
}
