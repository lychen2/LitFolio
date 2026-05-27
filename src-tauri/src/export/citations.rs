//! Batch citation export: BibTeX, RIS, and formatted text styles.

use crate::storage::Paper;

/// Supported citation formatting styles.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CitationStyle {
    Apa,
    Ieee,
    GbT7714,
    Chicago,
}

impl CitationStyle {
    pub fn from_str(s: &str) -> Self {
        match s.to_lowercase().as_str() {
            "ieee" => Self::Ieee,
            "gb/t7714" | "gbt7714" | "gb" => Self::GbT7714,
            "chicago" | "chicago17" => Self::Chicago,
            _ => Self::Apa,
        }
    }
}

/// Export papers as a concatenated `.bib` string.
/// Uses the pre-generated `bibtex` field from each paper.
pub fn export_bibtex(papers: &[Paper]) -> String {
    papers
        .iter()
        .filter_map(|p| p.bibtex.as_deref())
        .collect::<Vec<_>>()
        .join("\n\n")
}

/// Export papers as RIS format string.
pub fn export_ris(papers: &[Paper]) -> String {
    let mut out = String::new();
    for p in papers {
        out.push_str("TY  - JOUR\n");
        out.push_str(&format!("TI  - {}\n", p.title));
        for author in &p.authors {
            out.push_str(&format!("AU  - {}\n", author));
        }
        if let Some(y) = p.year {
            out.push_str(&format!("PY  - {}\n", y));
        }
        if let Some(ref v) = p.venue {
            out.push_str(&format!("JO  - {}\n", v));
        }
        if let Some(ref d) = p.doi {
            out.push_str(&format!("DO  - {}\n", d));
        }
        if let Some(ref a) = p.arxiv_id {
            out.push_str(&format!("UR  - https://arxiv.org/abs/{}\n", a));
        }
        if let Some(ref abs) = p.abstract_text {
            out.push_str(&format!("AB  - {}\n", abs));
        }
        out.push_str("ER  - \n\n");
    }
    out
}

/// Format papers as a plain-text citation list in the given style.
pub fn format_citations(papers: &[Paper], style: CitationStyle) -> String {
    papers
        .iter()
        .map(|p| format_citation(p, style))
        .collect::<Vec<_>>()
        .join("\n\n")
}

fn format_citation(paper: &Paper, style: CitationStyle) -> String {
    match style {
        CitationStyle::Apa => format_apa(paper),
        CitationStyle::Ieee => format_ieee(paper),
        CitationStyle::GbT7714 => format_gbt7714(paper),
        CitationStyle::Chicago => format_chicago(paper),
    }
}

fn format_apa(p: &Paper) -> String {
    let authors = format_authors_apa(&p.authors);
    let year = p.year.map(|y| y.to_string()).unwrap_or_else(|| "n.d.".into());
    let venue = p.venue.as_deref().unwrap_or("");
    let doi = p
        .doi
        .as_ref()
        .map(|d| format!(" https://doi.org/{}", d))
        .unwrap_or_default();
    format!("{} ({}). {}. {}.{}", authors, year, p.title, venue, doi)
}

fn format_authors_apa(authors: &[String]) -> String {
    match authors.len() {
        0 => "(unknown)".into(),
        1 => authors[0].clone(),
        2 => format!("{} & {}", authors[0], authors[1]),
        _ => {
            let mut s = authors[..authors.len() - 1].join(", ");
            s.push_str(", & ");
            s.push_str(authors.last().unwrap());
            s
        }
    }
}

fn format_ieee(p: &Paper) -> String {
    let authors = p.authors.join(", ");
    let venue = p.venue.as_deref().unwrap_or("");
    let year = p.year.map(|y| y.to_string()).unwrap_or_default();
    let doi = p
        .doi
        .as_ref()
        .map(|d| format!(", doi: {}", d))
        .unwrap_or_default();
    format!("{}, \"{},\" {}, {}{}", authors, p.title, venue, year, doi)
}

fn format_gbt7714(p: &Paper) -> String {
    let authors = format_authors_gbt(&p.authors);
    let year = p.year.map(|y| y.to_string()).unwrap_or_default();
    let venue = p.venue.as_deref().unwrap_or("");
    let doi = p
        .doi
        .as_ref()
        .map(|d| format!(". DOI: {}", d))
        .unwrap_or_default();
    format!("{}. {}[J]. {}, {}{}", authors, p.title, venue, year, doi)
}

