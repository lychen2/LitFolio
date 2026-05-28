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
}
