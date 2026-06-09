//! Metadata preparation for importing RSS feed items.

mod ids;
mod landing;

use std::sync::Arc;

use chrono::{Datelike, TimeZone, Utc};
use tauri::State;

use crate::ingest::{
    fetch_arxiv, fetch_doi, search_doi_by_title, search_semantic_scholar, PaperDraft, SearchResult,
};
use crate::storage::{FeedItem, FeedRepo};
use crate::AppState;

use ids::{extract_arxiv_id, extract_doi};
use landing::discover_doi_from_landing_page;

#[tauri::command]
pub async fn feed_item_prepare_draft(
    state: State<'_, Arc<AppState>>,
    item_id: String,
) -> Result<PaperDraft, String> {
    let repo = FeedRepo::new(&state.pool);
    let item = repo
        .get_item(&item_id)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "feed item not found".to_string())?;
    if let Some(metadata) = item.metadata.clone() {
        return Ok(metadata);
    }
    let (draft, source) = resolve_feed_item_metadata(&state, &item).await;
    repo.save_item_metadata(&item.id, draft.as_ref(), source)
        .await
        .map_err(|e| e.to_string())?;
    Ok(draft.unwrap_or_else(|| feed_item_fallback_draft(item)))
}

pub async fn backfill_unchecked_feed_metadata(state: &AppState, limit: i64) -> usize {
    let repo = FeedRepo::new(&state.pool);
    let Ok(items) = repo.list_unchecked_items(limit).await else {
        return 0;
    };
    let mut checked = 0;
    for item in items {
        let (draft, source) = resolve_feed_item_metadata(state, &item).await;
        if repo
            .save_item_metadata(&item.id, draft.as_ref(), source)
            .await
            .is_ok()
        {
            checked += 1;
        }
    }
    checked
}

async fn resolve_feed_item_metadata(
    state: &AppState,
    item: &FeedItem,
) -> (Option<PaperDraft>, Option<&'static str>) {
    let corpus = feed_item_corpus(item);
    if let Some(arxiv_id) = extract_arxiv_id(&corpus) {
        tracing::info!(item_id = %item.id, arxiv_id, "feed item metadata matched arXiv from RSS fields");
        if let Ok(draft) = fetch_arxiv(&state.http, &arxiv_id).await {
            return (Some(draft), Some("rss_arxiv"));
        }
    }
    if let Some(doi) = extract_doi(&corpus) {
        tracing::info!(item_id = %item.id, doi, "feed item metadata matched DOI from RSS fields");
        if let Ok(draft) = fetch_doi(&state.http, &doi).await {
            return (Some(draft), Some("rss_doi"));
        }
    }
    if let Ok(Some(doi)) =
        discover_doi_from_landing_page(&state.http_external, item.link.as_deref()).await
    {
        tracing::info!(item_id = %item.id, doi, "feed item metadata matched DOI from landing page");
        if let Ok(draft) = fetch_doi(&state.http, &doi).await {
            return (Some(draft), Some("landing_doi"));
        }
    }

    if let Ok(Some(draft)) = search_doi_by_title(&state.http, &item.title).await {
        if is_confident_crossref_title(item, &draft) {
            if let Some(doi) = draft.doi.as_deref() {
                if let Ok(crossref) = fetch_doi(&state.http, doi).await {
                    return (Some(crossref), Some("crossref_title"));
                }
            }
            return (Some(draft), Some("crossref_title"));
        }
    }
    if let Ok(Some(result)) = search_feed_item_metadata(&state.http, item).await {
        return (Some(result), Some("semantic_scholar"));
    }

    (None, None)
}

async fn search_feed_item_metadata(
    http: &reqwest::Client,
    item: &FeedItem,
) -> anyhow::Result<Option<PaperDraft>> {
    let mut results = search_semantic_scholar(http, &item.title, 3).await?;
    let Some(result) = results
        .drain(..)
        .find(|candidate| is_confident_match(item, candidate))
    else {
        return Ok(None);
    };

    let draft = result.draft;
    if let Some(arxiv_id) = draft.arxiv_id.clone() {
        if let Ok(arxiv) = fetch_arxiv(http, &arxiv_id).await {
            return Ok(Some(merge_missing_abstract(arxiv, draft)));
        }
    }
    if let Some(doi) = draft.doi.clone() {
        if let Ok(crossref) = fetch_doi(http, &doi).await {
            return Ok(Some(merge_missing_abstract(crossref, draft)));
        }
    }
    Ok(None)
}

fn feed_item_corpus(item: &FeedItem) -> String {
    [
        item.link.as_deref(),
        Some(item.entry_id.as_str()),
        Some(item.title.as_str()),
        item.summary.as_deref(),
    ]
    .into_iter()
    .flatten()
    .collect::<Vec<_>>()
    .join("\n")
}

