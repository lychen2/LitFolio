//! Paper deduplication: find and merge duplicate papers.

use std::collections::{HashMap, HashSet};

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use sqlx::Row;

use super::db::Pool;
use super::papers::row_to_paper;
use super::Paper;

mod matching;
mod merge;

use matching::{levenshtein, normalize_title};
pub use merge::merge_papers;

/// A suspected duplicate pair with a reason.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DuplicatePair {
    pub paper_a: Paper,
    pub paper_b: Paper,
    pub reason: String, // "doi_match", "arxiv_match", "title_similar"
}

/// Find a duplicate of the given paper in the library.
/// Checks DOI match → arXiv ID match → title similarity (normalized Levenshtein < 0.15).
pub async fn find_duplicate(pool: &Pool, paper: &Paper) -> Result<Option<Paper>> {
    // 1. DOI match
    if let Some(ref doi) = paper.doi {
        let doi_trimmed = doi.trim().to_lowercase();
        if !doi_trimmed.is_empty() {
            let row = sqlx::query(
                "SELECT id, title, authors_json, year, venue, doi, arxiv_id, abstract,
                        pdf_path, note_path, added_at, updated_at, read_status, tldr,
                        research_question, method, dataset, key_findings_json, limitations,
                        comparison, title_translated, abstract_translated, translate_target_lang,
                        translated_at, bibtex, last_exported_at
                 FROM papers WHERE lower(trim(doi)) = ?1 AND id != ?2 LIMIT 1",
            )
            .bind(&doi_trimmed)
            .bind(&paper.id)
            .fetch_optional(pool)
            .await
            .context("find duplicate by doi")?;
            if let Some(r) = row {
                return Ok(Some(row_to_paper(r)?));
            }
        }
    }

    // 2. arXiv ID match
    if let Some(ref arxiv) = paper.arxiv_id {
        let arxiv_trimmed = arxiv.trim().to_lowercase();
        if !arxiv_trimmed.is_empty() {
            let row = sqlx::query(
                "SELECT id, title, authors_json, year, venue, doi, arxiv_id, abstract,
                        pdf_path, note_path, added_at, updated_at, read_status, tldr,
                        research_question, method, dataset, key_findings_json, limitations,
                        comparison, title_translated, abstract_translated, translate_target_lang,
                        translated_at, bibtex, last_exported_at
                 FROM papers WHERE lower(trim(arxiv_id)) = ?1 AND id != ?2 LIMIT 1",
            )
            .bind(&arxiv_trimmed)
            .bind(&paper.id)
            .fetch_optional(pool)
            .await
            .context("find duplicate by arxiv")?;
            if let Some(r) = row {
                return Ok(Some(row_to_paper(r)?));
            }
        }
    }

    // 3. Title similarity (normalized Levenshtein < 0.15)
    let title_norm = normalize_title(&paper.title);
    if title_norm.len() >= 5 {
        // Fetch all papers with similar-length titles to narrow the search.
        let min_len = (title_norm.len() as f64 * 0.80) as usize;
        let max_len = (title_norm.len() as f64 * 1.20) as usize;
        let rows = sqlx::query(
            "SELECT id, title, authors_json, year, venue, doi, arxiv_id, abstract,
                    pdf_path, note_path, added_at, updated_at, read_status, tldr,
                    research_question, method, dataset, key_findings_json, limitations,
                    comparison, title_translated, abstract_translated, translate_target_lang,
                    translated_at, bibtex, last_exported_at
             FROM papers WHERE id != ?1 AND length(title) BETWEEN ?2 AND ?3",
        )
        .bind(&paper.id)
        .bind(min_len as i64)
        .bind(max_len as i64)
        .fetch_all(pool)
        .await
        .context("find duplicate by title similarity")?;

        for r in rows {
            let candidate = row_to_paper(r)?;
            let cand_norm = normalize_title(&candidate.title);
            let dist = levenshtein(&title_norm, &cand_norm);
            let max_len = title_norm.len().max(cand_norm.len()) as f64;
            if max_len > 0.0 && (dist as f64 / max_len) < 0.15 {
                return Ok(Some(candidate));
            }
        }
    }

    Ok(None)
}

