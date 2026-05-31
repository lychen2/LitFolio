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
                "SELECT id, title, authors_json, year, venue, doi, arxiv_id, abstract_text,
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
                "SELECT id, title, authors_json, year, venue, doi, arxiv_id, abstract_text,
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
            "SELECT id, title, authors_json, year, venue, doi, arxiv_id, abstract_text,
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
        "SELECT id, title, authors_json, year, venue, doi, arxiv_id, abstract_text,
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
