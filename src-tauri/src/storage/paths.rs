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

    pub fn db_file(&self) -> PathBuf { self.root.join("library.db") }
    pub fn papers_dir(&self) -> PathBuf { self.root.join("papers") }
    pub fn notes_dir(&self) -> PathBuf { self.root.join("notes") }
    pub fn vectors_dir(&self) -> PathBuf { self.root.join("vectors") }
    pub fn attachments_dir(&self) -> PathBuf { self.root.join("attachments") }
    pub fn backups_dir(&self) -> PathBuf { self.root.join("backups") }
    pub fn config_file(&self) -> PathBuf { self.root.join("litera.config.json") }

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
}
