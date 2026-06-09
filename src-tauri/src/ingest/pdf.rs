//! PDF metadata extraction + import.
//!
//! For each input PDF we:
//! 1. Compute SHA-256 of file content (for dedup).
//! 2. Try to read `/Title`, `/Author`, `/Subject`, `/Keywords` from the PDF
//!    info dictionary via `lopdf`.
//! 3. Scan first-page text for DOI/title signals when the PDF info
//!    dictionary is incomplete.
//! 4. Copy the file under `library/papers/{paper_id}/original.pdf`.

use anyhow::{anyhow, Context, Result};
use sha2::{Digest, Sha256};
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};

use super::paper_draft::PaperDraft;
use crate::storage::LibraryPaths;

#[derive(Debug, Clone)]
pub struct PdfImportResult {
    pub draft: PaperDraft,
    pub stored_path: PathBuf,
    pub sha256: String,
}

pub fn import_pdf_file(
    src: &Path,
    paper_id: &str,
    library: &LibraryPaths,
) -> Result<PdfImportResult> {
    let bytes = std::fs::read(src).with_context(|| format!("read {}", src.display()))?;
    let sha256 = hash_hex(&bytes);
    let draft = extract_metadata(&bytes, src);
    let paper_dir = library.paper_dir(paper_id);
    std::fs::create_dir_all(&paper_dir)?;
    let stored = paper_dir.join("original.pdf");
    std::fs::write(&stored, &bytes)?;
    write_sidecar(&paper_dir, &draft, &sha256)?;
    Ok(PdfImportResult {
        draft,
        stored_path: stored,
        sha256,
    })
}

fn write_sidecar(dir: &Path, draft: &PaperDraft, sha256: &str) -> Result<()> {
    let meta = serde_json::json!({
        "draft": draft,
        "sha256": sha256,
        "imported_at": chrono::Utc::now().to_rfc3339(),
    });
    std::fs::write(dir.join("meta.json"), serde_json::to_vec_pretty(&meta)?)?;
    Ok(())
}

fn hash_hex(bytes: &[u8]) -> String {
    let mut h = Sha256::new();
    h.update(bytes);
    hex::encode(h.finalize())
}

fn extract_metadata(bytes: &[u8], src: &Path) -> PaperDraft {
    let mut draft = PaperDraft::default();
    if let Ok(doc) = lopdf::Document::load_mem(bytes) {
        if let Ok(info_id) = doc.trailer.get(b"Info") {
            if let Ok(info_ref) = info_id.as_reference() {
                if let Ok(info_obj) = doc.get_object(info_ref) {
                    if let Ok(dict) = info_obj.as_dict() {
                        draft.title = dict
                            .get(b"Title")
                            .ok()
                            .and_then(decode_text)
                            .unwrap_or_default();
                        if let Some(a) = dict.get(b"Author").ok().and_then(decode_text) {
                            draft.authors = split_authors(&a);
                        }
                        if let Some(s) = dict.get(b"Subject").ok().and_then(decode_text) {
                            if draft.abstract_text.is_none() && !s.is_empty() {
                                draft.abstract_text = Some(s);
                            }
                        }
                    }
                }
            }
        }
        // Try first page text → DOI
        if let Some(text) = first_page_text(&doc) {
            if let Some(doi) = find_doi(&text) {
                draft.doi = Some(doi);
            }
            if draft.title.is_empty() {
                if let Some(t) = guess_title(&text) {
                    draft.title = t;
                }
            }
        }
    }
    if draft.title.is_empty() {
        draft.title = src
            .file_stem()
            .map(|s| s.to_string_lossy().to_string())
            .unwrap_or_else(|| "(untitled)".to_string());
    }
    draft
}

