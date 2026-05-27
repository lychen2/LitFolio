//! Embedding cache for paper text, used by RAG retrieval.

use anyhow::{Context, Result};
use chrono::Utc;
use sqlx::Row;

use super::db::Pool;

pub struct EmbeddingRepo<'a> {
    pool: &'a Pool,
}

impl<'a> EmbeddingRepo<'a> {
    pub fn new(pool: &'a Pool) -> Self {
        Self { pool }
    }

    /// Get a cached embedding if it exists and the content hash matches.
    pub async fn get(&self, paper_id: &str, model: &str, content_hash: &str) -> Result<Option<Vec<f32>>> {
        let row = sqlx::query(
            "SELECT embedding FROM paper_embeddings WHERE paper_id = ?1 AND model = ?2 AND content_hash = ?3",
        )
        .bind(paper_id)
        .bind(model)
        .bind(content_hash)
        .fetch_optional(self.pool)
        .await
        .context("get embedding")?;

        Ok(row.map(|r| {
            let blob: Vec<u8> = r.try_get("embedding").unwrap_or_default();
            bytes_to_f32_vec(&blob)
        }))
    }

    /// Store an embedding.
    pub async fn set(&self, paper_id: &str, model: &str, content_hash: &str, embedding: &[f32]) -> Result<()> {
        let now = Utc::now().timestamp();
        let blob = f32_vec_to_bytes(embedding);
        sqlx::query(
            "INSERT OR REPLACE INTO paper_embeddings (paper_id, model, embedding, content_hash, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5)",
        )
        .bind(paper_id)
        .bind(model)
        .bind(blob)
        .bind(content_hash)
        .bind(now)
        .execute(self.pool)
        .await
        .context("set embedding")?;
        Ok(())
    }

    /// Delete embeddings for a paper.
    pub async fn delete_for_paper(&self, paper_id: &str) -> Result<()> {
        sqlx::query("DELETE FROM paper_embeddings WHERE paper_id = ?1")
            .bind(paper_id)
            .execute(self.pool)
            .await
            .context("delete embeddings")?;
        Ok(())
    }

    /// Count cached embeddings for a model.
    pub async fn count(&self, model: &str) -> Result<i64> {
        let row = sqlx::query("SELECT COUNT(*) as cnt FROM paper_embeddings WHERE model = ?1")
            .bind(model)
            .fetch_one(self.pool)
            .await
            .context("count embeddings")?;
        Ok(row.try_get::<i64, _>("cnt").unwrap_or(0))
    }
}

fn f32_vec_to_bytes(v: &[f32]) -> Vec<u8> {
    let mut bytes = Vec::with_capacity(v.len() * 4);
    for f in v {
        bytes.extend_from_slice(&f.to_le_bytes());
    }
    bytes
}

fn bytes_to_f32_vec(b: &[u8]) -> Vec<f32> {
    b.chunks_exact(4)
        .map(|c| f32::from_le_bytes([c[0], c[1], c[2], c[3]]))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn f32_roundtrip() {
        let original: Vec<f32> = vec![1.0, -0.5, 3.14, 0.0];
        let bytes = f32_vec_to_bytes(&original);
        let restored = bytes_to_f32_vec(&bytes);
        assert_eq!(original.len(), restored.len());
        for (a, b) in original.iter().zip(restored.iter()) {
            assert!((a - b).abs() < 1e-6);
        }
    }
}
