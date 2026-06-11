//! Resolve the user's library root and the canonical paths inside it.

use anyhow::{anyhow, Context, Result};
use std::path::{Path, PathBuf};

#[derive(Debug, Clone)]
pub struct LibraryPaths {
    pub root: PathBuf,
}

#[derive(Debug, Default)]
pub struct LegacyPdfTextMigration {
    pub converted: usize,
    pub removed_legacy: usize,
    pub markdown_documents: Vec<(String, String)>,
}

impl LibraryPaths {
    pub fn new<P: Into<PathBuf>>(root: P) -> Self {
        Self { root: root.into() }
    }

    pub fn db_file(&self) -> PathBuf {
        self.root.join("library.db")
    }
    pub fn papers_dir(&self) -> PathBuf {
        self.root.join("papers")
    }
    pub fn notes_dir(&self) -> PathBuf {
        self.root.join("notes")
    }
    pub fn vectors_dir(&self) -> PathBuf {
        self.root.join("vectors")
    }
    pub fn attachments_dir(&self) -> PathBuf {
        self.root.join("attachments")
    }
    pub fn backups_dir(&self) -> PathBuf {
        self.root.join("backups")
    }
    pub fn logs_dir(&self) -> PathBuf {
        self.root.join("logs")
    }
    pub fn app_log_file(&self) -> PathBuf {
        self.logs_dir().join("litfolio.log")
    }
    pub fn config_file(&self) -> PathBuf {
        self.root.join("litera.config.json")
    }

    pub fn paper_dir(&self, paper_id: &str) -> PathBuf {
        self.papers_dir().join(paper_id)
    }
    pub fn note_file(&self, paper_id: &str) -> PathBuf {
        self.notes_dir().join(format!("{paper_id}.md"))
    }
    /// Where the Markdown extracted from the paper's PDF lives. Written by
    /// `paper_set_pdf_text` after pdfjs renders in the reader. The command
    /// name is kept for API compatibility, but new writes are Markdown-first.
    pub fn paper_markdown_file(&self, paper_id: &str) -> PathBuf {
        self.paper_dir(paper_id).join("document.md")
    }
    /// Legacy plain-text cache path. Read for compatibility with existing
    /// libraries; new extraction writes `document.md`.
    pub fn pdf_text_file(&self, paper_id: &str) -> PathBuf {
        self.paper_dir(paper_id).join("text.txt")
    }
    /// Read cached body content for a paper. Returns None when the file is
    /// missing, unreadable, or only whitespace — i.e. anything the
    /// summarizer should treat as "no body available".
    pub fn read_pdf_text(&self, paper_id: &str) -> Option<String> {
        self.read_paper_markdown(paper_id)
            .or_else(|| self.read_legacy_pdf_text(paper_id))
    }
    pub fn read_paper_markdown(&self, paper_id: &str) -> Option<String> {
        read_non_empty_file(self.paper_markdown_file(paper_id))
    }
    fn read_legacy_pdf_text(&self, paper_id: &str) -> Option<String> {
        read_non_empty_file(self.pdf_text_file(paper_id))
    }
    /// Persist extracted Markdown next to the paper.
    pub fn write_paper_markdown(&self, paper_id: &str, markdown: &str) -> Result<()> {
        let dir = self.paper_dir(paper_id);
        std::fs::create_dir_all(&dir).map_err(|e| anyhow!("create {}: {e}", dir.display()))?;
        let path = self.paper_markdown_file(paper_id);
        std::fs::write(&path, markdown).map_err(|e| anyhow!("write {}: {e}", path.display()))?;
        let legacy = self.pdf_text_file(paper_id);
        if legacy.exists() {
            std::fs::remove_file(&legacy)
                .map_err(|e| anyhow!("remove legacy PDF text cache {}: {e}", legacy.display()))?;
        }
        Ok(())
    }
    /// Persist body text next to the paper. Used by the lopdf fallback so
    /// the next TLDR/QuickRead skips re-extraction.
    pub fn write_pdf_text(&self, paper_id: &str, body: &str) -> Result<()> {
        self.write_paper_markdown(paper_id, body)
    }

    pub fn ensure(&self) -> Result<()> {
        ensure_dir(&self.root)?;
        ensure_dir(&self.papers_dir())?;
        ensure_dir(&self.notes_dir())?;
        ensure_dir(&self.vectors_dir())?;
        ensure_dir(&self.attachments_dir())?;
        ensure_dir(&self.backups_dir())?;
        ensure_dir(&self.logs_dir())?;
        Ok(())
    }

