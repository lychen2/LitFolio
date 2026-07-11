use super::*;
use crate::storage::db::{open_pool, run_migrations};
use crate::storage::models::ReadStatus;
use crate::storage::PaperDocumentRepo;
use chrono::Utc;
use std::path::PathBuf;

async fn temp_pool() -> (Pool, PathBuf) {
    let dir = std::env::temp_dir().join(format!("litera-paper-{}", ulid::Ulid::new()));
    std::fs::create_dir_all(&dir).unwrap();
    let db = dir.join("library.db");
    let pool = open_pool(&db).await.unwrap();
    run_migrations(&pool).await.unwrap();
    (pool, dir)
}

fn sample(id: &str) -> Paper {
    let now = Utc::now().timestamp();
    Paper {
        id: id.into(),
        title: "Attention Is All You Need".into(),
        authors: vec!["Vaswani et al.".into()],
        year: Some(2017),
        venue: Some("NeurIPS".into()),
        doi: Some(format!("10.1234/{id}")),
        arxiv_id: Some(format!("1706.{id}")),
        abstract_text: Some("seq2seq with attention".into()),
        pdf_path: Some(format!("/tmp/test-{id}.pdf")),
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

async fn seed_fifty_papers(repo: &PaperRepo<'_>) {
    for idx in 0..50 {
        let mut paper = sample(&format!("fixture-{idx:02}"));
        paper.title = format!("Neural Retrieval Fixture {idx:02}");
        paper.authors = vec![format!("Author {idx:02}"), "Fixture Builder".into()];
        paper.year = Some(2000 + (idx % 25));
        paper.abstract_text = Some(format!(
            "This abstract discusses neural retrieval and quantum-abstract-{idx:02}."
        ));
        paper.read_status = match idx % 4 {
            0 => ReadStatus::Unread,
            1 => ReadStatus::Reading,
            2 => ReadStatus::Read,
            _ => ReadStatus::Must,
        };
        repo.insert(&paper).await.unwrap();
    }
}

#[tokio::test]
async fn insert_get_list_count_roundtrip() {
    let (pool, dir) = temp_pool().await;
    let repo = PaperRepo::new(&pool);
    repo.insert(&sample("A")).await.unwrap();
    repo.insert(&sample("B")).await.unwrap();
    assert_eq!(repo.count().await.unwrap(), 2);
    let fetched = repo.get("A").await.unwrap().unwrap();
    assert_eq!(fetched.title, "Attention Is All You Need");
    let recent = repo.list_recent(10).await.unwrap();
    assert_eq!(recent.len(), 2);
    repo.set_read_status("A", ReadStatus::Read).await.unwrap();
    let updated = repo.get("A").await.unwrap().unwrap();
    assert_eq!(updated.read_status, ReadStatus::Read);
    repo.delete("B").await.unwrap();
    assert_eq!(repo.count().await.unwrap(), 1);
    std::fs::remove_dir_all(&dir).ok();
}

#[tokio::test]
async fn update_quick_read_persists_all_four() {
    let (pool, dir) = temp_pool().await;
    let repo = PaperRepo::new(&pool);
    repo.insert(&sample("Q")).await.unwrap();
    repo.update_quick_read("Q", "P", "M", "C", "L")
        .await
        .unwrap();
    let p = repo.get("Q").await.unwrap().unwrap();
    assert_eq!(p.research_question.as_deref(), Some("P"));
    assert_eq!(p.method.as_deref(), Some("M"));
    assert_eq!(p.comparison.as_deref(), Some("C"));
    assert_eq!(p.limitations.as_deref(), Some("L"));
    std::fs::remove_dir_all(&dir).ok();
}

#[tokio::test]
async fn search_finds_inserted_paper() {
    let (pool, dir) = temp_pool().await;
    let repo = PaperRepo::new(&pool);
    let mut p = sample("S");
    p.title = "Diffusion Models for Image Synthesis".into();
    p.abstract_text = Some("we train denoising networks".into());
    repo.insert(&p).await.unwrap();
    let hits = repo.search("diffusion", 10).await.unwrap();
    assert_eq!(hits.len(), 1);
    let hits = repo.search("denoising image", 10).await.unwrap();
    assert_eq!(hits.len(), 1);
    let hits = repo.search("zzz_no_match", 10).await.unwrap();
    assert!(hits.is_empty());
    std::fs::remove_dir_all(&dir).ok();
}

#[tokio::test]
async fn search_or_recovers_single_token_match_when_strict_and_misses() {
    let (pool, dir) = temp_pool().await;
    let repo = PaperRepo::new(&pool);
    let mut p = sample("HYBRID");
    p.title = "Hybrid Retrieval for Local Literature QA".into();
    p.abstract_text = Some("rank fusion improves recall".into());
    repo.insert(&p).await.unwrap();

    let strict_hits = repo.search("hybrid nonexistenttoken", 10).await.unwrap();
    assert!(strict_hits.is_empty());

    let or_hits = repo.search_or("hybrid nonexistenttoken", 10).await.unwrap();
    assert_eq!(or_hits[0].id, p.id);
    std::fs::remove_dir_all(&dir).ok();
}

#[tokio::test]
async fn search_finds_imported_document_markdown() {
    let (pool, dir) = temp_pool().await;
    let repo = PaperRepo::new(&pool);
    let mut p = sample("D");
    p.title = "Unrelated Metadata".into();
    p.abstract_text = Some("generic abstract".into());
    repo.insert(&p).await.unwrap();
    PaperDocumentRepo::new(&pool)
        .upsert_markdown(
            &p.id,
            "## Experiments\nThe paper studies retrieval augmented generation with reranking.",
        )
        .await
        .unwrap();

    let hits = repo.search("reranking", 10).await.unwrap();
    assert_eq!(hits.len(), 1);
    assert_eq!(hits[0].id, p.id);
    std::fs::remove_dir_all(&dir).ok();
}

#[tokio::test]
async fn fifty_paper_fixture_seeds_searchable_library() {
    let (pool, dir) = temp_pool().await;
    let repo = PaperRepo::new(&pool);
    seed_fifty_papers(&repo).await;

    assert_eq!(repo.count().await.unwrap(), 50);
    assert_eq!(repo.search("neural", 100).await.unwrap().len(), 50);
    assert_eq!(
        repo.search("Author 17", 10).await.unwrap()[0].id,
        "fixture-17"
    );
    assert_eq!(
        repo.search("quantum-abstract-23", 10).await.unwrap()[0].id,
        "fixture-23"
    );
    std::fs::remove_dir_all(&dir).ok();
}

#[tokio::test]
async fn fifty_paper_fixture_document_markdown_is_searchable() {
    let (pool, dir) = temp_pool().await;
    let repo = PaperRepo::new(&pool);
    seed_fifty_papers(&repo).await;
    PaperDocumentRepo::new(&pool)
        .upsert_markdown(
            "fixture-07",
            "Notebook section mentions spectral-reranker-seven.",
        )
        .await
        .unwrap();

    let hits = repo.search("spectral-reranker-seven", 10).await.unwrap();

    assert_eq!(hits.len(), 1);
    assert_eq!(hits[0].id, "fixture-07");
    std::fs::remove_dir_all(&dir).ok();
}

#[tokio::test]
async fn paper_document_index_status_tracks_success_and_failure() {
    let (pool, dir) = temp_pool().await;
    let repo = PaperRepo::new(&pool);
    let success = sample("INDEX_OK");
    let failure = sample("INDEX_FAIL");
    repo.insert(&success).await.unwrap();
    repo.insert(&failure).await.unwrap();

    let docs = PaperDocumentRepo::new(&pool);
    docs.upsert_markdown(&success.id, "indexed body text")
        .await
        .unwrap();
    docs.mark_index_failed(&failure.id, "pdf parse failed")
        .await
        .unwrap();

    let ids = vec![success.id.clone(), failure.id.clone()];
    let statuses = docs.index_status_for_papers(&ids).await.unwrap();
    let ok = statuses.get(&success.id).unwrap();
    assert_eq!(ok.status, "indexed");
    assert!(ok.error.is_none());
    assert!(ok.indexed_at.is_some());

    let failed = statuses.get(&failure.id).unwrap();
    assert_eq!(failed.status, "failed");
    assert_eq!(failed.error.as_deref(), Some("pdf parse failed"));
    assert!(failed.indexed_at.is_some());
    std::fs::remove_dir_all(&dir).ok();
}

#[tokio::test]
async fn update_translation_roundtrip() {
    let (pool, dir) = temp_pool().await;
    let repo = PaperRepo::new(&pool);
    repo.insert(&sample("T")).await.unwrap();
    repo.update_translation("T", "标题", "摘要内容", "Chinese")
        .await
        .unwrap();
    let p = repo.get("T").await.unwrap().unwrap();
    assert_eq!(p.title_translated.as_deref(), Some("标题"));
    assert_eq!(p.abstract_translated.as_deref(), Some("摘要内容"));
    assert_eq!(p.translate_target_lang.as_deref(), Some("Chinese"));
    assert!(p.translated_at.is_some());
    std::fs::remove_dir_all(&dir).ok();
}

#[tokio::test]
async fn update_pdf_path_swaps_path_and_rejects_empty_or_missing() {
    let (pool, dir) = temp_pool().await;
    let repo = PaperRepo::new(&pool);
    repo.insert(&sample("P")).await.unwrap();
    repo.update_pdf_path("P", "/tmp/new-location.pdf")
        .await
        .unwrap();
    let p = repo.get("P").await.unwrap().unwrap();
    assert_eq!(p.pdf_path.as_deref(), Some("/tmp/new-location.pdf"));

    assert!(repo.update_pdf_path("P", "").await.is_err());
    assert!(repo
        .update_pdf_path("does-not-exist", "/tmp/x.pdf")
        .await
        .is_err());
    std::fs::remove_dir_all(&dir).ok();
}
