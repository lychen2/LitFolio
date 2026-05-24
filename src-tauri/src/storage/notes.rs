//! Per-paper Markdown notes file at papers/<id>/note.md.
//! Trivial wrapper around fs ops so the command layer doesn't sprinkle path math.

use anyhow::{Context, Result};
use std::path::PathBuf;

use super::paths::LibraryPaths;

fn note_path(paths: &LibraryPaths, paper_id: &str) -> PathBuf {
    paths.paper_dir(paper_id).join("note.md")
}

/// Read the note file. Returns empty string if it doesn't exist yet — opening a paper
/// for the first time should land you on a blank notepad, not an error.
pub fn read(paths: &LibraryPaths, paper_id: &str) -> Result<String> {
    let p = note_path(paths, paper_id);
    if !p.exists() {
        return Ok(String::new());
    }
    std::fs::read_to_string(&p).with_context(|| format!("read note {}", p.display()))
}

/// Write the note file. Creates parent dir if missing. Empty string is allowed
/// (and persisted as an empty file) — we don't second-guess the user blanking it.
pub fn write(paths: &LibraryPaths, paper_id: &str, content: &str) -> Result<()> {
    let p = note_path(paths, paper_id);
    if let Some(parent) = p.parent() {
        std::fs::create_dir_all(parent)
            .with_context(|| format!("create note parent dir {}", parent.display()))?;
    }
    std::fs::write(&p, content).with_context(|| format!("write note {}", p.display()))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_paths() -> (LibraryPaths, PathBuf) {
        let dir = std::env::temp_dir().join(format!("litera-note-{}", ulid::Ulid::new()));
        std::fs::create_dir_all(&dir).unwrap();
        (LibraryPaths::new(&dir), dir)
    }

    #[test]
    fn read_missing_returns_empty() {
        let (paths, dir) = temp_paths();
        assert_eq!(read(&paths, "A").unwrap(), "");
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn write_then_read_roundtrip() {
        let (paths, dir) = temp_paths();
        write(&paths, "B", "# 笔记\n第一行").unwrap();
        assert_eq!(read(&paths, "B").unwrap(), "# 笔记\n第一行");
        // overwrite
        write(&paths, "B", "").unwrap();
        assert_eq!(read(&paths, "B").unwrap(), "");
        std::fs::remove_dir_all(&dir).ok();
    }
}