    /// Canonicalize `candidate` and assert it lives inside the library root.
    /// Rejects symlink-escapes, absolute paths outside the root, and `..` traversal.
    /// Used by every command that touches a paper-bound PDF before opening/reading/writing it.
    pub fn ensure_inside_root(&self, candidate: &Path) -> Result<PathBuf> {
        let canon_root = std::fs::canonicalize(&self.root)
            .map_err(|e| anyhow!("canonicalize library root {}: {e}", self.root.display()))?;
        let canon_candidate = std::fs::canonicalize(candidate)
            .map_err(|e| anyhow!("canonicalize {}: {e}", candidate.display()))?;
        if !canon_candidate.starts_with(&canon_root) {
            return Err(anyhow!(
                "path {} is outside library root {}",
                canon_candidate.display(),
                canon_root.display()
            ));
        }
        Ok(canon_candidate)
    }

    /// Sanity-check a PDF the user picked via dialog before we copy it into the
    /// library. Rejects non-existent paths, non-PDF files, and anything that
    /// canonicalizes to a location already inside our own library root (a
    /// self-import would either overwrite or trigger the in-root checks
    /// downstream — and there is no legitimate reason for the source picker
    /// to point at a paper we already manage).
    ///
    /// The magic-byte check is what blocks the real attack: an XSS that calls
    /// `paper_save_with_pdf` with `/etc/passwd` no longer slips through, because
    /// `/etc/passwd` does not start with the `%PDF-` header.
    pub fn validate_external_pdf(&self, candidate: &Path) -> Result<PathBuf> {
        let canon = std::fs::canonicalize(candidate).map_err(|e| {
            anyhow!(
                "PDF source {} cannot be canonicalized: {e}",
                candidate.display()
            )
        })?;
        if !canon.is_file() {
            return Err(anyhow!(
                "PDF source {} is not a regular file",
                canon.display()
            ));
        }
        let ext = canon
            .extension()
            .and_then(|e| e.to_str())
            .map(|e| e.to_ascii_lowercase())
            .unwrap_or_default();
        if ext != "pdf" {
            return Err(anyhow!(
                "only .pdf files are accepted (got .{})",
                if ext.is_empty() {
                    "<none>".to_string()
                } else {
                    ext
                }
            ));
        }
        // Reject sources that already live in our library — there is no
        // legitimate "import this back into itself" flow, and allowing it
        // would create overwrite hazards.
        if let Ok(canon_root) = std::fs::canonicalize(&self.root) {
            if canon.starts_with(&canon_root) {
                return Err(anyhow!(
                    "PDF source {} is already inside the library; pick an external file",
                    canon.display()
                ));
            }
        }
        // Verify %PDF- magic header. This is the load-bearing check: it blocks
        // an attacker from passing /etc/passwd, ~/.ssh/id_rsa renamed to .pdf,
        // or any non-PDF payload they can stage on disk.
        let mut header = [0u8; 5];
        use std::io::Read;
        let mut f = std::fs::File::open(&canon)
            .map_err(|e| anyhow!("open PDF source {}: {e}", canon.display()))?;
        f.read_exact(&mut header)
            .map_err(|e| anyhow!("read PDF header from {}: {e}", canon.display()))?;
        if &header != b"%PDF-" {
            return Err(anyhow!(
                "{} does not start with the %PDF- header",
                canon.display()
            ));
        }
        Ok(canon)
    }

    pub fn migrate_legacy_pdf_text_cache(&self) -> Result<LegacyPdfTextMigration> {
        let mut summary = LegacyPdfTextMigration::default();
        if !self.papers_dir().exists() {
            return Ok(summary);
        }
        for entry in std::fs::read_dir(self.papers_dir())
            .with_context(|| format!("read {}", self.papers_dir().display()))?
        {
            let entry = entry?;
            if !entry.file_type()?.is_dir() {
                continue;
            }
            let paper_id = entry.file_name().to_string_lossy().to_string();
            let markdown_path = self.paper_markdown_file(&paper_id);
            let legacy_path = self.pdf_text_file(&paper_id);
            if !legacy_path.exists() {
                if let Some(markdown) = read_non_empty_file(markdown_path) {
                    summary.markdown_documents.push((paper_id, markdown));
                }
                continue;
            }
            if !markdown_path.exists() {
                let legacy = std::fs::read_to_string(&legacy_path)
                    .with_context(|| format!("read {}", legacy_path.display()))?;
                let trimmed = legacy.trim();
                if !trimmed.is_empty() {
                    self.write_paper_markdown(&paper_id, trimmed)?;
                    summary.converted += 1;
                    summary
                        .markdown_documents
                        .push((paper_id, trimmed.to_string()));
                    summary.removed_legacy += 1;
                    continue;
                }
            } else if let Some(markdown) = read_non_empty_file(markdown_path) {
                summary
                    .markdown_documents
                    .push((paper_id.clone(), markdown));
            }
            std::fs::remove_file(&legacy_path).with_context(|| {
                format!("remove legacy PDF text cache {}", legacy_path.display())
            })?;
            summary.removed_legacy += 1;
        }
        Ok(summary)
    }
}