fn decode_text(obj: &lopdf::Object) -> Option<String> {
    match obj {
        lopdf::Object::String(bytes, _) => {
            // Try UTF-8 then UTF-16 BE (PDF text strings can be either).
            if let Ok(s) = std::str::from_utf8(bytes) {
                let cleaned = s.trim().to_string();
                if !cleaned.is_empty() {
                    return Some(cleaned);
                }
            }
            // UTF-16 BE with BOM
            if bytes.len() >= 2 && bytes[0] == 0xFE && bytes[1] == 0xFF {
                let utf16: Vec<u16> = bytes[2..]
                    .chunks(2)
                    .filter(|c| c.len() == 2)
                    .map(|c| u16::from_be_bytes([c[0], c[1]]))
                    .collect();
                let s = String::from_utf16_lossy(&utf16);
                let cleaned = s.trim().to_string();
                if !cleaned.is_empty() {
                    return Some(cleaned);
                }
            }
            None
        }
        _ => None,
    }
}

fn split_authors(s: &str) -> Vec<String> {
    s.split([',', ';'])
        .flat_map(|p| p.split(" and "))
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect()
}

fn first_page_text(doc: &lopdf::Document) -> Option<String> {
    let pages = doc.get_pages();
    let (page_number, _) = pages.iter().next()?;
    doc.extract_text(&[*page_number]).ok()
}

/// Extract body text from every page of a PDF on disk. Used as a fallback
/// when the higher-quality pdf.js extraction (saved as `document.md` by the
/// reader) is not yet available — e.g. the user has not opened this paper
/// in the reader but wants a TLDR / QuickRead anyway.
///
/// Quality caveat: lopdf is much weaker than pdf.js on academic PDFs that
/// use CMap-encoded fonts or subset font tables. Scanned image PDFs return
/// empty. Caller should treat an empty Ok as "no body extractable".
pub fn extract_full_text_from_path(pdf_path: &Path) -> Result<String> {
    let bytes = std::fs::read(pdf_path).with_context(|| format!("read {}", pdf_path.display()))?;
    let doc = lopdf::Document::load_mem(&bytes)
        .with_context(|| format!("parse pdf {}", pdf_path.display()))?;
    let pages: Vec<u32> = doc.get_pages().keys().copied().collect();
    if pages.is_empty() {
        return Err(anyhow!("pdf has no pages: {}", pdf_path.display()));
    }
    let text = doc
        .extract_text(&pages)
        .with_context(|| format!("extract text from {}", pdf_path.display()))?;
    Ok(text)
}

/// Extract a Markdown-oriented representation from a PDF on disk. This is the
/// backend import-time path; the reader later overwrites it with PDF.js output,
/// which has better font/layout data for modern academic PDFs.
pub fn extract_markdown_from_path(pdf_path: &Path) -> Result<String> {
    let bytes = std::fs::read(pdf_path).with_context(|| format!("read {}", pdf_path.display()))?;
    let doc = lopdf::Document::load_mem(&bytes)
        .with_context(|| format!("parse pdf {}", pdf_path.display()))?;
    let pages: Vec<u32> = doc.get_pages().keys().copied().collect();
    if pages.is_empty() {
        return Err(anyhow!("pdf has no pages: {}", pdf_path.display()));
    }
    let mut page_lines = Vec::with_capacity(pages.len());
    for (index, page) in pages.iter().enumerate() {
        let text = doc
            .extract_text(&[*page])
            .with_context(|| format!("extract page {} from {}", index + 1, pdf_path.display()))?;
        page_lines.push(extract_clean_page_lines(&text));
    }
    let repeated_margin = repeated_margin_lines(&page_lines);
    let mut out = Vec::with_capacity(page_lines.len());
    for (index, lines) in page_lines.iter().enumerate() {
        let filtered = lines
            .iter()
            .filter(|line| !repeated_margin.contains(&line_key(line)))
            .cloned()
            .collect::<Vec<_>>();
        let markdown = page_lines_to_markdown(index + 1, &filtered);
        if !markdown.trim().is_empty() {
            out.push(markdown);
        }
    }
    let markdown = out.join("\n\n");
    if markdown.trim().is_empty() {
        return Err(anyhow!(
            "pdf text extraction was empty: {}",
            pdf_path.display()
        ));
    }
    Ok(markdown)
}

fn page_text_to_markdown(page_number: usize, text: &str) -> String {
    page_lines_to_markdown(page_number, &extract_clean_page_lines(text))
}

