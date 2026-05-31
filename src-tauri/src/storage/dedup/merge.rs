use anyhow::{Context, Result};

use super::Pool;

/// Merge `merge_id` into `keep_id`: transfer highlights, notes, tags, folders,
/// terms, links, and queue entries. Then delete `merge_id`.
pub async fn merge_papers(pool: &Pool, keep_id: &str, merge_id: &str) -> Result<()> {
    let mut tx = pool.begin().await.context("begin merge tx")?;

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

    merge_folder_links(&mut tx, keep_id, merge_id).await?;
    merge_terms_and_notes(&mut tx, keep_id, merge_id).await?;
    merge_graph_links(&mut tx, keep_id, merge_id).await?;
    merge_queue(&mut tx, keep_id, merge_id).await?;
    merge_metadata(&mut tx, keep_id, merge_id).await?;

    sqlx::query("DELETE FROM papers WHERE id = ?1")
        .bind(merge_id)
        .execute(&mut *tx)
        .await
        .context("delete merged paper")?;

    tx.commit().await.context("commit merge")?;
    Ok(())
}

async fn merge_folder_links(
    tx: &mut sqlx::Transaction<'_, sqlx::Sqlite>,
    keep_id: &str,
    merge_id: &str,
) -> Result<()> {
    sqlx::query(
        "INSERT OR IGNORE INTO paper_folders (paper_id, folder_id)
         SELECT ?1, folder_id FROM paper_folders WHERE paper_id = ?2",
    )
    .bind(keep_id)
    .bind(merge_id)
    .execute(&mut **tx)
    .await
    .context("merge folders")?;
    sqlx::query("DELETE FROM paper_folders WHERE paper_id = ?1")
        .bind(merge_id)
        .execute(&mut **tx)
        .await
        .context("clean merge folders")?;
    Ok(())
}

async fn merge_terms_and_notes(
    tx: &mut sqlx::Transaction<'_, sqlx::Sqlite>,
    keep_id: &str,
    merge_id: &str,
) -> Result<()> {
    sqlx::query(
        "UPDATE paper_terms SET paper_id = ?1
         WHERE paper_id = ?2
           AND term NOT IN (SELECT term FROM paper_terms WHERE paper_id = ?1)",
    )
    .bind(keep_id)
    .bind(merge_id)
    .execute(&mut **tx)
    .await
    .context("merge terms")?;
    sqlx::query(
        "UPDATE paper_note_sections SET paper_id = ?1
         WHERE paper_id = ?2
           AND id NOT IN (SELECT id FROM paper_note_sections WHERE paper_id = ?1)",
    )
    .bind(keep_id)
    .bind(merge_id)
    .execute(&mut **tx)
    .await
    .context("merge note sections")?;
    Ok(())
}

async fn merge_graph_links(
    tx: &mut sqlx::Transaction<'_, sqlx::Sqlite>,
    keep_id: &str,
    merge_id: &str,
) -> Result<()> {
    sqlx::query("UPDATE paper_links SET source_paper_id = ?1 WHERE source_paper_id = ?2")
        .bind(keep_id)
        .bind(merge_id)
        .execute(&mut **tx)
        .await
        .context("merge links source")?;
    sqlx::query("UPDATE paper_links SET target_paper_id = ?1 WHERE target_paper_id = ?2")
        .bind(keep_id)
        .bind(merge_id)
        .execute(&mut **tx)
        .await
        .context("merge links target")?;
    Ok(())
}

async fn merge_queue(
    tx: &mut sqlx::Transaction<'_, sqlx::Sqlite>,
    keep_id: &str,
    merge_id: &str,
) -> Result<()> {
    sqlx::query(
        "DELETE FROM reading_queue
         WHERE paper_id = ?1 AND ?2 IN (SELECT paper_id FROM reading_queue)",
    )
    .bind(merge_id)
    .bind(keep_id)
    .execute(&mut **tx)
    .await
    .context("merge queue")?;
    sqlx::query("UPDATE reading_queue SET paper_id = ?1 WHERE paper_id = ?2")
        .bind(keep_id)
        .bind(merge_id)
        .execute(&mut **tx)
        .await
        .context("merge queue update")?;
    Ok(())
}

async fn merge_metadata(
    tx: &mut sqlx::Transaction<'_, sqlx::Sqlite>,
    keep_id: &str,
    merge_id: &str,
) -> Result<()> {
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
    .execute(&mut **tx)
    .await
    .context("merge metadata")?;
    Ok(())
}
