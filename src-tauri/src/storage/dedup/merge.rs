use anyhow::{Context, Result};

use super::Pool;

/// Merge `merge_id` into `keep_id`: transfer paper-owned data and references.
/// Then delete `merge_id`.
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
    merge_projects_and_evidence(&mut tx, keep_id, merge_id).await?;
    merge_documents_and_embeddings(&mut tx, keep_id, merge_id).await?;
    merge_discovery_and_jobs(&mut tx, keep_id, merge_id).await?;
    merge_supplements(&mut tx, keep_id, merge_id).await?;
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

async fn merge_projects_and_evidence(
    tx: &mut sqlx::Transaction<'_, sqlx::Sqlite>,
    keep_id: &str,
    merge_id: &str,
) -> Result<()> {
    sqlx::query(
        "INSERT OR IGNORE INTO project_papers (project_id, paper_id, added_at)
         SELECT project_id, ?1, added_at FROM project_papers WHERE paper_id = ?2",
    )
    .bind(keep_id)
    .bind(merge_id)
    .execute(&mut **tx)
    .await
    .context("merge project papers")?;
    sqlx::query("DELETE FROM project_papers WHERE paper_id = ?1")
        .bind(merge_id)
        .execute(&mut **tx)
        .await
        .context("clean project papers")?;
    sqlx::query("UPDATE evidence_items SET paper_id = ?1 WHERE paper_id = ?2")
        .bind(keep_id)
        .bind(merge_id)
        .execute(&mut **tx)
        .await
        .context("merge evidence paper refs")?;
    sqlx::query("UPDATE concept_relations SET evidence_paper_id = ?1 WHERE evidence_paper_id = ?2")
        .bind(keep_id)
        .bind(merge_id)
        .execute(&mut **tx)
        .await
        .context("merge concept evidence refs")?;
    Ok(())
}

async fn merge_documents_and_embeddings(
    tx: &mut sqlx::Transaction<'_, sqlx::Sqlite>,
    keep_id: &str,
    merge_id: &str,
) -> Result<()> {
    sqlx::query(
        "INSERT OR IGNORE INTO paper_documents (paper_id, markdown, updated_at, index_status, index_error, indexed_at)
         SELECT ?1, markdown, updated_at, index_status, index_error, indexed_at
         FROM paper_documents WHERE paper_id = ?2",
    )
    .bind(keep_id)
    .bind(merge_id)
    .execute(&mut **tx)
    .await
    .context("merge paper document")?;
    sqlx::query("DELETE FROM paper_documents WHERE paper_id = ?1")
        .bind(merge_id)
        .execute(&mut **tx)
        .await
        .context("clean paper document")?;
    sqlx::query(
        "INSERT OR IGNORE INTO paper_embeddings (paper_id, model, embedding, content_hash, created_at)
         SELECT ?1, model, embedding, content_hash, created_at FROM paper_embeddings WHERE paper_id = ?2",
    )
    .bind(keep_id)
    .bind(merge_id)
    .execute(&mut **tx)
    .await
    .context("merge embeddings")?;
    sqlx::query("DELETE FROM paper_embeddings WHERE paper_id = ?1")
        .bind(merge_id)
        .execute(&mut **tx)
        .await
        .context("clean embeddings")?;
    Ok(())
}

async fn merge_discovery_and_jobs(
    tx: &mut sqlx::Transaction<'_, sqlx::Sqlite>,
    keep_id: &str,
    merge_id: &str,
) -> Result<()> {
    sqlx::query("UPDATE ai_jobs SET paper_id = ?1 WHERE paper_id = ?2")
        .bind(keep_id)
        .bind(merge_id)
        .execute(&mut **tx)
        .await
        .context("merge ai jobs")?;
    sqlx::query("UPDATE feed_items SET imported_paper_id = ?1 WHERE imported_paper_id = ?2")
        .bind(keep_id)
        .bind(merge_id)
        .execute(&mut **tx)
        .await
        .context("merge feed imported paper refs")?;
    sqlx::query("DELETE FROM recommendation_cache WHERE paper_id = ?1 AND ?2 IN (SELECT paper_id FROM recommendation_cache)")
        .bind(merge_id)
        .bind(keep_id)
        .execute(&mut **tx)
        .await
        .context("merge recommendation cache conflict")?;
    sqlx::query("UPDATE recommendation_cache SET paper_id = ?1 WHERE paper_id = ?2")
        .bind(keep_id)
        .bind(merge_id)
        .execute(&mut **tx)
        .await
        .context("merge recommendation cache")?;
    sqlx::query(
        "INSERT OR IGNORE INTO paper_citations (paper_id, cited_paper_id, cited_title, cited_authors, cited_year, cited_venue, cited_doi, direction, fetched_at)
         SELECT ?1, cited_paper_id, cited_title, cited_authors, cited_year, cited_venue, cited_doi, direction, fetched_at
         FROM paper_citations WHERE paper_id = ?2",
    )
    .bind(keep_id)
    .bind(merge_id)
    .execute(&mut **tx)
    .await
    .context("merge citations")?;
    sqlx::query("DELETE FROM paper_citations WHERE paper_id = ?1")
        .bind(merge_id)
        .execute(&mut **tx)
        .await
        .context("clean citations")?;
    Ok(())
}

async fn merge_supplements(
    tx: &mut sqlx::Transaction<'_, sqlx::Sqlite>,
    keep_id: &str,
    merge_id: &str,
) -> Result<()> {
    sqlx::query("UPDATE paper_supplements SET paper_id = ?1 WHERE paper_id = ?2")
        .bind(keep_id)
        .bind(merge_id)
        .execute(&mut **tx)
        .await
        .context("merge supplements")?;
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
            abstract = COALESCE(abstract, (SELECT abstract FROM papers WHERE id = ?2)),
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