/// Scan all papers for duplicate pairs.
pub async fn scan_all_duplicates(pool: &Pool) -> Result<Vec<DuplicatePair>> {
    let rows = sqlx::query(
        "SELECT id, title, authors_json, year, venue, doi, arxiv_id, abstract,
                pdf_path, note_path, added_at, updated_at, read_status, tldr,
                research_question, method, dataset, key_findings_json, limitations,
                comparison, title_translated, abstract_translated, translate_target_lang,
                translated_at, bibtex, last_exported_at
         FROM papers ORDER BY added_at",
    )
    .fetch_all(pool)
    .await
    .context("scan all papers for dedup")?;

    let papers: Vec<Paper> = rows.into_iter().map(row_to_paper).collect::<Result<_>>()?;
    let by_id = papers
        .iter()
        .map(|paper| (paper.id.clone(), paper))
        .collect::<HashMap<_, _>>();
    let mut pairs = Vec::new();
    let mut seen = HashSet::new();

    add_exact_duplicate_pairs(pool, &by_id, "doi", "doi_match", &mut seen, &mut pairs).await?;
    add_exact_duplicate_pairs(
        pool,
        &by_id,
        "arxiv_id",
        "arxiv_match",
        &mut seen,
        &mut pairs,
    )
    .await?;
    add_title_duplicate_pairs(&papers, &mut seen, &mut pairs);

    Ok(pairs)
}

async fn add_exact_duplicate_pairs(
    pool: &Pool,
    by_id: &HashMap<String, &Paper>,
    column: &str,
    reason: &str,
    seen: &mut HashSet<String>,
    pairs: &mut Vec<DuplicatePair>,
) -> Result<()> {
    let sql = format!(
        "SELECT lower(trim({column})) AS key, group_concat(id, char(31)) AS ids
         FROM papers
         WHERE {column} IS NOT NULL AND trim({column}) != ''
         GROUP BY key HAVING COUNT(*) > 1"
    );
    let rows = sqlx::query(&sql)
        .fetch_all(pool)
        .await
        .with_context(|| format!("scan duplicate {column}"))?;
    for row in rows {
        let ids: String = row.try_get("ids")?;
        add_duplicate_group(ids.split('\u{1f}'), by_id, reason, seen, pairs);
    }
    Ok(())
}

fn add_title_duplicate_pairs(
    papers: &[Paper],
    seen: &mut HashSet<String>,
    pairs: &mut Vec<DuplicatePair>,
) {
    let mut buckets: HashMap<usize, Vec<(&Paper, String)>> = HashMap::new();
    for paper in papers {
        let normalized = normalize_title(&paper.title);
        if normalized.len() >= 5 {
            buckets
                .entry(normalized.len() / 10)
                .or_default()
                .push((paper, normalized));
        }
    }

    let mut keys = buckets.keys().copied().collect::<Vec<_>>();
    keys.sort_unstable();
    for bucket in keys {
        let mut candidates = Vec::new();
        for nearby in bucket.saturating_sub(1)..=bucket + 1 {
            if let Some(items) = buckets.get(&nearby) {
                candidates.extend(items.iter());
            }
        }
        if let Some(items) = buckets.get(&bucket) {
            for (paper, title_norm) in items {
                for (other, other_norm) in candidates.iter().copied() {
                    if paper.id >= other.id {
                        continue;
                    }
                    let len_ratio = title_norm.len() as f64 / other_norm.len().max(1) as f64;
                    if !(0.80..=1.20).contains(&len_ratio) {
                        continue;
                    }
                    let dist = levenshtein(title_norm, other_norm);
                    let max_len = title_norm.len().max(other_norm.len()) as f64;
                    if max_len > 0.0 && (dist as f64 / max_len) < 0.15 {
                        push_pair(paper, other, "title_similar", seen, pairs);
                    }
                }
            }
        }
    }
}

fn add_duplicate_group<'a>(
    ids: impl Iterator<Item = &'a str>,
    by_id: &HashMap<String, &Paper>,
    reason: &str,
    seen: &mut HashSet<String>,
    pairs: &mut Vec<DuplicatePair>,
) {
    let papers = ids
        .filter_map(|id| by_id.get(id).copied())
        .collect::<Vec<_>>();
    for (i, paper) in papers.iter().enumerate() {
        for other in papers.iter().skip(i + 1) {
            push_pair(paper, other, reason, seen, pairs);
        }
    }
}

