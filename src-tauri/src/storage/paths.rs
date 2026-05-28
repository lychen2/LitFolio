//! Resolve the user's library root and the canonical paths inside it.

use anyhow::{anyhow, Result};
use std::path::{Path, PathBuf};

#[derive(Debug, Clone)]
pub struct LibraryPaths {
    pub root: PathBuf,
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
    pub fn config_file(&self) -> PathBuf {
        self.root.join("litera.config.json")
    }

    pub fn paper_dir(&self, paper_id: &str) -> PathBuf {
        self.papers_dir().join(paper_id)
    }
    pub fn note_file(&self, paper_id: &str) -> PathBuf {
        self.notes_dir().join(format!("{paper_id}.md"))
    }

    pub fn ensure(&self) -> Result<()> {
        ensure_dir(&self.root)?;
        ensure_dir(&self.papers_dir())?;
        ensure_dir(&self.notes_dir())?;
        ensure_dir(&self.vectors_dir())?;
        ensure_dir(&self.attachments_dir())?;
        ensure_dir(&self.backups_dir())?;
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
        let canon = std::fs::canonicalize(candidate)
            .map_err(|e| anyhow!("PDF source {} cannot be canonicalized: {e}", candidate.display()))?;
        if !canon.is_file() {
            return Err(anyhow!("PDF source {} is not a regular file", canon.display()));
        }
        let ext = canon
            .extension()
            .and_then(|e| e.to_str())
            .map(|e| e.to_ascii_lowercase())
            .unwrap_or_default();
        if ext != "pdf" {
            return Err(anyhow!(
                "only .pdf files are accepted (got .{})",
                if ext.is_empty() { "<none>".to_string() } else { ext }
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
}

fn ensure_dir(p: &Path) -> Result<()> {
    if !p.exists() {
        std::fs::create_dir_all(p)?;
    }
    Ok(())
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
        let err = paths.validate_external_pdf(&inside).unwrap_err().to_string();
        assert!(err.contains("already inside"), "got: {err}");
        fs::remove_dir_all(&tmp).ok();
    }
}
