pub(super) fn extract_doi(text: &str) -> Option<String> {
    let re =
        regex::Regex::new(r"(?i)(?:doi:\s*|https?://(?:dx\.)?doi\.org/)?(10\.\d{4,9}/\S+)").ok()?;
    let raw = re.captures(text)?.get(1)?.as_str();
    let cleaned = raw
        .trim_end_matches(|c: char| ['.', ',', ';', ':', ')', ']', '}', '\'', '"'].contains(&c))
        .to_string();
    (!cleaned.is_empty()).then_some(cleaned)
}

pub(super) fn extract_arxiv_id(text: &str) -> Option<String> {
    let url_re = regex::Regex::new(
        r"(?i)arxiv\.org/(?:abs|pdf|html|format)/([A-Za-z\-]+/\d{7}|\d{4}\.\d{4,5})(?:v\d+)?(?:\.pdf)?",
    )
    .ok()?;
    if let Some(caps) = url_re.captures(text) {
        return caps.get(1).map(|m| m.as_str().to_string());
    }
    let prefixed_re =
        regex::Regex::new(r"(?i)arxiv:\s*([A-Za-z\-]+/\d{7}|\d{4}\.\d{4,5})(?:v\d+)?").ok()?;
    prefixed_re
        .captures(text)
        .and_then(|caps| caps.get(1).map(|m| m.as_str().to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extracts_doi_from_feed_text() {
        assert_eq!(
            extract_doi("Published as 10.1364/OE.123456."),
            Some("10.1364/OE.123456".into())
        );
        assert_eq!(
            extract_doi("see https://doi.org/10.1038/s41566-026-01234-5)."),
            Some("10.1038/s41566-026-01234-5".into())
        );
    }

    #[test]
    fn extracts_arxiv_ids_from_feed_text() {
        assert_eq!(
            extract_arxiv_id("https://arxiv.org/pdf/2401.12345v2.pdf"),
            Some("2401.12345".into())
        );
        assert_eq!(
            extract_arxiv_id("arXiv:hep-th/9901001v1"),
            Some("hep-th/9901001".into())
        );
    }
}
