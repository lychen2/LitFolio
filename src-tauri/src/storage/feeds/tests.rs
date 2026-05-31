use super::defaults::find_feed_id_by_url;
use super::*;
use crate::storage::db::{open_pool, run_migrations};
use std::path::PathBuf;

async fn temp() -> (Pool, PathBuf) {
    let dir = std::env::temp_dir().join(format!("litera-feeds-{}", ulid::Ulid::new()));
    std::fs::create_dir_all(&dir).unwrap();
    let pool = open_pool(&dir.join("db.sqlite")).await.unwrap();
    run_migrations(&pool).await.unwrap();
    (pool, dir)
}

#[tokio::test]
async fn create_list_upsert_roundtrip() {
    let (pool, dir) = temp().await;
    let repo = FeedRepo::new(&pool);
    let feed = repo
        .create("https://example.com/feed", "Example", Some("desc"))
        .await
        .unwrap();
    let items = vec![
        NewFeedItem {
            entry_id: "a".into(),
            title: "First".into(),
            link: Some("https://example.com/a".into()),
            summary: None,
            authors: vec!["Alice".into()],
            published_at: Some(1700000000),
        },
        NewFeedItem {
            entry_id: "b".into(),
            title: "Second".into(),
            link: None,
            summary: Some("body".into()),
            authors: vec![],
            published_at: None,
        },
    ];
    let n = repo.upsert_items(feed.id, &items).await.unwrap();
    assert_eq!(n, 2);
    let n2 = repo.upsert_items(feed.id, &items).await.unwrap();
    assert_eq!(n2, 0);

    let listed = repo.list().await.unwrap();
    assert_eq!(listed.len(), 1);
    assert_eq!(listed[0].total_items, 2);
    assert_eq!(listed[0].unread_items, 2);

    let entries = repo.list_items(Some(feed.id), false, 10, 0).await.unwrap();
    assert_eq!(entries.len(), 2);
    assert_eq!(entries[0].title, "Second");
    assert_eq!(entries[1].title, "First");

    let fetched = repo.get_item(&entries[1].id).await.unwrap().unwrap();
    assert_eq!(fetched.entry_id, "a");
    assert_eq!(fetched.link.as_deref(), Some("https://example.com/a"));
    assert!(fetched.summary.as_deref().unwrap_or_default().is_empty());
    assert_eq!(fetched.authors, vec!["Alice"]);

    repo.set_item_seen(&entries[1].id, true).await.unwrap();
    let unread = repo.list_items(Some(feed.id), true, 10, 0).await.unwrap();
    assert_eq!(unread.len(), 1);
    assert_eq!(unread[0].title, "Second");

    std::fs::remove_dir_all(&dir).ok();
}

#[tokio::test]
async fn repair_default_urls_repoints_legacy_optica_feeds() {
    let (pool, dir) = temp().await;
    let repo = FeedRepo::new(&pool);
    let legacy_url = "https://opg.optica.org/optica/rss.cfm";
    let current_url = "https://opg.optica.org/rss/optica_feed.xml";

    let feed = repo.create(legacy_url, "Optica", None).await.unwrap();
    let items = vec![NewFeedItem {
        entry_id: "optica-1".into(),
        title: "Newest article".into(),
        link: Some("https://example.com/optica-1".into()),
        summary: None,
        authors: vec![],
        published_at: Some(1_700_000_001),
    }];
    repo.upsert_items(feed.id, &items).await.unwrap();

    let repaired = repo.repair_default_feed_urls().await.unwrap();
    assert_eq!(repaired, 1);

    let feeds = repo.list().await.unwrap();
    assert_eq!(feeds.len(), 1);
    assert_eq!(feeds[0].feed.url, current_url);
    assert_eq!(feeds[0].total_items, 1);

    let legacy_id = find_feed_id_by_url(&pool, legacy_url).await.unwrap();
    let current_id = find_feed_id_by_url(&pool, current_url).await.unwrap();
    assert!(legacy_id.is_none());
    assert!(current_id.is_some());

    std::fs::remove_dir_all(&dir).ok();
}
