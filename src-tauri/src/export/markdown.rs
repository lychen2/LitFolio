//! Export paper notes, highlights, and terms as structured Markdown files
//! compatible with Obsidian, Logseq, and generic Markdown workflows.

use anyhow::{Context, Result};
use chrono::Utc;
use std::path::{Path, PathBuf};

use crate::storage::{
    notes, FolderRepo, HighlightRepo, LibraryPaths, Paper, PaperRepo, PaperTermRepo, TagRepo,
};

/// Summary of an export run.
#[derive(Debug, Clone, serde::Serialize)]
pub struct ExportSummary {
    pub exported: usize,
    pub skipped: usize,
    pub errors: Vec<String>,
}

/// Export a single paper as a Markdown file.
///
/// Filename: `{first_author}_{year}_{first_word}.md`
/// Content: YAML frontmatter + Notes + Highlights + Terms sections.
pub async fn export_paper_md(
    pool: &crate::storage::Pool,
    paths: &LibraryPaths,
    paper: &Paper,
    export_dir: &Path,
) -> Result<PathBuf> {
    let filename = sanitize_filename(paper);
    let out_path = export_dir.join(&filename);

    // Gather related data.
    let highlights = HighlightRepo::new(pool)
        .list_by_paper(&paper.id)
        .await
        .unwrap_or_default();
    let terms = PaperTermRepo::new(pool)
        .list_by_paper(&paper.id)
        .await
        .unwrap_or_default();
    let tags = TagRepo::new(pool)
        .for_paper(&paper.id)
        .await
        .unwrap_or_default();
    let folders = FolderRepo::new(pool)
        .for_paper(&paper.id)
        .await
        .unwrap_or_default();
    let note_content = notes::read(paths, &paper.id).unwrap_or_default();

    // Build Markdown.
    let mut md = String::new();

    // YAML frontmatter.
    md.push_str("---\n");
    md.push_str(&format!("title: \"{}\"\n", escape_yaml(&paper.title)));
    md.push_str(&format!(
        "authors: [{}]\n",
        paper
            .authors
            .iter()
            .map(|a| format!("\"{}\"", escape_yaml(a)))
            .collect::<Vec<_>>()
            .join(", ")
    ));
    if let Some(year) = paper.year {
        md.push_str(&format!("year: {year}\n"));
    }
    if let Some(ref venue) = paper.venue {
        md.push_str(&format!("venue: \"{}\"\n", escape_yaml(venue)));
    }
    if let Some(ref doi) = paper.doi {
        md.push_str(&format!("doi: \"{doi}\"\n"));
    }
    if let Some(ref arxiv) = paper.arxiv_id {
        md.push_str(&format!("arxiv_id: \"{arxiv}\"\n"));
    }
    if !tags.is_empty() {
        md.push_str(&format!(
            "tags: [{}]\n",
            tags.iter()
                .map(|t| format!("\"{}\"", escape_yaml(&t.name)))
                .collect::<Vec<_>>()
                .join(", ")
        ));
    }
    if !folders.is_empty() {
        md.push_str(&format!(
            "folders: [{}]\n",
            folders
                .iter()
                .map(|f| format!("\"{}\"", escape_yaml(&f.name)))
                .collect::<Vec<_>>()
                .join(", ")
        ));
    }
    md.push_str(&format!("read_status: {}\n", paper.read_status.as_str()));
    if let Some(ref bib) = paper.bibtex {
        md.push_str(&format!("bibtex: \"{}\"\n", escape_yaml(bib)));
    }
    md.push_str("---\n\n");

    // Title as H1.
    md.push_str(&format!("# {}\n\n", paper.title));

    // Notes section.
    md.push_str("## Notes\n\n");
    if note_content.is_empty() {
        md.push_str("_(no notes yet)_\n\n");
    } else {
        md.push_str(&note_content);
        md.push_str("\n\n");
    }

    // Highlights section.
    if !highlights.is_empty() {
        md.push_str("## Highlights\n\n");
        for h in &highlights {
            md.push_str(&format!("- **p.{}** ({}): {}\n", h.page, h.color, h.text));
            if let Some(ref note) = h.note {
                if !note.is_empty() {
                    md.push_str(&format!("  - Note: {}\n", note));
                }
            }
        }
        md.push('\n');
    }

    // Terms section with [[term]] links.
    if !terms.is_empty() {
        md.push_str("## Terms\n\n");
        for t in &terms {
            md.push_str(&format!("- **[[{}]]**: {}\n", t.term, t.local_definition));
            if !t.local_evidence.is_empty() {
                md.push_str(&format!("  - Evidence: {}\n", t.local_evidence));
            }
        }
        md.push('\n');
    }

    // Write to file.
    if let Some(parent) = out_path.parent() {
        std::fs::create_dir_all(parent)
            .with_context(|| format!("create export dir {}", parent.display()))?;
    }
    std::fs::write(&out_path, &md).with_context(|| format!("write {}", out_path.display()))?;

    // Update last_exported_at.
    PaperRepo::new(pool)
        .update_last_exported_at(&paper.id, Utc::now().timestamp())
        .await?;

    Ok(out_path)
}

/// Export all papers (optionally incremental) to the given directory.
pub async fn export_all_md(
    pool: &crate::storage::Pool,
    paths: &LibraryPaths,
    export_dir: &Path,
    incremental: bool,
) -> Result<ExportSummary> {
    let repo = PaperRepo::new(pool);
    let papers = if incremental {
        repo.list_needing_export().await?
    } else {
        repo.list_recent(10_000).await?
    };

    let mut exported = 0usize;
    let mut skipped = 0usize;
    let mut errors = Vec::new();

    for p in &papers {
        match export_paper_md(pool, paths, p, export_dir).await {
            Ok(_) => exported += 1,
            Err(e) => {
                errors.push(format!("{}: {}", p.title, e));
                skipped += 1;
            }
        }
    }

    Ok(ExportSummary {
        exported,
        skipped,
        errors,
    })
}

/// Generate a safe filename from paper metadata.
fn sanitize_filename(paper: &Paper) -> String {
    let author = paper
        .authors
        .first()
        .map(|a| {
            let name = a.trim();
            let last = if let Some(idx) = name.find(',') {
                name[..idx].trim()
            } else {
                name.split_whitespace().last().unwrap_or("unknown")
            };
            last.to_lowercase()
                .chars()
                .filter(|c| c.is_alphanumeric() || *c == '_')
                .collect::<String>()
        })
        .unwrap_or_else(|| "unknown".into());

    let year = paper.year.unwrap_or(0);

    let first_word = paper
        .title
        .split_whitespace()
        .next()
        .unwrap_or("untitled")
        .to_lowercase()
        .chars()
        .filter(|c| c.is_alphanumeric())
        .collect::<String>();

    format!("{author}_{year}_{first_word}.md")
}

/// Escape special YAML characters in a string value.
fn escape_yaml(s: &str) -> String {
    s.replace('"', "\\\"").replace('\\', "\\\\")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sanitize_filename_basic() {
        let p = Paper {
            id: "t".into(),
            title: "Attention Is All You Need".into(),
            authors: vec!["Vaswani, Ashish".into()],
            year: Some(2017),
            venue: None,
            doi: None,
            arxiv_id: None,
            abstract_text: None,
            pdf_path: None,
            note_path: None,
            added_at: 0,
            updated_at: 0,
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
        };
        assert_eq!(sanitize_filename(&p), "vaswani_2017_attention.md");
    }
}
