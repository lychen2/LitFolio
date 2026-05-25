//! Fetch and parse RSS / Atom feeds.
//!
//! Wraps `feed-rs` which auto-detects format (RSS 2.0, Atom, JSON Feed, RSS 1.0).
//! Returns a `FetchedFeed` carrying feed metadata + new items already in the
//! storage layer's `NewFeedItem` shape so callers can hand it to `FeedRepo`.

use anyhow::{anyhow, Context, Result};
use feed_rs::parser;
use reqwest::header::{ETAG, IF_MODIFIED_SINCE, IF_NONE_MATCH, LAST_MODIFIED};

use crate::storage::feeds::NewFeedItem;

#[derive(Debug, Default)]
pub struct FetchedFeed {
    pub title: Option<String>,
    pub description: Option<String>,
    pub etag: Option<String>,
    pub last_modified: Option<String>,
    pub items: Vec<NewFeedItem>,
    /// Server returned 304 Not Modified — caller should leave the feed alone.
    pub not_modified: bool,
}

/// Fetch one feed URL, optionally with conditional-GET headers so an unchanged
/// feed comes back as 304 and we skip parsing entirely.
pub async fn fetch_feed(
    client: &reqwest::Client,
    url: &str,
    etag: Option<&str>,
    last_modified: Option<&str>,
) -> Result<FetchedFeed> {
    let mut req = client
        .get(url)
        .header("User-Agent", "LitFolio/0.1 feed-rs")
        .header("Accept", "application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.5");
    if let Some(tag) = etag {
        req = req.header(IF_NONE_MATCH, tag);
    }
    if let Some(lm) = last_modified {
        req = req.header(IF_MODIFIED_SINCE, lm);
    }
    let resp = req
        .send()
        .await
        .with_context(|| format!("GET {url}"))?;

    if resp.status() == reqwest::StatusCode::NOT_MODIFIED {
        return Ok(FetchedFeed {
            not_modified: true,
            ..Default::default()
        });
    }
    if !resp.status().is_success() {
        return Err(anyhow!("upstream {} returned HTTP {}", url, resp.status()));
    }
    let new_etag = resp
        .headers()
        .get(ETAG)
        .and_then(|h| h.to_str().ok())
        .map(str::to_string);
    let new_last_modified = resp
        .headers()
        .get(LAST_MODIFIED)
        .and_then(|h| h.to_str().ok())
        .map(str::to_string);
    let body = resp.bytes().await.context("read feed body")?;
    let parsed = parser::parse(&body[..]).with_context(|| format!("parse feed {url}"))?;

    let title = parsed.title.as_ref().map(|t| t.content.clone());
    let description = parsed.description.as_ref().map(|d| d.content.clone());

    let items: Vec<NewFeedItem> = parsed
        .entries
        .into_iter()
        .map(|e| {
            let entry_id = if !e.id.is_empty() {
                e.id
            } else {
                e.links
                    .first()
                    .map(|l| l.href.clone())
                    .or_else(|| e.title.as_ref().map(|t| t.content.clone()))
                    .unwrap_or_default()
            };
            let title = e
                .title
                .as_ref()
                .map(|t| t.content.clone())
                .unwrap_or_else(|| "(无标题)".into());
            let link = e.links.first().map(|l| l.href.clone());
            let summary = e
                .summary
                .as_ref()
                .map(|s| strip_html(&s.content))
                .or_else(|| e.content.as_ref().and_then(|c| c.body.as_ref()).map(|b| strip_html(b)));
            let authors = e
                .authors
                .iter()
                .map(|p| p.name.clone())
                .filter(|n| !n.is_empty())
                .collect();
            let published_at = e
                .published
                .or(e.updated)
                .map(|dt| dt.timestamp());
            NewFeedItem {
                entry_id,
                title,
                link,
                summary,
                authors,
                published_at,
            }
        })
        .filter(|i| !i.entry_id.is_empty())
        .collect();

    Ok(FetchedFeed {
        title,
        description,
        etag: new_etag,
        last_modified: new_last_modified,
        items,
        not_modified: false,
    })
}

/// Crude HTML → text for feed summaries. We don't render rich HTML in the UI,
/// so just collapse tags + whitespace and cap length.
fn strip_html(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    let mut in_tag = false;
    for c in input.chars() {
        match c {
            '<' => in_tag = true,
            '>' => in_tag = false,
            _ if !in_tag => out.push(c),
            _ => {}
        }
    }
    let collapsed: String = out.split_whitespace().collect::<Vec<_>>().join(" ");
    if collapsed.chars().count() > 600 {
        let truncated: String = collapsed.chars().take(600).collect();
        format!("{truncated}…")
    } else {
        collapsed
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn strip_html_keeps_text_only() {
        assert_eq!(strip_html("<p>Hello <b>world</b>!</p>"), "Hello world!");
        assert_eq!(strip_html("  multiple\n\nspaces  "), "multiple spaces");
    }
}
