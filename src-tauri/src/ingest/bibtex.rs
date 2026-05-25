//! Minimal BibTeX parser. Handles the most common fields used by Litera —
//! title / author / year / journal / doi / abstract. Robust enough for entries
//! exported by Zotero / Mendeley / Google Scholar without depending on a heavy crate.

use super::paper_draft::PaperDraft;

pub fn parse_bibtex(text: &str) -> Vec<PaperDraft> {
    let mut drafts = Vec::new();
    let mut chars = text.chars().peekable();
    while let Some(&c) = chars.peek() {
        if c == '@' {
            chars.next();
            // skip type (e.g. article)
            while let Some(&c2) = chars.peek() {
                if c2 == '{' {
                    break;
                }
                chars.next();
            }
            if chars.peek() == Some(&'{') {
                chars.next();
                let body = read_balanced_braces(&mut chars);
                if let Some(d) = parse_entry_body(&body) {
                    drafts.push(d);
                }
            }
        } else {
            chars.next();
        }
    }
    drafts
}

fn read_balanced_braces<I: Iterator<Item = char>>(it: &mut std::iter::Peekable<I>) -> String {
    let mut depth = 1;
    let mut out = String::new();
    while let Some(c) = it.next() {
        match c {
            '{' => {
                depth += 1;
                out.push(c);
            }
            '}' => {
                depth -= 1;
                if depth == 0 {
                    return out;
                }
                out.push(c);
            }
            _ => out.push(c),
        }
    }
    out
}

fn parse_entry_body(body: &str) -> Option<PaperDraft> {
    let mut parts = body.splitn(2, ',');
    let _key = parts.next()?.trim();
    let rest = parts.next()?;
    let fields = split_top_level_commas(rest);
    let mut title = String::new();
    let mut authors: Vec<String> = Vec::new();
    let mut year: Option<i32> = None;
    let mut venue: Option<String> = None;
    let mut doi: Option<String> = None;
    let mut abstract_text: Option<String> = None;
    for f in fields {
        let f = f.trim();
        if f.is_empty() {
            continue;
        }
        let mut eq = f.splitn(2, '=');
        let k = eq.next()?.trim().to_lowercase();
        let v = strip_value(eq.next()?.trim());
        match k.as_str() {
            "title" => title = v,
            "author" | "authors" => {
                authors = v
                    .split(" and ")
                    .map(|s| s.trim().to_string())
                    .filter(|s| !s.is_empty())
                    .collect();
            }
            "year" => year = v.parse::<i32>().ok(),
            "journal" | "booktitle" | "publisher" => venue = Some(v),
            "doi" => doi = Some(v),
            "abstract" | "summary" => abstract_text = Some(v),
            _ => {}
        }
    }
    if title.is_empty() && authors.is_empty() && doi.is_none() {
        return None;
    }
    if title.is_empty() {
        title = "(untitled)".to_string();
    }
    Some(PaperDraft {
        title,
        authors,
        year,
        venue,
        doi,
        arxiv_id: None,
        abstract_text,
    })
}

fn split_top_level_commas(s: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut depth = 0;
    let mut buf = String::new();
    let mut in_quote = false;
    for c in s.chars() {
        match c {
            '{' => {
                depth += 1;
                buf.push(c);
            }
            '}' => {
                depth -= 1;
                buf.push(c);
            }
            '"' => {
                in_quote = !in_quote;
                buf.push(c);
            }
            ',' if depth == 0 && !in_quote => {
                out.push(std::mem::take(&mut buf));
            }
            _ => buf.push(c),
        }
    }
    if !buf.trim().is_empty() {
        out.push(buf);
    }
    out
}

fn strip_value(s: &str) -> String {
    let s = s.trim();
    let s = s.strip_suffix(',').unwrap_or(s).trim();
    if (s.starts_with('{') && s.ends_with('}')) || (s.starts_with('"') && s.ends_with('"')) {
        s[1..s.len() - 1].trim().to_string()
    } else {
        s.to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_one_article_entry() {
        let bib = r#"@article{vaswani2017,
            title = {Attention Is All You Need},
            author = {Vaswani, Ashish and Shazeer, Noam},
            year = {2017},
            journal = {NeurIPS},
            doi = {10.5555/3295222.3295349}
        }"#;
        let drafts = parse_bibtex(bib);
        assert_eq!(drafts.len(), 1);
        let d = &drafts[0];
        assert_eq!(d.title, "Attention Is All You Need");
        assert_eq!(d.authors.len(), 2);
        assert_eq!(d.year, Some(2017));
        assert_eq!(d.venue.as_deref(), Some("NeurIPS"));
        assert_eq!(d.doi.as_deref(), Some("10.5555/3295222.3295349"));
    }

    #[test]
    fn parses_multiple_entries() {
        let bib = r#"
            @article{a1, title = {Paper A}, year = {2020} }
            @inproceedings{b2, title = {Paper B}, year = {2021}, author = {X Y} }
        "#;
        let drafts = parse_bibtex(bib);
        assert_eq!(drafts.len(), 2);
        assert_eq!(drafts[1].title, "Paper B");
    }

    #[test]
    fn ignores_malformed_blocks() {
        let bib = "not a bibtex entry";
        assert!(parse_bibtex(bib).is_empty());
    }
}