fn ensure_dir(p: &Path) -> Result<()> {
    if !p.exists() {
        std::fs::create_dir_all(p)?;
    }
    Ok(())
}

fn read_non_empty_file(path: PathBuf) -> Option<String> {
    let raw = std::fs::read_to_string(path).ok()?;
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}

pub fn default_library_root() -> Result<PathBuf> {
    let home = dirs::home_dir().ok_or_else(|| anyhow!("cannot resolve home dir"))?;
    Ok(home.join("Litera-Library"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn app_log_file_lives_under_library_logs() {
        let root = PathBuf::from("/tmp/litfolio-test-root");
        let paths = LibraryPaths::new(&root);

        assert_eq!(paths.app_log_file(), root.join("logs").join("litfolio.log"));
    }

    #[test]
    fn ensure_creates_layout() {
        let tmp = std::env::temp_dir().join(format!("litera-test-{}", ulid::Ulid::new()));
        let paths = LibraryPaths::new(&tmp);
        paths.ensure().unwrap();
        assert!(paths.papers_dir().is_dir());
        assert!(paths.notes_dir().is_dir());
        assert!(paths.vectors_dir().is_dir());
        fs::remove_dir_all(&tmp).ok();
    }

    #[test]
    fn write_paper_markdown_removes_legacy_text_cache() {
        let tmp = std::env::temp_dir().join(format!("litera-mdwrite-{}", ulid::Ulid::new()));
        let paths = LibraryPaths::new(&tmp);
        paths.ensure().unwrap();
        let legacy = paths.pdf_text_file("abc");
        fs::create_dir_all(legacy.parent().unwrap()).unwrap();
        fs::write(&legacy, "old plain text").unwrap();

        paths.write_paper_markdown("abc", "# Markdown").unwrap();

        assert_eq!(
            fs::read_to_string(paths.paper_markdown_file("abc")).unwrap(),
            "# Markdown"
        );
        assert!(!legacy.exists());
        fs::remove_dir_all(&tmp).ok();
    }

    #[test]
    fn migrate_legacy_pdf_text_cache_writes_document_markdown() {
        let tmp = std::env::temp_dir().join(format!("litera-mdmigrate-{}", ulid::Ulid::new()));
        let paths = LibraryPaths::new(&tmp);
        paths.ensure().unwrap();
        let legacy = paths.pdf_text_file("abc");
        fs::create_dir_all(legacy.parent().unwrap()).unwrap();
        fs::write(&legacy, "legacy body").unwrap();

        let summary = paths.migrate_legacy_pdf_text_cache().unwrap();

        assert_eq!(summary.converted, 1);
        assert_eq!(summary.removed_legacy, 1);
        assert_eq!(
            summary.markdown_documents,
            vec![("abc".to_string(), "legacy body".to_string())]
        );
        assert_eq!(
            fs::read_to_string(paths.paper_markdown_file("abc")).unwrap(),
            "legacy body"
        );
        assert!(!legacy.exists());
        fs::remove_dir_all(&tmp).ok();
    }

    #[test]
    fn ensure_inside_root_accepts_paper_bound_pdf() {
        let tmp = std::env::temp_dir().join(format!("litera-root-{}", ulid::Ulid::new()));
        let paths = LibraryPaths::new(&tmp);
        paths.ensure().unwrap();
        let pdf = paths.paper_dir("abc").join("original.pdf");
        fs::create_dir_all(pdf.parent().unwrap()).unwrap();
        fs::write(&pdf, b"%PDF-1.4 stub").unwrap();
        let canon = paths.ensure_inside_root(&pdf).unwrap();
        assert!(canon.starts_with(std::fs::canonicalize(&tmp).unwrap()));
        fs::remove_dir_all(&tmp).ok();
    }

    #[test]
    fn ensure_inside_root_rejects_traversal_escape() {
        let tmp = std::env::temp_dir().join(format!("litera-escape-{}", ulid::Ulid::new()));
        let paths = LibraryPaths::new(&tmp);
        paths.ensure().unwrap();
        let outside = std::env::temp_dir().join(format!("outside-{}.pdf", ulid::Ulid::new()));
        fs::write(&outside, b"evil").unwrap();
        assert!(paths.ensure_inside_root(&outside).is_err());
        fs::remove_file(&outside).ok();
        fs::remove_dir_all(&tmp).ok();
    }

    #[test]
    fn ensure_inside_root_rejects_nonexistent_path() {
        let tmp = std::env::temp_dir().join(format!("litera-missing-{}", ulid::Ulid::new()));
        let paths = LibraryPaths::new(&tmp);
        paths.ensure().unwrap();
        let phantom = paths.paper_dir("ghost").join("original.pdf");
        assert!(paths.ensure_inside_root(&phantom).is_err());
        fs::remove_dir_all(&tmp).ok();
    }

    #[test]
    fn validate_external_pdf_accepts_real_pdf() {
        let tmp = std::env::temp_dir().join(format!("litera-extpdf-{}", ulid::Ulid::new()));
        let paths = LibraryPaths::new(&tmp);
        paths.ensure().unwrap();
        let outside_dir = std::env::temp_dir().join(format!("source-{}", ulid::Ulid::new()));
        fs::create_dir_all(&outside_dir).unwrap();
        let src = outside_dir.join("paper.pdf");
        fs::write(&src, b"%PDF-1.4\nstub").unwrap();
        let canon = paths.validate_external_pdf(&src).unwrap();
        assert!(canon.ends_with("paper.pdf"));
        fs::remove_dir_all(&outside_dir).ok();
        fs::remove_dir_all(&tmp).ok();
    }

    #[test]
    fn validate_external_pdf_rejects_non_pdf_extension() {
        let tmp = std::env::temp_dir().join(format!("litera-ext-{}", ulid::Ulid::new()));
        let paths = LibraryPaths::new(&tmp);
        paths.ensure().unwrap();
        let outside_dir = std::env::temp_dir().join(format!("source-{}", ulid::Ulid::new()));
        fs::create_dir_all(&outside_dir).unwrap();
        let evil = outside_dir.join("passwd");
        fs::write(&evil, b"root:x:0:0:...").unwrap();
        let err = paths.validate_external_pdf(&evil).unwrap_err().to_string();
        assert!(err.contains("only .pdf"), "got: {err}");
        fs::remove_dir_all(&outside_dir).ok();
        fs::remove_dir_all(&tmp).ok();
    }

    #[test]
    fn validate_external_pdf_rejects_missing_magic_header() {
        let tmp = std::env::temp_dir().join(format!("litera-magic-{}", ulid::Ulid::new()));
        let paths = LibraryPaths::new(&tmp);
        paths.ensure().unwrap();
        let outside_dir = std::env::temp_dir().join(format!("source-{}", ulid::Ulid::new()));
        fs::create_dir_all(&outside_dir).unwrap();
        // Looks like a PDF by name but is HTML — classic phishing payload.
        let fake = outside_dir.join("not-actually.pdf");
        fs::write(&fake, b"<html><body>nope</body></html>").unwrap();
        let err = paths.validate_external_pdf(&fake).unwrap_err().to_string();
        assert!(err.contains("%PDF-"), "got: {err}");
        fs::remove_dir_all(&outside_dir).ok();
        fs::remove_dir_all(&tmp).ok();
    }

    #[test]
    fn validate_external_pdf_rejects_source_inside_library() {
        let tmp = std::env::temp_dir().join(format!("litera-self-{}", ulid::Ulid::new()));
        let paths = LibraryPaths::new(&tmp);
        paths.ensure().unwrap();
        let inside = paths.paper_dir("abc").join("original.pdf");
        fs::create_dir_all(inside.parent().unwrap()).unwrap();
        fs::write(&inside, b"%PDF-1.4 stub").unwrap();
        let err = paths
            .validate_external_pdf(&inside)
            .unwrap_err()
            .to_string();
        assert!(err.contains("already inside"), "got: {err}");
        fs::remove_dir_all(&tmp).ok();
    }
}
