//! Paper deduplication: find and merge duplicate papers.

use std::collections::{HashMap, HashSet};

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use sqlx::Row;

use super::db::Pool;
use super::papers::row_to_paper;
use super::Paper;

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

fn check_duplicate_reason(a: &Paper, b: &Paper) -> Option<String> {
    // DOI match
    if let (Some(ref doi_a), Some(ref doi_b)) = (&a.doi, &b.doi) {
        if !doi_a.trim().is_empty() && doi_a.trim().to_lowercase() == doi_b.trim().to_lowercase() {
            return Some("doi_match".into());
        }
    }
    // arXiv ID match
    if let (Some(ref arx_a), Some(ref arx_b)) = (&a.arxiv_id, &b.arxiv_id) {
        if !arx_a.trim().is_empty() && arx_a.trim().to_lowercase() == arx_b.trim().to_lowercase() {
            return Some("arxiv_match".into());
        }
    }
    // Title similarity
    let norm_a = normalize_title(&a.title);
    let norm_b = normalize_title(&b.title);
    if norm_a.len() >= 5 && norm_b.len() >= 5 {
        let dist = levenshtein(&norm_a, &norm_b);
        let max_len = norm_a.len().max(norm_b.len()) as f64;
        if max_len > 0.0 && (dist as f64 / max_len) < 0.15 {
            return Some("title_similar".into());
        }
    }
    None
}

/// Merge `merge_id` into `keep_id`: transfer highlights, notes, tags, folders, terms, links.
/// Then delete `merge_id`.
pub async fn merge_papers(pool: &Pool, keep_id: &str, merge_id: &str) -> Result<()> {
    let mut tx = pool.begin().await.context("begin merge tx")?;

    // Transfer highlights (skip if highlight already exists on keep_id with same rect)
    sqlx::query(
        "UPDATE highlights SET paper_id = ?1
         WHERE paper_id = ?2
           AND id NOT IN (SELECT id FROM highlights WHERE paper_id = ?1)",
    )
    .bind(keep_id)
    .bind(merge_id)
    .execute(&mut *tx)
    .await
    .context("merge highlights")?;

    // Transfer tags
    sqlx::query(
        "INSERT OR IGNORE INTO paper_tags (paper_id, tag_id)
         SELECT ?1, tag_id FROM paper_tags WHERE paper_id = ?2",
    )
    .bind(keep_id)
    .bind(merge_id)
    .execute(&mut *tx)
    .await
    .context("merge tags")?;
    sqlx::query("DELETE FROM paper_tags WHERE paper_id = ?1")
        .bind(merge_id)
        .execute(&mut *tx)
        .await
        .context("clean merge tags")?;

    // Transfer folders
    sqlx::query(
        "INSERT OR IGNORE INTO paper_folders (paper_id, folder_id)
         SELECT ?1, folder_id FROM paper_folders WHERE paper_id = ?2",
    )
    .bind(keep_id)
    .bind(merge_id)
    .execute(&mut *tx)
    .await
    .context("merge folders")?;
    sqlx::query("DELETE FROM paper_folders WHERE paper_id = ?1")
        .bind(merge_id)
        .execute(&mut *tx)
        .await
        .context("clean merge folders")?;

    // Transfer terms
    sqlx::query(
        "UPDATE paper_terms SET paper_id = ?1
         WHERE paper_id = ?2
           AND term NOT IN (SELECT term FROM paper_terms WHERE paper_id = ?1)",
    )
    .bind(keep_id)
    .bind(merge_id)
    .execute(&mut *tx)
    .await
    .context("merge terms")?;

    // Transfer note sections
    sqlx::query(
        "UPDATE paper_note_sections SET paper_id = ?1
         WHERE paper_id = ?2
           AND id NOT IN (SELECT id FROM paper_note_sections WHERE paper_id = ?1)",
    )
    .bind(keep_id)
    .bind(merge_id)
    .execute(&mut *tx)
    .await
    .context("merge note sections")?;

    // Transfer paper links
    sqlx::query("UPDATE paper_links SET source_paper_id = ?1 WHERE source_paper_id = ?2")
        .bind(keep_id)
        .bind(merge_id)
        .execute(&mut *tx)
        .await
        .context("merge links source")?;
    sqlx::query("UPDATE paper_links SET target_paper_id = ?1 WHERE target_paper_id = ?2")
        .bind(keep_id)
        .bind(merge_id)
        .execute(&mut *tx)
        .await
        .context("merge links target")?;

    // Transfer queue entry
    sqlx::query("DELETE FROM reading_queue WHERE paper_id = ?1 AND ?2 IN (SELECT paper_id FROM reading_queue)")
        .bind(merge_id)
        .bind(keep_id)
        .execute(&mut *tx)
        .await
        .context("merge queue")?;
    sqlx::query("UPDATE reading_queue SET paper_id = ?1 WHERE paper_id = ?2")
        .bind(keep_id)
        .bind(merge_id)
        .execute(&mut *tx)
        .await
        .context("merge queue update")?;

    // Merge missing metadata fields from merge_id into keep_id
    sqlx::query(
        "UPDATE papers SET
            doi = COALESCE(doi, (SELECT doi FROM papers WHERE id = ?2)),
            arxiv_id = COALESCE(arxiv_id, (SELECT arxiv_id FROM papers WHERE id = ?2)),
            venue = COALESCE(venue, (SELECT venue FROM papers WHERE id = ?2)),
            abstract_text = COALESCE(abstract_text, (SELECT abstract_text FROM papers WHERE id = ?2)),
            pdf_path = COALESCE(pdf_path, (SELECT pdf_path FROM papers WHERE id = ?2)),
            tldr = COALESCE(tldr, (SELECT tldr FROM papers WHERE id = ?2)),
            bibtex = COALESCE(bibtex, (SELECT bibtex FROM papers WHERE id = ?2))
         WHERE id = ?1",
    )
    .bind(keep_id)
    .bind(merge_id)
    .execute(&mut *tx)
    .await
    .context("merge metadata")?;

    // Delete the merged paper (cascades to remaining join tables)
    sqlx::query("DELETE FROM papers WHERE id = ?1")
        .bind(merge_id)
        .execute(&mut *tx)
        .await
        .context("delete merged paper")?;

    tx.commit().await.context("commit merge")?;
    Ok(())
}

