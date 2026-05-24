//! arXiv Atom-feed metadata lookup.
//!
//! Endpoints:
//! - `/api/query?id_list=ID`                     — single paper lookup
//! - `/api/query?search_query=cat:CATEGORY&...`  — list by category
//!
//! Both return the same Atom XML schema. We parse minimally without
//! pulling in a full XML library.

use anyhow::{anyhow, Context, Result};

use super::paper_draft::PaperDraft;

const ARXIV_BASE: &str = "https://export.arxiv.org/api/query";

pub async fn fetch_arxiv(client: &reqwest::Client, arxiv_id: &str) -> Result<PaperDraft> {
    let id = normalize_arxiv(arxiv_id)?;
    let url = format!("{ARXIV_BASE}?id_list={id}");
    let resp = client.get(&url).send().await.with_context(|| format!("GET {url}"))?;
    if !resp.status().is_success() {
        return Err(anyhow!("arXiv returned {}", resp.status()));
    }
    let body = resp.text().await?;
    let entries = parse_atom_entries(&body);
    entries
        .into_iter()
        .next()
        .map(|mut d| {
            if d.arxiv_id.is_none() {
                d.arxiv_id = Some(id);
            }
            d
        })
        .ok_or_else(|| anyhow!("arXiv returned no entries for id {arxiv_id}"))
}

/// List recent papers within a given arXiv category, newest first.
/// `category` is the canonical id, e.g. `physics.optics`, `cs.LG`, `quant-ph`.
pub async fn fetch_arxiv_category(
    client: &reqwest::Client,
    category: &str,
    max_results: u32,
) -> Result<Vec<PaperDraft>> {
    let max = max_results.clamp(1, 200);
    let cat = category.trim();
    if cat.is_empty() {
        return Err(anyhow!("category must not be empty"));
    }
    let url = format!(
        "{ARXIV_BASE}?search_query=cat:{}&sortBy=submittedDate&sortOrder=descending&max_results={max}&start=0",
        urlencode(cat),
    );
    let resp = client.get(&url).send().await.with_context(|| format!("GET {url}"))?;
    if !resp.status().is_success() {
        return Err(anyhow!("arXiv returned {}", resp.status()));
    }
    let body = resp.text().await?;
    Ok(parse_atom_entries(&body))
}

fn normalize_arxiv(s: &str) -> Result<String> {
    let t = s.trim().trim_start_matches("arXiv:").trim_start_matches("arxiv:");
    let t = t.trim_start_matches("https://arxiv.org/abs/").trim_start_matches("http://arxiv.org/abs/");
    let re = regex::Regex::new(r"^\d{4}\.\d{4,5}(v\d+)?$").unwrap();
    let legacy = regex::Regex::new(r"^[a-zA-Z][\w\-\.]*/\d{7}$").unwrap();
    if re.is_match(t) || legacy.is_match(t) {
        Ok(t.to_string())
    } else {
        Err(anyhow!("not an arXiv id: {s}"))
    }
}

fn urlencode(s: &str) -> String {
    s.chars().map(|c| match c {
        'a'..='z' | 'A'..='Z' | '0'..='9' | '-' | '_' | '.' | '~' | '/' | ':' => c.to_string(),
        _ => format!("%{:02X}", c as u32),
    }).collect()
}

fn extract(haystack: &str, tag: &str) -> Option<String> {
    let open = format!("<{tag}>");
    let close = format!("</{tag}>");
    let start = haystack.find(&open)? + open.len();
    let end = haystack[start..].find(&close)? + start;
    Some(haystack[start..end].trim().to_string())
}

fn extract_all(haystack: &str, tag: &str) -> Vec<String> {
    let open = format!("<{tag}>");
    let close = format!("</{tag}>");
    let mut out = Vec::new();
    let mut cursor = 0usize;
    while let Some(s) = haystack[cursor..].find(&open) {
        let abs = cursor + s + open.len();
        if let Some(e) = haystack[abs..].find(&close) {
            out.push(haystack[abs..abs + e].trim().to_string());
            cursor = abs + e + close.len();
        } else {
            break;
        }
    }
    out
}

fn extract_arxiv_id_from_entry(entry: &str) -> Option<String> {
    let id_url = extract(entry, "id")?;
    let after = id_url.rsplit('/').next()?;
    Some(after.trim().to_string())
}

fn collapse_whitespace(s: &str) -> String {
    s.replace('\n', " ").split_whitespace().collect::<Vec<_>>().join(" ")
}

/// Parse all entries in an arXiv Atom feed.
pub(crate) fn parse_atom_entries(xml: &str) -> Vec<PaperDraft> {
    let mut entries = xml.split("<entry>").skip(1);
    let mut out = Vec::new();
    while let Some(raw) = entries.next() {
        let entry = match raw.find("</entry>") {
            Some(end) => &raw[..end],
            None => raw,
        };
        let title = extract(entry, "title").map(|t| collapse_whitespace(&t)).unwrap_or_else(|| "(untitled)".to_string());
        let abstract_text = extract(entry, "summary").map(|s| collapse_whitespace(&s));
        let authors: Vec<String> = extract_all(entry, "author")
            .into_iter()
            .filter_map(|a| extract(&a, "name"))
            .map(|s| collapse_whitespace(&s))
            .collect();
        let year = extract(entry, "published")
            .and_then(|p| p.get(0..4).and_then(|y| y.parse::<i32>().ok()));
        let arxiv_id = extract_arxiv_id_from_entry(entry);
        out.push(PaperDraft {
            title,
            authors,
            year,
            venue: Some("arXiv".to_string()),
            doi: None,
            arxiv_id,
            abstract_text,
        });
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn arxiv_id_validation() {
        assert!(normalize_arxiv("2401.12345").is_ok());
        assert!(normalize_arxiv("arXiv:2401.12345v2").is_ok());
        assert!(normalize_arxiv("https://arxiv.org/abs/1706.03762").is_ok());
        assert!(normalize_arxiv("cs.LG/0703042").is_ok());
        assert!(normalize_arxiv("garbage").is_err());
    }

    #[test]
    fn atom_extracts_title_and_authors() {
        let xml = r#"<feed>
<entry>
<id>http://arxiv.org/abs/1706.03762v5</id>
<title>Attention Is All You Need</title>
<summary>The dominant sequence transduction models are based on RNNs.</summary>
<published>2017-06-12T17:57:34Z</published>
<author><name>Ashish Vaswani</name></author>
<author><name>Noam Shazeer</name></author>
</entry>
</feed>"#;
        let entries = parse_atom_entries(xml);
        assert_eq!(entries.len(), 1);
        let d = &entries[0];
        assert_eq!(d.title, "Attention Is All You Need");
        assert_eq!(d.authors, vec!["Ashish Vaswani", "Noam Shazeer"]);
        assert_eq!(d.year, Some(2017));
        assert_eq!(d.arxiv_id.as_deref(), Some("1706.03762v5"));
    }

    #[test]
    fn atom_parses_multiple_entries() {
        let xml = r#"<feed>
<entry><id>http://arxiv.org/abs/2401.00001</id><title>A</title><published>2024-01-01T00:00:00Z</published><author><name>X</name></author></entry>
<entry><id>http://arxiv.org/abs/2401.00002</id><title>B</title><published>2024-01-02T00:00:00Z</published><author><name>Y</name></author></entry>
</feed>"#;
        let entries = parse_atom_entries(xml);
        assert_eq!(entries.len(), 2);
        assert_eq!(entries[0].arxiv_id.as_deref(), Some("2401.00001"));
        assert_eq!(entries[1].arxiv_id.as_deref(), Some("2401.00002"));
    }
}
