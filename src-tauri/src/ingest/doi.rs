//! CrossRef DOI metadata lookup.
//!
//! API docs: https://api.crossref.org/works/{doi}
//! Returns a normalized `PaperDraft` regardless of CrossRef field nuances.

use anyhow::{anyhow, Context, Result};
use serde::Deserialize;

use super::paper_draft::PaperDraft;

const CROSSREF_BASE: &str = "https://api.crossref.org/works";
const SCIHUB_PDF_DOWNLOAD_MAX_BYTES: usize = 200 * 1024 * 1024;
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
    #[serde(default)]
    link: Vec<CrossRefLink>,
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
    date_parts: Vec<Vec<Option<i32>>>,
}

#[derive(Debug, Deserialize)]
struct CrossRefLink {
    #[serde(default)]
    url: Option<String>,
    #[serde(default, rename = "content-type")]
    content_type: Option<String>,
    #[serde(default, rename = "intended-application")]
    intended_application: Option<String>,
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
        .and_then(|d| d.date_parts.first()?.first().and_then(|y| *y))
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
    let body_text = resp.text().await.with_context(|| "read response body")?;

    tracing::debug!(
        response_length = body_text.len(),
        response_preview = &body_text.chars().take(200).collect::<String>(),
        "CrossRef response received"
    );