fn feed_item_fallback_draft(item: FeedItem) -> PaperDraft {
    let corpus = feed_item_corpus(&item);
    PaperDraft {
        title: item.title,
        authors: item.authors,
        year: item.published_at.and_then(timestamp_year),
        venue: None,
        doi: extract_doi(&corpus),
        arxiv_id: extract_arxiv_id(&corpus),
        abstract_text: item.summary,
    }
}

fn merge_missing_abstract(mut primary: PaperDraft, fallback: PaperDraft) -> PaperDraft {
    if primary
        .abstract_text
        .as_deref()
        .unwrap_or_default()
        .trim()
        .is_empty()
    {
        primary.abstract_text = fallback.abstract_text;
    }
    primary
}

fn is_confident_crossref_title(item: &FeedItem, draft: &PaperDraft) -> bool {
    title_is_exact_or_near(&item.title, &draft.title)
}

fn is_confident_match(item: &FeedItem, result: &SearchResult) -> bool {
    let feed_title = normalize_title(&item.title);
    let candidate_title = normalize_title(&result.draft.title);
    if feed_title.is_empty() || candidate_title.is_empty() {
        return false;
    }
    if feed_title == candidate_title {
        return true;
    }
    if !normalized_titles_are_near(&feed_title, &candidate_title) {
        return false;
    }

    let year_matches = item
        .published_at
        .and_then(timestamp_year)
        .and_then(|item_year| result.draft.year.map(|year| item_year == year))
        .unwrap_or(false);
    let author_matches = item.authors.iter().any(|feed_author| {
        let feed_author = normalize_title(feed_author);
        result
            .draft
            .authors
            .iter()
            .map(|author| normalize_title(author))
            .any(|author| {
                !author.is_empty()
                    && (author.contains(&feed_author) || feed_author.contains(&author))
            })
    });
    year_matches || author_matches
}

fn title_is_exact_or_near(left: &str, right: &str) -> bool {
    let left = normalize_title(left);
    let right = normalize_title(right);
    !left.is_empty()
        && !right.is_empty()
        && (left == right || normalized_titles_are_near(&left, &right))
}

fn normalized_titles_are_near(left: &str, right: &str) -> bool {
    let distance = levenshtein(left, right);
    let longest = left.chars().count().max(right.chars().count());
    longest >= 20 && (distance as f32 / longest as f32) <= 0.12
}

fn normalize_title(title: &str) -> String {
    let mut out = String::new();
    let mut prev_space = true;
    for c in title.to_lowercase().chars() {
        if c.is_alphanumeric() {
            out.push(c);
            prev_space = false;
        } else if !prev_space {
            out.push(' ');
            prev_space = true;
        }
    }
    out.trim().to_string()
}

fn levenshtein(a: &str, b: &str) -> usize {
    let a_chars: Vec<char> = a.chars().collect();
    let b_chars: Vec<char> = b.chars().collect();
    if a_chars.is_empty() {
        return b_chars.len();
    }
    if b_chars.is_empty() {
        return a_chars.len();
    }
    let mut prev = (0..=b_chars.len()).collect::<Vec<_>>();
    let mut curr = vec![0usize; b_chars.len() + 1];
    for i in 1..=a_chars.len() {
        curr[0] = i;
        for j in 1..=b_chars.len() {
            let cost = usize::from(a_chars[i - 1] != b_chars[j - 1]);
            curr[j] = (prev[j] + 1).min(curr[j - 1] + 1).min(prev[j - 1] + cost);
        }
        std::mem::swap(&mut prev, &mut curr);
    }
    prev[b_chars.len()]
}

fn timestamp_year(timestamp: i64) -> Option<i32> {
    Utc.timestamp_opt(timestamp, 0).single().map(|dt| dt.year())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fallback_draft_preserves_doi_from_feed_fields() {
        let draft = feed_item_fallback_draft(feed_item(
            Some("https://publisher.example/paper"),
            Some("Published version: https://doi.org/10.1038/s41566-026-01234-5."),
        ));

        assert_eq!(draft.doi.as_deref(), Some("10.1038/s41566-026-01234-5"));
        assert_eq!(draft.arxiv_id, None);
    }

    #[test]
    fn fallback_draft_preserves_arxiv_id_from_feed_fields() {
        let draft = feed_item_fallback_draft(feed_item(
            Some("https://arxiv.org/abs/2401.12345v2"),
            Some("Preprint"),
        ));

        assert_eq!(draft.arxiv_id.as_deref(), Some("2401.12345"));
        assert_eq!(draft.doi, None);
    }

    fn feed_item(link: Option<&str>, summary: Option<&str>) -> FeedItem {
        FeedItem {
            id: "feed-item-1".into(),
            feed_id: 1,
            entry_id: "entry-1".into(),
            title: "A Feed Paper".into(),
            link: link.map(str::to_string),
            summary: summary.map(str::to_string),
            authors: vec!["Ada Lovelace".into()],
            published_at: Some(1_704_067_200),
            fetched_at: 1_704_067_200,
            seen: false,
            imported_paper_id: None,
            metadata: None,
            metadata_source: None,
            metadata_checked_at: None,
        }
    }
}
