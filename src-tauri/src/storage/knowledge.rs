use anyhow::{Context, Result};

use super::paths::LibraryPaths;

const KNOWLEDGE_DIR: &str = "knowledge";

pub fn save_markdown(paths: &LibraryPaths, slug: &str, content: &str) -> Result<String> {
    let dir = paths.root.join(KNOWLEDGE_DIR);
    std::fs::create_dir_all(&dir).with_context(|| format!("create {}", dir.display()))?;
    let path = dir.join(format!("{slug}.md"));
    std::fs::write(&path, content).with_context(|| format!("write {}", path.display()))?;
    Ok(path.display().to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::storage::LibraryPaths;

    #[test]
    fn writes_knowledge_note() {
        let root = std::env::temp_dir().join(format!("litera-knowledge-{}", ulid::Ulid::new()));
        let paths = LibraryPaths::new(&root);
        paths.ensure().unwrap();
        let path = save_markdown(&paths, "test-note", "# Test").unwrap();
        assert!(path.ends_with("knowledge/test-note.md"));
        std::fs::remove_dir_all(root).ok();
    }
}
