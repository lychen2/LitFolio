use anyhow::Result;
use sqlx::Row;

use super::{Concept, ConceptRelation, PaperConcept};

pub(super) fn row_to_concept(row: &sqlx::sqlite::SqliteRow) -> Result<Concept> {
    Ok(Concept {
        id: row.try_get("id")?,
        name: row.try_get("name")?,
        description: row.try_get("description")?,
        source: row.try_get("source")?,
        created_at: row.try_get("created_at")?,
    })
}

pub(super) fn row_to_relation(row: &sqlx::sqlite::SqliteRow) -> Result<ConceptRelation> {
    Ok(ConceptRelation {
        id: row.try_get("id")?,
        source_concept_id: row.try_get("source_concept_id")?,
        target_concept_id: row.try_get("target_concept_id")?,
        relation: row.try_get("relation")?,
        evidence_paper_id: row.try_get("evidence_paper_id")?,
        snippet: row.try_get("snippet")?,
        created_at: row.try_get("created_at")?,
    })
}

pub(super) fn row_to_paper_concept(row: &sqlx::sqlite::SqliteRow) -> Result<PaperConcept> {
    Ok(PaperConcept {
        paper_id: row.try_get("paper_id")?,
        concept_id: row.try_get("concept_id")?,
        concept_name: row.try_get("concept_name")?,
        relevance: row.try_get("relevance")?,
    })
}
