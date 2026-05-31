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
/// when the higher-quality pdf.js extraction (saved as `text.txt` by the
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
    fn hash_is_stable() {
        assert_eq!(hash_hex(b"hello").len(), 64);
        assert_eq!(hash_hex(b"hello"), hash_hex(b"hello"));
        assert_ne!(hash_hex(b"hello"), hash_hex(b"world"));
    }
}