fn push_pair(
    paper: &Paper,
    other: &Paper,
    reason: &str,
    seen: &mut HashSet<String>,
    pairs: &mut Vec<DuplicatePair>,
) {
    let key = pair_key(&paper.id, &other.id);
    if !seen.insert(key) {
        return;
    }
    pairs.push(DuplicatePair {
        paper_a: paper.clone(),
        paper_b: other.clone(),
        reason: reason.into(),
    });
}

fn pair_key(a: &str, b: &str) -> String {
    if a < b {
        format!("{}:{}", a, b)
    } else {
        format!("{}:{}", b, a)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::storage::db::{open_pool, run_migrations};
    use crate::storage::{PaperRepo, ReadStatus};
    use chrono::Utc;
    use std::path::PathBuf;

    async fn temp_pool() -> (Pool, PathBuf) {
        let dir = std::env::temp_dir().join(format!("litera-dedup-{}", ulid::Ulid::new()));
        std::fs::create_dir_all(&dir).unwrap();
        let db = dir.join("library.db");
        let pool = open_pool(&db).await.unwrap();
        run_migrations(&pool).await.unwrap();
        (pool, dir)
    }

    fn paper(id: &str, title: &str) -> Paper {
        let now = Utc::now().timestamp();
        Paper {
            id: id.into(),
            title: title.into(),
            authors: vec!["Author".into()],
            year: Some(2026),
            venue: Some("Venue".into()),
            doi: None,
            arxiv_id: None,
            abstract_text: None,
            pdf_path: Some(format!("/tmp/{id}.pdf")),
            note_path: None,
            added_at: now,
            updated_at: now,
            read_status: ReadStatus::Unread,
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
        }
    }

    async fn insert(repo: &PaperRepo<'_>, paper: &Paper) {
        repo.insert(paper).await.unwrap();
    }

    #[tokio::test]
    async fn find_duplicate_matches_doi_case_and_whitespace() {
        let (pool, dir) = temp_pool().await;
        let repo = PaperRepo::new(&pool);
        let mut existing = paper("existing", "Existing Paper");
        existing.doi = Some(" 10.1234/ABC ".into());
        insert(&repo, &existing).await;

        let mut incoming = paper("incoming", "Different Title");
        incoming.doi = Some("10.1234/abc".into());
        let duplicate = find_duplicate(&pool, &incoming).await.unwrap().unwrap();

        assert_eq!(duplicate.id, existing.id);
        std::fs::remove_dir_all(dir).ok();
    }

    #[tokio::test]
    async fn find_duplicate_ignores_blank_doi_and_uses_arxiv() {
        let (pool, dir) = temp_pool().await;
        let repo = PaperRepo::new(&pool);
        let mut existing = paper("existing", "Existing Paper");
        existing.arxiv_id = Some("2401.01234".into());
        insert(&repo, &existing).await;

        let mut incoming = paper("incoming", "Different Title");
        incoming.doi = Some("   ".into());
        incoming.arxiv_id = Some("2401.01234".into());
        let duplicate = find_duplicate(&pool, &incoming).await.unwrap().unwrap();

        assert_eq!(duplicate.id, existing.id);
        std::fs::remove_dir_all(dir).ok();
    }

    #[tokio::test]
    async fn find_duplicate_matches_arxiv_case_and_whitespace() {
        let (pool, dir) = temp_pool().await;
        let repo = PaperRepo::new(&pool);
        let mut existing = paper("existing", "Existing Paper");
        existing.arxiv_id = Some(" ARXIV:2401.01234 ".into());
        insert(&repo, &existing).await;

        let mut incoming = paper("incoming", "Different Title");
        incoming.arxiv_id = Some("arxiv:2401.01234".into());
        let duplicate = find_duplicate(&pool, &incoming).await.unwrap().unwrap();

        assert_eq!(duplicate.id, existing.id);
        std::fs::remove_dir_all(dir).ok();
    }

    #[tokio::test]
    async fn find_duplicate_matches_similar_titles() {
        let (pool, dir) = temp_pool().await;
        let repo = PaperRepo::new(&pool);
        let existing = paper("existing", "Attention Is All You Need!");
        insert(&repo, &existing).await;

        let incoming = paper("incoming", "attention is all you need");
        let duplicate = find_duplicate(&pool, &incoming).await.unwrap().unwrap();

        assert_eq!(duplicate.id, existing.id);
        std::fs::remove_dir_all(dir).ok();
    }

    #[tokio::test]
    async fn find_duplicate_ignores_short_title_similarity() {
        let (pool, dir) = temp_pool().await;
        let repo = PaperRepo::new(&pool);
        insert(&repo, &paper("existing", "AI")).await;

        let incoming = paper("incoming", "AI");
        let duplicate = find_duplicate(&pool, &incoming).await.unwrap();

        assert!(duplicate.is_none());
        std::fs::remove_dir_all(dir).ok();
    }

    #[tokio::test]
    async fn find_duplicate_excludes_same_paper_id() {
        let (pool, dir) = temp_pool().await;
        let repo = PaperRepo::new(&pool);
        let mut existing = paper("same", "Existing Paper");
        existing.doi = Some("10.1234/same".into());
        insert(&repo, &existing).await;

        let duplicate = find_duplicate(&pool, &existing).await.unwrap();

        assert!(duplicate.is_none());
        std::fs::remove_dir_all(dir).ok();
    }

    #[tokio::test]
    async fn merge_papers_removes_duplicate_and_rehomes_related_data() {
        let (pool, dir) = temp_pool().await;
        let repo = PaperRepo::new(&pool);
        let mut keep = paper("keep", "Same Paper");
        keep.doi = Some("10.1234/keep".into());
        let mut duplicate = paper("duplicate", "Same Paper Copy");
        duplicate.doi = Some("10.1234/duplicate".into());
        insert(&repo, &keep).await;
        insert(&repo, &duplicate).await;

        sqlx::query("INSERT INTO research_projects (id, name, created_at, updated_at) VALUES (1, 'P', 1, 1)")
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query("INSERT INTO project_papers (project_id, paper_id, added_at) VALUES (1, 'duplicate', 1)")
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query("INSERT INTO paper_documents (paper_id, markdown, updated_at) VALUES ('duplicate', 'markdown', 1)")
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query("INSERT INTO paper_embeddings (paper_id, model, embedding, content_hash, created_at) VALUES ('duplicate', 'm', x'0102', 'h', 1)")
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query("INSERT INTO evidence_items (project_id, source_type, paper_id, excerpt, created_at, updated_at) VALUES (1, 'paper', 'duplicate', 'e', 1, 1)")
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query("INSERT INTO paper_supplements (paper_id, title, file_path, file_kind, created_at, updated_at) VALUES ('duplicate', 'S', '/tmp/s.pdf', 'pdf', 1, 1)")
            .execute(&pool)
            .await
            .unwrap();

        merge_papers(&pool, "keep", "duplicate").await.unwrap();

        assert!(repo.get("duplicate").await.unwrap().is_none());
        assert!(repo.get("keep").await.unwrap().is_some());
        assert_eq!(
            count_where(&pool, "project_papers", "paper_id", "keep").await,
            1
        );
        assert_eq!(
            count_where(&pool, "paper_documents", "paper_id", "keep").await,
            1
        );
        assert_eq!(
            count_where(&pool, "paper_embeddings", "paper_id", "keep").await,
            1
        );
        assert_eq!(
            count_where(&pool, "evidence_items", "paper_id", "keep").await,
            1
        );
        assert_eq!(
            count_where(&pool, "paper_supplements", "paper_id", "keep").await,
            1
        );
        assert_eq!(
            count_where(&pool, "project_papers", "paper_id", "duplicate").await,
            0
        );
        std::fs::remove_dir_all(dir).ok();
    }

    async fn count_where(pool: &Pool, table: &str, column: &str, value: &str) -> i64 {
        let sql = format!("SELECT COUNT(*) FROM {table} WHERE {column} = ?1");
        sqlx::query_scalar(&sql)
            .bind(value)
            .fetch_one(pool)
            .await
            .unwrap()
    }
}