fn extract_clean_page_lines(text: &str) -> Vec<String> {
    text.lines()
        .filter_map(clean_pdf_line)
        .filter(|line| !is_noise_line(line))
        .collect()
}

fn page_lines_to_markdown(page_number: usize, lines: &[String]) -> String {
    let mut out = vec![format!("<!-- page:{page_number} -->")];
    let mut paragraph = String::new();
    for line in lines {
        if looks_like_heading(line) {
            push_markdown_paragraph(&mut out, &mut paragraph);
            out.push(format!("## {line}"));
            continue;
        }
        if looks_like_caption(line) {
            push_markdown_paragraph(&mut out, &mut paragraph);
            out.push(line.to_string());
            continue;
        }
        if looks_like_list(line) {
            push_markdown_paragraph(&mut out, &mut paragraph);
            out.push(line.replace('•', "-"));
            continue;
        }
        if paragraph.ends_with('-') {
            paragraph.pop();
            paragraph.push_str(line);
        } else if paragraph.is_empty() {
            paragraph.push_str(line);
        } else {
            paragraph.push(' ');
            paragraph.push_str(line);
        }
    }
    push_markdown_paragraph(&mut out, &mut paragraph);
    out.join("\n\n")
}

fn clean_pdf_line(raw: &str) -> Option<String> {
    let line = raw.split_whitespace().collect::<Vec<_>>().join(" ");
    let trimmed = normalize_inline_spacing(line.trim());
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed)
    }
}

fn normalize_inline_spacing(line: &str) -> String {
    let line = regex::Regex::new(r"\[\s*([^\]]+?)\s*\]")
        .ok()
        .map(|re| {
            re.replace_all(line, |caps: &regex::Captures<'_>| {
                let inner = caps[1]
                    .split_whitespace()
                    .collect::<Vec<_>>()
                    .join(" ")
                    .replace(" ,", ",")
                    .replace(" ;", ";")
                    .replace(" :", ":");
                format!("[{inner}]")
            })
            .into_owned()
        })
        .unwrap_or_else(|| line.to_string());
    line.replace("( ", "(")
        .replace(" )", ")")
        .replace(" ,", ",")
        .replace(" .", ".")
}

fn is_noise_line(line: &str) -> bool {
    if regex::Regex::new(r"^\d+(\s+of\s+\d+)?$")
        .ok()
        .is_some_and(|re| re.is_match(line))
    {
        return true;
    }
    if line.len() <= 2 && line.chars().all(|c| !c.is_alphabetic()) {
        return true;
    }
    let total = line.chars().filter(|c| !c.is_whitespace()).count();
    let alnum = line.chars().filter(|c| c.is_alphanumeric()).count();
    total >= 5 && alnum * 100 / total < 35
}

fn repeated_margin_lines(pages: &[Vec<String>]) -> HashSet<String> {
    if pages.len() < 3 {
        return HashSet::new();
    }
    let mut counts: HashMap<String, usize> = HashMap::new();
    for page in pages {
        let mut seen = HashSet::new();
        for line in page.iter().take(4).chain(page.iter().rev().take(4)) {
            if is_repeatable_margin_line(line) {
                seen.insert(line_key(line));
            }
        }
        for key in seen {
            *counts.entry(key).or_default() += 1;
        }
    }
    counts
        .into_iter()
        .filter_map(|(key, count)| (count >= 2).then_some(key))
        .collect()
}

fn is_repeatable_margin_line(line: &str) -> bool {
    if line.len() > 120 {
        return false;
    }
    if looks_like_caption(line) {
        return false;
    }
    true
}

fn line_key(line: &str) -> String {
    line.split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .to_lowercase()
}

fn push_markdown_paragraph(out: &mut Vec<String>, paragraph: &mut String) {
    let trimmed = paragraph.trim();
    if !trimmed.is_empty() {
        out.push(trimmed.to_string());
    }
    paragraph.clear();
}

