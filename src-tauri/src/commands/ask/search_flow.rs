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
    let mut papers = initial_search(state, repo, search).await;
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
