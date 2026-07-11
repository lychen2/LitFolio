use super::*;
use crate::storage::db::{open_pool, run_migrations};
use crate::storage::models::{Paper, ReadStatus};
use crate::storage::papers::PaperRepo;
use std::path::PathBuf;

async fn temp_pool() -> (Pool, PathBuf) {
    let dir = std::env::temp_dir().join(format!("litera-hl-{}", Ulid::new()));
    std::fs::create_dir_all(&dir).unwrap();
    let pool = open_pool(&dir.join("library.db")).await.unwrap();
    run_migrations(&pool).await.unwrap();
    (pool, dir)
}

async fn seed_paper(pool: &Pool, id: &str) {
    let now = Utc::now().timestamp();
    let p = Paper {
        id: id.into(),
        title: "T".into(),
        authors: vec![],
        year: None,
        venue: None,
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
    };
    PaperRepo::new(pool).insert(&p).await.unwrap();
}

#[tokio::test]
async fn insert_list_update_delete_roundtrip() {
    let (pool, dir) = temp_pool().await;
    seed_paper(&pool, "A").await;
    let repo = HighlightRepo::new(&pool);
    let rect = serde_json::json!({"x":10,"y":20,"w":100,"h":15});
    let h1 = repo
        .insert("A", 1, &rect, "hello world", None, None)
        .await
        .unwrap();
    let h2 = repo
        .insert("A", 2, &rect, "second hl", Some("green"), Some("method"))
        .await
        .unwrap();
    let list = repo.list_by_paper("A").await.unwrap();
    assert_eq!(list.len(), 2);
    assert_eq!(list[0].page, 1);
    assert_eq!(list[0].color, "yellow");
    assert_eq!(list[1].color, "green");

    repo.update_note(&h1.id, Some("important")).await.unwrap();
    let list = repo.list_by_paper("A").await.unwrap();
    assert_eq!(list[0].note.as_deref(), Some("important"));

    repo.update_note(&h1.id, None).await.unwrap();
    let list = repo.list_by_paper("A").await.unwrap();
    assert!(list[0].note.is_none());

    let moved_rect = serde_json::json!({
        "pageNumber": 1,
        "boundingRect": {"x1": 32, "y1": 48, "x2": 232, "y2": 138, "width": 612, "height": 792},
        "rects": [{"x1": 32, "y1": 48, "x2": 232, "y2": 138, "width": 612, "height": 792, "pageNumber": 1}]
    });
    repo.update_rect(&h1.id, &moved_rect).await.unwrap();
    let moved = repo.get(&h1.id).await.unwrap().unwrap();
    assert_eq!(moved.rect, moved_rect);


    repo.update_translation(
        &h1.id,
        &HighlightTranslationUpdate {
            text: "你好",
            target_lang: "Chinese",
            model: "test-model",
            translated_at: 42,
        },
    )
    .await
    .unwrap();
    let translated = repo.get(&h1.id).await.unwrap().unwrap();
    assert_eq!(translated.translation_text.as_deref(), Some("你好"));
    assert_eq!(
        translated.translation_target_lang.as_deref(),
        Some("Chinese")
    );
    assert_eq!(translated.translation_model.as_deref(), Some("test-model"));
    assert_eq!(translated.translated_at, Some(42));

    repo.update_summary(
        &h1.id,
        &HighlightSummaryUpdate {
            text: "一句话总结",
            model: "summary-model",
            summarized_at: 99,
        },
    )
    .await
    .unwrap();
    let summarized = repo.get(&h1.id).await.unwrap().unwrap();
    assert_eq!(summarized.summary_text.as_deref(), Some("一句话总结"));
    assert_eq!(summarized.summary_model.as_deref(), Some("summary-model"));
    assert_eq!(summarized.summarized_at, Some(99));

    repo.delete(&h2.id).await.unwrap();
    assert_eq!(repo.list_by_paper("A").await.unwrap().len(), 1);

    assert!(repo.update_note("nonexistent", Some("x")).await.is_err());
    assert!(repo
        .update_translation(
            "nonexistent",
            &HighlightTranslationUpdate {
                text: "x",
                target_lang: "Chinese",
                model: "m",
                translated_at: 1,
            },
        )
        .await
        .is_err());
    assert!(repo
        .update_summary(
            "nonexistent",
            &HighlightSummaryUpdate {
                text: "x",
                model: "m",
                summarized_at: 1,
            },
        )
        .await
        .is_err());
    std::fs::remove_dir_all(&dir).ok();
}

#[tokio::test]
async fn delete_cascades_when_paper_deleted() {
    let (pool, dir) = temp_pool().await;
    seed_paper(&pool, "P").await;
    let repo = HighlightRepo::new(&pool);
    let rect = serde_json::json!({"x":0,"y":0,"w":1,"h":1});
    repo.insert("P", 1, &rect, "x", None, None).await.unwrap();
    repo.insert("P", 1, &rect, "y", None, None).await.unwrap();
    PaperRepo::new(&pool).delete("P").await.unwrap();
    assert!(repo.list_by_paper("P").await.unwrap().is_empty());
    std::fs::remove_dir_all(&dir).ok();
}