fn format_authors_gbt(authors: &[String]) -> String {
    if authors.is_empty() {
        return "(unknown)".into();
    }
    // GB/T 7714: list all authors, comma separated
    authors.join(", ")
}

fn format_chicago(p: &Paper) -> String {
    let authors = format_authors_chicago(&p.authors);
    let year = p.year.map(|y| y.to_string()).unwrap_or_else(|| "n.d.".into());
    let venue = p.venue.as_deref().unwrap_or("");
    let doi = p
        .doi
        .as_ref()
        .map(|d| format!(" https://doi.org/{}.", d))
        .unwrap_or_else(|| ".".into());
    // Chicago 17th author-date: Author. Year. "Title." Venue.
    if venue.is_empty() {
        format!("{} {}. \"{}.\"{}", authors, year, p.title, doi)
    } else {
        format!("{} {}. \"{}.\" {}.{}", authors, year, p.title, venue, doi)
    }
}

fn format_authors_chicago(authors: &[String]) -> String {
    match authors.len() {
        0 => "(unknown)".into(),
        1 => format!("{}.", authors[0]),
        2 => format!("{} and {}.", authors[0], authors[1]),
        3..=10 => {
            let mut s = authors[..authors.len() - 1].join(", ");
            s.push_str(", and ");
            s.push_str(authors.last().unwrap());
            s.push('.');
            s
        }
        _ => {
            // 11+ authors: list first 7, then "et al."
            let mut s = authors[..7].join(", ");
            s.push_str(", et al.");
            s
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_paper() -> Paper {
        Paper {
            id: "test-id".into(),
            title: "Attention Is All You Need".into(),
            authors: vec!["Vaswani, A.".into(), "Shazeer, N.".into()],
            year: Some(2017),
            venue: Some("NeurIPS".into()),
            doi: Some("10.48550/arXiv.1706.03762".into()),
            arxiv_id: Some("1706.03762".into()),
            abstract_text: Some("The dominant sequence transduction models...".into()),
            pdf_path: None,
            note_path: None,
            added_at: 0,
            updated_at: 0,
            read_status: crate::storage::ReadStatus::Unread,
            tldr: None,
            research_question: None,
            method: None,
            dataset: None,
            key_findings: vec![],
            limitations: None,
            comparison: None,
            title_translated: None,
            abstract_translated: None,
            translate_target_lang: None,
            translated_at: None,
            bibtex: Some("@inproceedings{vaswani2017attention,\n  title={Attention Is All You Need},\n  author={Vaswani, A. and Shazeer, N.},\n  year={2017}\n}".into()),
            last_exported_at: None,
        }
    }

    #[test]
    fn export_bibtex_concatenates() {
        let papers = vec![sample_paper(), sample_paper()];
        let bib = export_bibtex(&papers);
        assert!(bib.contains("@inproceedings"));
        assert_eq!(bib.matches("@inproceedings").count(), 2);
    }

    #[test]
    fn export_ris_format() {
        let papers = vec![sample_paper()];
        let ris = export_ris(&papers);
        assert!(ris.starts_with("TY  - JOUR\n"));
        assert!(ris.contains("TI  - Attention Is All You Need\n"));
        assert!(ris.contains("AU  - Vaswani, A.\n"));
        assert!(ris.contains("PY  - 2017\n"));
        assert!(ris.contains("DO  - 10.48550/arXiv.1706.03762\n"));
        assert!(ris.ends_with("ER  - \n\n"));
    }

    #[test]
    fn apa_style() {
        let p = sample_paper();
        let s = format_citation(&p, CitationStyle::Apa);
        assert!(s.contains("Vaswani, A. & Shazeer, N."));
        assert!(s.contains("(2017)"));
        assert!(s.contains("Attention Is All You Need"));
    }

    #[test]
    fn ieee_style() {
        let p = sample_paper();
        let s = format_citation(&p, CitationStyle::Ieee);
        assert!(s.contains("Vaswani, A., Shazeer, N."));
        assert!(s.contains("Attention Is All You Need"));
    }

    #[test]
    fn gbt7714_style() {
        let p = sample_paper();
        let s = format_citation(&p, CitationStyle::GbT7714);
        assert!(s.contains("[J]"));
        assert!(s.contains("Vaswani, A., Shazeer, N."));
    }

    #[test]
    fn chicago_style() {
        let p = sample_paper();
        let s = format_citation(&p, CitationStyle::Chicago);
        assert!(s.contains("2017"));
        assert!(s.contains("Attention Is All You Need"));
        assert!(s.contains("NeurIPS"));
    }
}