fn looks_like_heading(line: &str) -> bool {
    if looks_like_caption(line) || is_noise_line(line) {
        return false;
    }
    if line.ends_with('-') {
        return false;
    }
    let word_count = line.split_whitespace().count();
    if word_count == 0 || word_count > 16 || line.len() > 120 {
        return false;
    }
    let starts_section = regex::Regex::new(r"^(\d+(\.\d+)*\.?\s+)?[A-Z][A-Za-z0-9 ,:/&()-]+$")
        .ok()
        .is_some_and(|re| re.is_match(line));
    let all_caps = line.chars().any(|c| c.is_alphabetic())
        && !line.chars().any(|c| c.is_alphabetic() && c.is_lowercase());
    starts_section || all_caps
}

fn looks_like_caption(line: &str) -> bool {
    regex::Regex::new(r"(?i)^(fig\.|figure|table)\s*\d+")
        .ok()
        .is_some_and(|re| re.is_match(line))
}

fn looks_like_list(line: &str) -> bool {
    regex::Regex::new(r"^([*•-]|\d+[.)])\s+")
        .ok()
        .is_some_and(|re| re.is_match(line))
}

fn find_doi(text: &str) -> Option<String> {
    let re = regex::Regex::new(r"(?i)\b10\.\d{4,9}/[-._;()/:A-Z0-9]+").ok()?;
    re.find(text).map(|m| clean_doi_match(m.as_str()))
}

fn clean_doi_match(raw: &str) -> String {
    raw.trim()
        .trim_end_matches(|c: char| ".,);]>}'\"".contains(c))
        .to_string()
}

fn guess_title(text: &str) -> Option<String> {
    let line = text
        .lines()
        .map(|l| l.trim())
        .find(|l| l.len() >= 12 && l.chars().any(|c| c.is_alphabetic()))?;
    Some(line.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn doi_regex_finds_common_forms() {
        assert_eq!(
            find_doi("see 10.1038/nature12345 in text").as_deref(),
            Some("10.1038/nature12345")
        );
        assert_eq!(
            find_doi("https://doi.org/10.1109/ICCV.2017.123 ;").as_deref(),
            Some("10.1109/ICCV.2017.123")
        );
        assert!(find_doi("nothing here").is_none());
    }

    #[test]
    fn split_authors_handles_and() {
        let a = split_authors("Alice and Bob, Carol");
        assert_eq!(a, vec!["Alice", "Bob", "Carol"]);
    }

    #[test]
    fn page_text_to_markdown_filters_noise_and_keeps_captions() {
        let md = page_text_to_markdown(
            2,
            r#"
            Journal Header
            448
            ?? % . . . ?
            RESULTS
            Figure 1. Amplifier and compression system configuration.
            Long-
            term pulse compression remains stable [ 1 , 2 ].
            "#,
        );
        assert!(md.contains("<!-- page:2 -->"));
        assert!(md.contains("## RESULTS"));
        assert!(md.contains("Figure 1. Amplifier and compression system configuration."));
        assert!(md.contains("Longterm pulse compression remains stable [1, 2]."));
        assert!(!md.contains("448"));
        assert!(!md.contains("?? %"));
    }

    #[test]
    fn repeated_margin_lines_detects_headers_and_footers() {
        let pages = vec![
            vec![
                "Optics Communications".to_string(),
                "First body".to_string(),
                "15 October 1985".to_string(),
            ],
            vec![
                "Optics Communications".to_string(),
                "Second body".to_string(),
                "15 October 1985".to_string(),
            ],
            vec![
                "Optics Communications".to_string(),
                "Third body".to_string(),
                "15 October 1985".to_string(),
            ],
        ];
        let repeated = repeated_margin_lines(&pages);
        assert!(repeated.contains("optics communications"));
        assert!(repeated.contains("15 october 1985"));
        assert!(!repeated.contains("first body"));
    }

    #[test]
    fn hash_is_stable() {
        assert_eq!(hash_hex(b"hello").len(), 64);
        assert_eq!(hash_hex(b"hello"), hash_hex(b"hello"));
        assert_ne!(hash_hex(b"hello"), hash_hex(b"world"));
    }
}
