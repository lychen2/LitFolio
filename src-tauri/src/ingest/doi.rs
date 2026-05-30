//! CrossRef DOI metadata lookup.
//!
//! API docs: https://api.crossref.org/works/{doi}
//! Returns a normalized `PaperDraft` regardless of CrossRef field nuances.

use anyhow::{anyhow, Context, Result};
use serde::Deserialize;

use super::paper_draft::PaperDraft;

const CROSSREF_BASE: &str = "https://api.crossref.org/works";
// CrossRef's polite-pool guideline: include a contact URL so they can throttle
// per-app rather than per-IP. Pointing at the project repository lets their
// admins reach us; the previous `litfolio@example.com` placeholder risked
// landing the user agent on a blacklist.
const USER_AGENT: &str = "LitFolio/0.3 (+https://github.com/ZonaZcy/litera-desktop)";

#[derive(Debug, Deserialize)]
struct CrossRefResponse {
    message: CrossRefMessage,
}

#[derive(Debug, Deserialize)]
struct CrossRefSearchResponse {
    message: CrossRefSearchMessage,
}

#[derive(Debug, Deserialize)]
struct CrossRefSearchMessage {
    #[serde(default)]
    items: Vec<CrossRefMessage>,
}

#[derive(Debug, Deserialize)]
struct CrossRefMessage {
    #[serde(default)]
    title: Vec<String>,
    #[serde(default)]
    author: Vec<CrossRefAuthor>,
    #[serde(default, rename = "container-title")]
    container_title: Vec<String>,
    #[serde(default, rename = "published-print")]
    published_print: Option<CrossRefDate>,
    #[serde(default, rename = "published-online")]
    published_online: Option<CrossRefDate>,
    #[serde(default)]
    issued: Option<CrossRefDate>,
    #[serde(default, rename = "DOI")]
    doi: Option<String>,
    #[serde(default, rename = "abstract")]
    abstract_text: Option<String>,
}

#[derive(Debug, Deserialize)]
struct CrossRefAuthor {
    #[serde(default)]
    given: Option<String>,
    #[serde(default)]
    family: Option<String>,
    #[serde(default)]
    name: Option<String>,
}

#[derive(Debug, Deserialize)]
struct CrossRefDate {
    #[serde(rename = "date-parts", default)]
    date_parts: Vec<Vec<i32>>,
}

impl CrossRefAuthor {
    fn display(&self) -> Option<String> {
        if let Some(n) = &self.name {
            return Some(n.clone());
        }
        match (&self.given, &self.family) {
            (Some(g), Some(f)) => Some(format!("{g} {f}")),
            (None, Some(f)) => Some(f.clone()),
            (Some(g), None) => Some(g.clone()),
            _ => None,
        }
    }
}

fn first_year(m: &CrossRefMessage) -> Option<i32> {
    m.published_print
        .as_ref()
        .or(m.published_online.as_ref())
        .or(m.issued.as_ref())
        .and_then(|d| d.date_parts.first()?.first().copied())
}

fn strip_jats(s: &str) -> String {
    let re = regex::Regex::new(r"<[^>]+>").unwrap();
    let stripped = re.replace_all(s, " ");
    stripped.split_whitespace().collect::<Vec<_>>().join(" ")
}

/// Search CrossRef by title and return the top result's normalized metadata.
pub async fn search_doi_by_title(
    client: &reqwest::Client,
    title: &str,
) -> Result<Option<PaperDraft>> {
    let query = title.trim();
    if query.is_empty() {
        return Ok(None);
    }
    let url = format!("{CROSSREF_BASE}?query.title={}&rows=3", urlencode(query));
    let resp = client
        .get(&url)
        .header(reqwest::header::USER_AGENT, USER_AGENT)
        .send()
        .await
        .with_context(|| format!("GET {url}"))?;
    let status = resp.status();
    if !status.is_success() {
        let body = resp.text().await.unwrap_or_default();
        return Err(anyhow!("CrossRef returned {status}: {body}"));
    }
    let body: CrossRefSearchResponse = resp.json().await.context("decode CrossRef JSON")?;
    Ok(body
        .message
        .items
        .into_iter()
        .filter_map(crossref_message_to_draft)
        .find(|draft| {
            draft
                .doi
                .as_deref()
                .is_some_and(|doi| doi.starts_with("10."))
        }))
}

/// Fetch metadata for a DOI. Accepts either a bare DOI ("10.x/y") or a URL.
pub async fn fetch_doi(client: &reqwest::Client, doi_or_url: &str) -> Result<PaperDraft> {
    let doi = normalize_doi(doi_or_url)?;
    let url = format!("{CROSSREF_BASE}/{}", urlencode(&doi));
    let resp = client
        .get(&url)
        .header(reqwest::header::USER_AGENT, USER_AGENT)
        .send()
        .await
        .with_context(|| format!("GET {url}"))?;
    let status = resp.status();
    if !status.is_success() {
        let body = resp.text().await.unwrap_or_default();
        return Err(anyhow!("CrossRef returned {status}: {body}"));
    }
    let body: CrossRefResponse = resp.json().await.context("decode CrossRef JSON")?;
    Ok(
        crossref_message_to_draft(body.message).unwrap_or(PaperDraft {
            title: "(untitled)".into(),
            authors: vec![],
            year: None,
            venue: None,
            doi: Some(doi),
            arxiv_id: None,
            abstract_text: None,
        }),
    )
}

fn crossref_message_to_draft(m: CrossRefMessage) -> Option<PaperDraft> {
    let title = m.title.first().cloned()?;
    let authors: Vec<String> = m.author.iter().filter_map(|a| a.display()).collect();
    let venue = m.container_title.first().cloned();
    let year = first_year(&m);
    let abstract_text = m.abstract_text.as_deref().map(strip_jats);
    Some(PaperDraft {
        title,
        authors,
        year,
        venue,
        doi: m.doi,
        arxiv_id: None,
        abstract_text,
    })
}

fn normalize_doi(input: &str) -> Result<String> {
    let trimmed = input.trim();
    let s = trimmed
        .trim_start_matches("https://doi.org/")
        .trim_start_matches("http://doi.org/")
        .trim_start_matches("doi:");
    if s.starts_with("10.") && s.contains('/') {
        Ok(s.to_string())
    } else {
        Err(anyhow!("not a DOI: {input}"))
    }
}

fn urlencode(s: &str) -> String {
    s.chars()
        .map(|c| match c {
            'a'..='z' | 'A'..='Z' | '0'..='9' | '-' | '_' | '.' | '~' | '/' => c.to_string(),
            _ => format!("%{:02X}", c as u32),
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalize_strips_known_prefixes() {
        assert_eq!(
            normalize_doi("10.1038/nature12345").unwrap(),
            "10.1038/nature12345"
        );
        assert_eq!(normalize_doi("doi:10.1038/x").unwrap(), "10.1038/x");
        assert_eq!(
            normalize_doi("https://doi.org/10.1038/x").unwrap(),
            "10.1038/x"
        );
        assert!(normalize_doi("not-a-doi").is_err());
    }

    #[test]
    fn url_encode_handles_special() {
        assert_eq!(urlencode("10.1038/foo bar"), "10.1038/foo%20bar");
        assert_eq!(urlencode("10.1038/x;y"), "10.1038/x%3By");
    }
}