/// Normalize a title for comparison: lowercase, strip non-alphanumeric, collapse spaces.
fn normalize_title(title: &str) -> String {
    let lower = title.to_lowercase();
    let cleaned: String = lower
        .chars()
        .map(|c| if c.is_alphanumeric() { c } else { ' ' })
        .collect();
    let mut result = String::new();
    let mut prev_space = true;
    for c in cleaned.chars() {
        if c == ' ' {
            if !prev_space {
                result.push(c);
            }
            prev_space = true;
        } else {
            result.push(c);
            prev_space = false;
        }
    }
    result.trim().to_string()
}

/// Standard Levenshtein distance.
fn levenshtein(a: &str, b: &str) -> usize {
    let a_chars: Vec<char> = a.chars().collect();
    let b_chars: Vec<char> = b.chars().collect();
    let n = a_chars.len();
    let m = b_chars.len();

    if n == 0 {
        return m;
    }
    if m == 0 {
        return n;
    }

    let mut prev = (0..=m).collect::<Vec<_>>();
    let mut curr = vec![0usize; m + 1];

    for i in 1..=n {
        curr[0] = i;
        for j in 1..=m {
            let cost = if a_chars[i - 1] == b_chars[j - 1] {
                0
            } else {
                1
            };
            curr[j] = (prev[j] + 1).min(curr[j - 1] + 1).min(prev[j - 1] + cost);
        }
        std::mem::swap(&mut prev, &mut curr);
    }
    prev[m]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn levenshtein_basic() {
        assert_eq!(levenshtein("kitten", "sitting"), 3);
        assert_eq!(levenshtein("", "abc"), 3);
        assert_eq!(levenshtein("abc", "abc"), 0);
    }

    #[test]
    fn normalize_title_strips_punctuation() {
        assert_eq!(
            normalize_title("Attention Is All You Need!"),
            "attention is all you need"
        );
        assert_eq!(
            normalize_title("BERT: Pre-training of Deep Bidirectional Transformers"),
            "bert pre training of deep bidirectional transformers"
        );
    }

    #[test]
    fn title_similarity_detects_variants() {
        let a = normalize_title("Attention Is All You Need");
        let b = normalize_title("Attention is all you need");
        let dist = levenshtein(&a, &b);
        assert_eq!(dist, 0);

        // Minor punctuation difference should be very close
        let c = normalize_title("Attention Is All You Need:");
        let dist2 = levenshtein(&a, &c);
        let max_len = a.len().max(c.len()) as f64;
        assert!((dist2 as f64 / max_len) < 0.15);

        // Case-only difference is 0 distance after normalization
        let d = normalize_title("attention is all you need");
        assert_eq!(levenshtein(&a, &d), 0);
    }
}