    let body: CrossRefSearchResponse = serde_json::from_str(&body_text).with_context(|| {
        format!(
            "decode CrossRef JSON (length: {}, preview: {})",
            body_text.len(),
            body_text.chars().take(200).collect::<String>()
        )
    })?;
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
    if let Some(arxiv_id) = arxiv_id_from_datacite_doi(&doi) {
        let mut draft = super::arxiv::fetch_arxiv(client, &arxiv_id).await?;
        draft.doi = Some(doi);
        return Ok(draft);
    }

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

fn arxiv_id_from_datacite_doi(doi: &str) -> Option<String> {
    const PREFIX: &str = "10.48550/arxiv.";
    let prefix = doi.get(..PREFIX.len())?;
    if !prefix.eq_ignore_ascii_case(PREFIX) {
        return None;
    }
    super::arxiv::normalize_arxiv(&doi[PREFIX.len()..]).ok()
}

fn urlencode(s: &str) -> String {
    use std::fmt::Write as _;

    let mut out = String::with_capacity(s.len());
    for &byte in s.as_bytes() {
        match byte {
            b'a'..=b'z' | b'A'..=b'Z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' | b'/' => {
                out.push(byte as char);
            }
            _ => {
                write!(&mut out, "%{byte:02X}").expect("writing to String cannot fail");
            }
        }
    }
    out
}

/// Fetch publisher-declared public PDF links from CrossRef metadata for a DOI.
pub async fn fetch_doi_pdf_links(
    client: &reqwest::Client,
    doi_or_url: &str,
) -> Result<Vec<String>> {
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
    let mut links = Vec::new();
    for link in body.message.link {
        let Some(link_url) = link.url else {
            continue;
        };
        if crossref_link_is_pdf(&link_url, link.content_type.as_deref()) {
            links.push(link_url);
        }
    }
    dedup_preserving_order(&mut links);
    Ok(links)
}

fn crossref_link_is_pdf(url: &str, content_type: Option<&str>) -> bool {
    content_type
        .unwrap_or_default()
        .to_ascii_lowercase()
        .starts_with("application/pdf")
        || url_looks_like_pdf(url)
}

fn url_looks_like_pdf(url: &str) -> bool {
    let Ok(parsed) = reqwest::Url::parse(url) else {
        return false;
    };
    let path = parsed.path().to_ascii_lowercase();
    path.ends_with(".pdf")
        || path.contains(".pdf/")
        || path.contains("/pdf/")
        || path.ends_with("/pdf")
}

fn dedup_preserving_order(values: &mut Vec<String>) {
    let mut seen = std::collections::HashSet::new();
    values.retain(|value| seen.insert(value.clone()));
}

// ── Sci-Hub PDF link resolution ──────────────────────────────────────────
//
// Sci-Hub is fronted by DDOS-Guard which TLS-fingerprints clients; reqwest
// with rustls-tls consistently gets 403.  We use the system `curl` binary
// (which uses OpenSSL / native TLS) to fetch page HTML and download PDFs,
// with reqwest as a best-effort fallback when curl is not available.

const SCIHUB_MIRRORS: &[&str] = &[
    "https://sci-hub.ru",
    "https://sci-hub.st",
    "https://sci-hub.su",
];

/// Try each Sci-Hub mirror to resolve a DOI into a direct PDF URL.
/// Returns the first working PDF URL found, or `None` if all mirrors fail.
pub async fn fetch_scihub_pdf_url(client: &reqwest::Client, doi: &str) -> Result<Option<String>> {
    for mirror in SCIHUB_MIRRORS {
        let page_url = format!("{mirror}/{doi}");
        match try_scihub_mirror(client, &page_url).await {
            Ok(Some(pdf_url)) => return Ok(Some(pdf_url)),
            Ok(None) => continue,
            Err(_) => continue,
        }
    }
    Ok(None)
}

async fn try_scihub_mirror(client: &reqwest::Client, page_url: &str) -> Result<Option<String>> {
    // Prefer system curl (bypasses DDOS-Guard TLS fingerprinting).
    let html = if let Some(h) = fetch_html_via_curl(page_url).await? {
        h
    } else {
        // Fallback: reqwest (may hit 403 from DDOS-Guard).
        let resp = client.get(page_url).send().await?;
        if !resp.status().is_success() {
            return Ok(None);
        }
        resp.text().await?
    };

    if let Some(pdf_url) = parse_scihub_html(page_url, &html)? {
        return Ok(Some(pdf_url));
    }
    Ok(None)
}

/// Download a PDF from a Sci-Hub storage URL via system curl (with cookies).
/// Returns the number of bytes written to `dest`.
pub async fn scihub_download_pdf(pdf_url: &str, doi: &str, dest: &std::path::Path) -> Result<u64> {
    use tokio::process::Command;

    // curl -o won't create parent directories.
    if let Some(parent) = dest.parent() {
        std::fs::create_dir_all(parent)
            .with_context(|| format!("failed to create {}", parent.display()))?;
    }

    let cookie_jar =
        std::env::temp_dir().join(format!("litfolio-scihub-{}.cookies", doi.replace('/', "_")));

    // Prime cookies: visit the mirror homepage so DDOS-Guard sets session
    // cookies (the PDF storage URL itself does not issue cookies).
    let mirror = if let Some(idx) = pdf_url[8..].find('/') {
        &pdf_url[..8 + idx]
    } else {
        pdf_url
    };
    let _ = Command::new("curl")
        .args(["-sL", "--max-time", "15", "-c"])
        .arg(&cookie_jar)
        .arg(mirror)
        .output()
        .await;

    // Download PDF with cookies.
    let max_filesize = SCIHUB_PDF_DOWNLOAD_MAX_BYTES.to_string();
    let output = Command::new("curl")
        .args(["-sL", "--max-time", "120", "--max-filesize"])
        .arg(&max_filesize)
        .arg("-b")
        .arg(&cookie_jar)
        .arg("-o")
        .arg(dest)
        .arg(pdf_url)
        .output()
        .await
        .context("failed to spawn curl for Sci-Hub PDF download")?;

    let _ = std::fs::remove_file(&cookie_jar);

    if !output.status.success() {
        anyhow::bail!("curl exited with {} for {pdf_url}", output.status);
    }

    let size = std::fs::metadata(dest)
        .with_context(|| format!("curl reported success but no file at {}", dest.display()))?
        .len();

    if size < 1024 {
        anyhow::bail!(
            "Sci-Hub PDF too small ({} bytes), likely not a valid PDF",
            size
        );
    }

    // Validate PDF header.
    let header =
        std::fs::read(dest).with_context(|| format!("failed to read {}", dest.display()))?;
    if header.len() < 5 || &header[..5] != b"%PDF-" {
        anyhow::bail!("Sci-Hub response is not a valid PDF (missing %PDF- header)");
    }

    Ok(size)
}

/// Fetch Sci-Hub page HTML via system curl.
/// Returns `Some(html)` on success, `None` if curl is not available.
async fn fetch_html_via_curl(url: &str) -> Result<Option<String>> {
    use tokio::process::Command;
    // Quick check: is curl on PATH?
    if Command::new("curl")
        .arg("--version")
        .output()
        .await
        .is_err()
    {
        return Ok(None);
    }
    let output = Command::new("curl")
        .args(["-sL", "--max-time", "15"])
        .arg(url)
        .output()
        .await
        .context("failed to spawn curl")?;
    if !output.status.success() {
        return Ok(None);
    }
    let html = String::from_utf8_lossy(&output.stdout).into_owned();
    if html.is_empty() {
        return Ok(None);
    }
    Ok(Some(html))
}

/// Parse Sci-Hub HTML to extract the PDF URL.
fn parse_scihub_html(page_url: &str, html: &str) -> Result<Option<String>> {
    use regex::Regex;

    // Pattern 1 (primary): Sci-Hub <meta name="citation_pdf_url" content="...">
    let re_meta = Regex::new(
        r#"<meta\s+name\s*=\s*["']citation_pdf_url["']\s+content\s*=\s*["']([^"']+\.pdf)["']"#,
    )?;
    if let Some(cap) = re_meta.captures(html) {
        let raw = cap[1].to_string();
        return Ok(Some(resolve_pdf_url(page_url, &raw)));
    }

    // Pattern 2: <object>/<iframe>/<embed> with .pdf src/data
    let re_object = Regex::new(
        r#"(?i)<(?:object|iframe|embed)\b[^>]*?\b(?:src|data)\s*=\s*["']([^"']*?\.pdf[^"']*?)["']"#,
    )?;
    if let Some(cap) = re_object.captures(html) {
        let raw = cap[1].to_string();
        return Ok(Some(resolve_pdf_url(page_url, &raw)));
    }

    // Pattern 3: <a> href pointing to a .pdf
    let re_href = Regex::new(r#"(?i)\bhref\s*=\s*["']([^"']*?\.pdf[^"']*?)["']"#)?;
    if let Some(cap) = re_href.captures(html) {
        let raw = cap[1].to_string();
        return Ok(Some(resolve_pdf_url(page_url, &raw)));
    }

    Ok(None)
}

/// Resolve a possibly-relative PDF URL against the page URL.
fn resolve_pdf_url(page_url: &str, raw: &str) -> String {
    if raw.starts_with("http://") || raw.starts_with("https://") {
        return raw.to_string();
    }
    if raw.starts_with("//") {
        return format!("https:{raw}");
    }
    if let Some(slash) = page_url[8..].find('/') {
        let base = &page_url[..8 + slash];
        if raw.starts_with('/') {
            format!("{base}{raw}")
        } else {
            format!("{base}/{raw}")
        }
    } else {
        format!("{page_url}/{raw}")
    }
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
    fn recognizes_arxiv_datacite_dois() {
        assert_eq!(
            arxiv_id_from_datacite_doi("10.48550/arXiv.2511.03175").as_deref(),
            Some("2511.03175")
        );
        assert_eq!(
            arxiv_id_from_datacite_doi("10.48550/arxiv.hep-th/9901001").as_deref(),
            Some("hep-th/9901001")
        );
        assert!(arxiv_id_from_datacite_doi("10.1038/nature12345").is_none());
    }

    #[test]
    fn url_encode_handles_special() {
        assert_eq!(urlencode("10.1038/foo bar"), "10.1038/foo%20bar");
        assert_eq!(urlencode("10.1038/x;y"), "10.1038/x%3By");
        assert_eq!(urlencode("中文"), "%E4%B8%AD%E6%96%87");
    }

    #[test]
    fn crossref_pdf_link_accepts_science_pdf_path_without_extension() {
        assert!(crossref_link_is_pdf(
            "https://www.science.org/doi/pdf/10.1126/science.abb9318",
            Some("unspecified"),
        ));
    }

    #[test]
    fn crossref_pdf_link_rejects_non_pdf_text_mining_url() {
        assert!(!crossref_link_is_pdf(
            "https://example.org/tdm/10.1000/example.xml",
            Some("application/xml"),
        ));
    }

    #[test]
    fn dedup_preserves_crossref_order() {
        let mut links = vec!["b".to_string(), "a".to_string(), "b".to_string()];
        dedup_preserving_order(&mut links);
        assert_eq!(links, vec!["b".to_string(), "a".to_string()]);
    }
}

#[cfg(test)]
mod crossref_parse_tests {
    use super::*;

    #[test]
    fn parses_crossref_search_item() {
        let json = r#"{
            "message": {
                "items": [{
                    "title": ["Matrix dichroism in crystals"],
                    "author": [{"given": "Ada", "family": "Lovelace"}],
                    "container-title": ["Journal of Test Fixtures"],
                    "published-online": {"date-parts": [[2026, 1, 2]]},
                    "DOI": "10.1234/matrix"
                }]
            }
        }"#;

        let resp: CrossRefSearchResponse =
            serde_json::from_str(json).expect("decode CrossRef search JSON");
        let draft = crossref_message_to_draft(resp.message.items.into_iter().next().unwrap())
            .expect("convert CrossRef message to draft");

        assert_eq!(draft.title, "Matrix dichroism in crystals");
        assert_eq!(draft.authors, vec!["Ada Lovelace".to_string()]);
        assert_eq!(draft.venue, Some("Journal of Test Fixtures".to_string()));
        assert_eq!(draft.year, Some(2026));
        assert_eq!(draft.doi, Some("10.1234/matrix".to_string()));
    }
}
