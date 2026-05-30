use anyhow::{anyhow, Context};

use super::ids::extract_doi;

const MAX_LANDING_BYTES: u64 = 512 * 1024;

pub(super) async fn discover_doi_from_landing_page(
    http: &reqwest::Client,
    url: Option<&str>,
) -> anyhow::Result<Option<String>> {
    let Some(url) = url.filter(|u| u.starts_with("http://") || u.starts_with("https://")) else {
        return Ok(None);
    };
    let resp = http
        .get(url)
        .send()
        .await
        .with_context(|| format!("GET {url}"))?;
    if !resp.status().is_success() {
        return Ok(None);
    }
    if let Some(len) = resp.content_length() {
        if len > MAX_LANDING_BYTES {
            return Ok(None);
        }
    }
    if let Some(ct) = resp
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
    {
        let ct = ct.to_ascii_lowercase();
        if !(ct.contains("text/html") || ct.contains("application/xhtml")) {
            return Ok(None);
        }
    }
    let bytes = resp.bytes().await.context("read landing page")?;
    if bytes.len() as u64 > MAX_LANDING_BYTES {
        return Err(anyhow!("landing page exceeds DOI discovery size cap"));
    }
    let html = String::from_utf8_lossy(&bytes);
    Ok(extract_doi_from_meta(&html).or_else(|| extract_doi(&html)))
}

fn extract_doi_from_meta(html: &str) -> Option<String> {
    let meta_re = regex::Regex::new(r#"(?is)<meta\b[^>]*>"#).ok()?;
    let from_meta = meta_re.captures_iter(html).find_map(|caps| {
        let tag = caps.get(0)?.as_str();
        if !is_doi_meta_tag(tag) {
            return None;
        }
        extract_attr(tag, "content").and_then(|content| extract_doi(&content))
    });
    from_meta.or_else(|| extract_doi_from_json_ld(html))
}

fn is_doi_meta_tag(tag: &str) -> bool {
    ["name", "property"].into_iter().any(|attr| {
        extract_attr(tag, attr)
            .map(|value| {
                matches!(
                    value.to_ascii_lowercase().as_str(),
                    "citation_doi" | "dc.identifier" | "prism.doi" | "doi"
                )
            })
            .unwrap_or(false)
    })
}

fn extract_attr(tag: &str, attr: &str) -> Option<String> {
    let re = regex::Regex::new(&format!(
        r#"(?is)\b{}=["']([^"']+)["']"#,
        regex::escape(attr)
    ))
    .ok()?;
    re.captures(tag)
        .and_then(|caps| caps.get(1).map(|m| m.as_str().trim().to_string()))
}

fn extract_doi_from_json_ld(html: &str) -> Option<String> {
    let script_re = regex::Regex::new(
        r#"(?is)<script\b[^>]*type=["']application/ld\+json["'][^>]*>(.*?)</script>"#,
    )
    .ok()?;
    let from_json_ld = script_re
        .captures_iter(html)
        .find_map(|caps| caps.get(1).and_then(|m| extract_doi(m.as_str())));
    from_json_ld
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extracts_doi_from_citation_meta() {
        let html = r#"<meta content="10.1364/OE.123456" name="citation_doi">"#;
        assert_eq!(
            extract_doi_from_meta(html),
            Some("10.1364/OE.123456".into())
        );
    }

    #[test]
    fn extracts_doi_from_json_ld() {
        let html =
            r#"<script type="application/ld+json">{"doi":"10.1038/s41566-026-01234-5"}</script>"#;
        assert_eq!(
            extract_doi_from_meta(html),
            Some("10.1038/s41566-026-01234-5".into())
        );
    }
}
