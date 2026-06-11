use crate::ai::{expand_search_query, LlmProfile};
use crate::storage::{retrieval, Paper, PaperRepo};
use crate::AppState;

pub(super) struct RetrievalRequest<'a> {
    pub profile: &'a LlmProfile,
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

struct RawSearchRequest<'a, 'b> {
    question: &'a str,
    limit: i64,
    used_terms: &'b mut Vec<String>,
}

struct FinishRequest<'a> {
    question: &'a str,
    limit: i64,
    papers: Vec<Paper>,
    used_terms: Vec<String>,
}

pub(super) async fn retrieve_papers(
    state: &AppState,
    repo: &PaperRepo<'_>,
    request: RetrievalRequest<'_>,
) -> RetrievalResult {
    let expanded_terms = expand_terms(state, request.profile, request.question).await;
    let search = SearchRequest {
        question: request.question,
        limit: request.limit,
        expanded_terms: &expanded_terms,
    };
    let explicit_papers = explicit_title_search(repo, request.question, request.limit).await;
    let semantic_papers = initial_search(state, repo, search).await;
    let mut papers = merge_paper_lists(explicit_papers, semantic_papers, request.limit);
    let mut used_terms = terms_for_search(request.question, &expanded_terms);

    if papers.is_empty() && !expanded_terms.is_empty() {
        papers = raw_search(
            repo,
            RawSearchRequest {
                question: request.question,
                limit: request.limit,
                used_terms: &mut used_terms,
            },
        )
        .await;
    }
    if papers.is_empty() && !expanded_terms.is_empty() {
        papers = expanded_or_search(repo, &expanded_terms, request.limit).await;
    }
    finish_search(
        repo,
        FinishRequest {
            question: request.question,
            limit: request.limit,
            papers,
            used_terms,
        },
    )
    .await
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

async fn finish_search(repo: &PaperRepo<'_>, request: FinishRequest<'_>) -> RetrievalResult {
    let mut papers = request.papers;
    if papers.is_empty() {
        papers = fuzzy_search(repo, request.question, request.limit).await;
    }
    if papers.is_empty() {
        papers = repo.list_recent(request.limit).await.unwrap_or_default();
    }
    RetrievalResult {
        papers,
        used_terms: request.used_terms,
    }
}

async fn expand_terms(state: &AppState, profile: &LlmProfile, question: &str) -> Vec<String> {
    match expand_search_query(&state.http, profile, question).await {
        Ok(eq) => eq.terms,
        Err(_) => Vec::new(),
    }
}

async fn initial_search(
    state: &AppState,
    repo: &PaperRepo<'_>,
    request: SearchRequest<'_>,
) -> Vec<Paper> {
    if request.expanded_terms.is_empty() {
        return repo
            .search(request.question, request.limit)
            .await
            .unwrap_or_default();
    }
    retrieval::search_papers_multi_term(&state.pool, request.expanded_terms, request.limit).await
}

async fn raw_search(repo: &PaperRepo<'_>, request: RawSearchRequest<'_, '_>) -> Vec<Paper> {
    let raw_hits = repo
        .search(request.question, request.limit)
        .await
        .unwrap_or_default();
    if !raw_hits.is_empty() {
        request.used_terms.push(request.question.to_string());
    }
    raw_hits
}

async fn expanded_or_search(
    repo: &PaperRepo<'_>,
    expanded_terms: &[String],
    limit: i64,
) -> Vec<Paper> {
    let all_words = expanded_terms.join(" ");
    repo.search_or(&all_words, limit).await.unwrap_or_default()
}

async fn fuzzy_search(repo: &PaperRepo<'_>, question: &str, limit: i64) -> Vec<Paper> {
    let fuzzy = fuzzy_phrases(question);
    if fuzzy.is_empty() {
        return Vec::new();
    }
    repo.search_or(&fuzzy.join(" "), limit)
        .await
        .unwrap_or_default()
}

fn terms_for_search(question: &str, expanded_terms: &[String]) -> Vec<String> {
    if expanded_terms.is_empty() {
        return vec![question.to_string()];
    }
    expanded_terms.to_vec()
}

/// Split a Chinese question into meaningful keyword phrases by stripping
/// common grammar particles and stop words. Used as a last-ditch fuzzy
/// search when the exact AND/OR strategies miss.
fn fuzzy_phrases(question: &str) -> Vec<String> {
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
}
