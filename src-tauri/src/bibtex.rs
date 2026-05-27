//! Pure BibTeX entry generator. No external dependencies — just string formatting.

use crate::storage::Paper;

/// Generate a BibTeX entry for a paper.
///
/// Key format: `first_author_last_name + year + first_significant_title_word`
/// e.g. `vaswani2017attention`
pub fn generate_bibtex(paper: &Paper) -> String {
    let key = bibtex_key(paper);
    let authors = if paper.authors.is_empty() {
        "unknown".to_string()
    } else {
        paper.authors.join(" and ")
    };
    let year = paper.year.unwrap_or(0);

    let mut entry = format!(
        "@article{{{key},\n  title = {{{}}},\n  author = {{{}}},\n  year = {{{}}}",
        latex_escape(&paper.title),
        latex_escape(&authors),
        year,
    );

    if let Some(ref venue) = paper.venue {
        if !venue.is_empty() {
            entry.push_str(&format!(",\n  journal = {{{}}}", latex_escape(venue)));
        }
    }
    if let Some(ref doi) = paper.doi {
        if !doi.is_empty() {
            entry.push_str(&format!(",\n  doi = {{{doi}}}"));
        }
    }
    if let Some(ref arxiv) = paper.arxiv_id {
        if !arxiv.is_empty() {
            entry.push_str(&format!(",\n  eprint = {{{arxiv}}}"));
            entry.push_str(",\n  archivePrefix = {arXiv}");
        }
    }

    entry.push_str("\n}");
    entry
}

/// Build the BibTeX citation key: `last_name + year + first_significant_word`.
fn bibtex_key(paper: &Paper) -> String {
    let last_name = paper
        .authors
        .first()
        .map(|a| {
            // "Vaswani, Ashish" → "Vaswani", "Ashish Vaswani" → "Vaswani"
            let name = a.trim();
            if let Some(idx) = name.find(',') {
                name[..idx].trim().to_lowercase()
            } else {
                name.split_whitespace()
                    .last()
                    .unwrap_or("unknown")
                    .to_lowercase()
            }
        })
        .unwrap_or_else(|| "unknown".into());

    let year = paper.year.unwrap_or(0);

    let first_word = first_significant_word(&paper.title);

    format!("{last_name}{year}{first_word}")
}

/// Extract the first "significant" word from a title (skip articles/prepositions).
fn first_significant_word(title: &str) -> String {
    let skip = [
        "a", "an", "the", "on", "in", "of", "for", "to", "and", "with", "from", "by",
    ];
    title
        .split_whitespace()
        .map(|w| {
            w.chars()
                .filter(|c| c.is_alphanumeric())
                .collect::<String>()
                .to_lowercase()
        })
        .find(|w| !w.is_empty() && !skip.contains(&w.as_str()))
        .unwrap_or_else(|| "untitled".into())
}

/// Escape special LaTeX characters in a value string.
fn latex_escape(s: &str) -> String {
    s.replace('\\', "\\textbackslash{}")
        .replace('&', "\\&")
        .replace('%', "\\%")
        .replace('$', "\\$")
        .replace('#', "\\#")
        .replace('_', "\\_")
        .replace('{', "\\{")
        .replace('}', "\\}")
        .replace('~', "\\textasciitilde{}")
        .replace('^', "\\textasciicircum{}")
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::Utc;

    fn sample_paper() -> Paper {
        let now = Utc::now().timestamp();
        Paper {
            id: "test".into(),
            title: "Attention Is All You Need".into(),
            authors: vec!["Vaswani, Ashish".into(), "Shazeer, Noam".into()],
            year: Some(2017),
            venue: Some("NeurIPS".into()),
            doi: Some("10.5555/3295222.3295349".into()),
            arxiv_id: Some("1706.03762".into()),
            abstract_text: None,
            pdf_path: None,
            note_path: None,
            added_at: now,
            updated_at: now,
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
            bibtex: None,
            last_exported_at: None,
        }
    }

    #[test]
    fn generates_valid_bibtex() {
        let bib = generate_bibtex(&sample_paper());
        assert!(bib.starts_with("@article{vaswani2017attention,"));
        assert!(bib.contains("title = {Attention Is All You Need}"));
        assert!(bib.contains("author = {Vaswani, Ashish and Shazeer, Noam}"));
        assert!(bib.contains("year = {2017}"));
        assert!(bib.contains("journal = {NeurIPS}"));
        assert!(bib.contains("doi = {10.5555/3295222.3295349}"));
        assert!(bib.contains("eprint = {1706.03762}"));
        assert!(bib.ends_with("}"));
    }

    #[test]
    fn handles_missing_fields() {
        let mut p = sample_paper();
        p.venue = None;
        p.doi = None;
        p.arxiv_id = None;
        p.authors = vec![];
        let bib = generate_bibtex(&p);
        assert!(bib.contains("author = {unknown}"));
        assert!(!bib.contains("journal"));
        assert!(!bib.contains("doi"));
        assert!(!bib.contains("eprint"));
    }

    #[test]
    fn key_uses_last_name() {
        let mut p = sample_paper();
        p.authors = vec!["Yann LeCun".into()];
        assert!(bibtex_key(&p).starts_with("lecun"));
    }

    #[test]
    fn significant_word_skips_articles() {
        assert_eq!(first_significant_word("The Attention Mechanism"), "attention");
        assert_eq!(first_significant_word("A Study of"), "study");
    }
}
