use anyhow::Result;
use std::sync::Arc;

use crate::bibtex;
use crate::http;
use crate::ingest;
use crate::storage::{self, default_library_root, open_pool, run_migrations, LibraryPaths, Pool};
use crate::AppState;

pub(crate) async fn bootstrap_state() -> Result<Arc<AppState>> {
    let root = default_library_root()?;
    let paths = LibraryPaths::new(root);
    paths.ensure()?;
    let pool = open_pool(&paths.db_file()).await?;
    run_migrations(&pool).await?;
    run_optional_startup_tasks(&pool, &paths).await;
    let paper_repo = storage::PaperRepo::new(&pool);
    backfill_missing_bibtex(&paper_repo).await;
    let http = http::build_api_client()?;
    let http_external = http::build_external_client()?;
    tracing::info!(root = %paths.root.display(), "library ready");
    Ok(Arc::new(AppState {
        pool,
        paths,
        http,
        http_external,
        batch_cancel: tokio::sync::Mutex::new(None),
        sync_lock: tokio::sync::Mutex::new(()),
    }))
}

async fn run_optional_startup_tasks(pool: &Pool, paths: &LibraryPaths) {
    repair_default_feeds(pool).await;
    seed_default_feeds(pool).await;
    seed_manual_pdfs_if_empty(pool, paths).await;
    migrate_legacy_pdf_text_cache(pool, paths).await;
    // PDF markdown rebuild stays lazy: imports, Ask backfill, and the PDF.js
    // reader generate document.md without making startup parse the whole library.
}

async fn repair_default_feeds(pool: &Pool) {
    let feed_repo = storage::FeedRepo::new(pool);
    match feed_repo.repair_default_feed_urls().await {
        Ok(repaired) if repaired > 0 => {
            tracing::info!(repaired, "repaired legacy default RSS feed urls");
        }
        Ok(_) => {}
        Err(error) => tracing::warn!(%error, "optional startup task failed: repair default feeds"),
    }
}

async fn seed_default_feeds(pool: &Pool) {
    let feed_repo = storage::FeedRepo::new(pool);
    match feed_repo.seed_defaults_if_empty().await {
        Ok(seeded) if seeded > 0 => tracing::info!(seeded, "seeded default RSS feeds"),
        Ok(_) => {}
        Err(error) => tracing::warn!(%error, "optional startup task failed: seed default feeds"),
    }
}

async fn migrate_legacy_pdf_text_cache(pool: &Pool, paths: &LibraryPaths) {
    let summary = match paths.migrate_legacy_pdf_text_cache() {
        Ok(summary) => summary,
        Err(error) => {
            tracing::warn!(%error, "optional startup task failed: migrate legacy PDF text cache");
            return;
        }
    };
    let repo = storage::PaperDocumentRepo::new(pool);
    for (paper_id, markdown) in &summary.markdown_documents {
        if let Err(error) = repo.upsert_markdown(paper_id, markdown).await {
            tracing::warn!(
                %error,
                paper_id,
                "optional startup task failed: index migrated PDF markdown"
            );
        }
    }
    if summary.converted > 0 || summary.removed_legacy > 0 {
        tracing::info!(
            converted = summary.converted,
            removed_legacy = summary.removed_legacy,
            indexed = summary.markdown_documents.len(),
            "migrated legacy PDF text cache to Markdown"
        );
    }
}

async fn seed_manual_pdfs_if_empty(pool: &Pool, paths: &LibraryPaths) {
    let paper_repo = storage::PaperRepo::new(pool);
    let paper_count = match paper_repo.list_recent(1).await {
        Ok(papers) => papers.len(),
        Err(error) => {
            tracing::warn!(%error, "optional startup task failed: check manual seed precondition");
            return;
        }
    };
    if paper_count > 0 {
        return;
    }
    let Some(resource_dir) = manual_resource_dir() else {
        return;
    };
    seed_manual_pdf(
        &paper_repo,
        paths,
        &resource_dir,
        "manual.pdf",
        "LitFolio 用户手册 (中文版)",
    )
    .await;
    seed_manual_pdf(
        &paper_repo,
        paths,
        &resource_dir,
        "manual-en.pdf",
        "LitFolio User Manual (English)",
    )
    .await;
}

fn manual_resource_dir() -> Option<std::path::PathBuf> {
    let exe = match std::env::current_exe() {
        Ok(exe) => exe,
        Err(error) => {
            tracing::warn!(%error, "optional startup task failed: locate executable for manual seed");
            return None;
        }
    };
    let exe_dir = exe.parent().unwrap_or(std::path::Path::new("."));
    Some(if cfg!(target_os = "macos") {
        exe_dir.join("../Resources")
    } else {
        exe_dir.to_path_buf()
    })
}

async fn seed_manual_pdf(
    paper_repo: &storage::PaperRepo<'_>,
    paths: &LibraryPaths,
    res_dir: &std::path::Path,
    filename: &str,
    title: &str,
) {
    let src = res_dir.join(filename);
    if !src.exists() {
        return;
    }
    let paper_id = ulid::Ulid::new().to_string();
    if let Err(error) = ingest::import_pdf_file(&src, &paper_id, paths) {
        tracing::warn!(%error, filename, paper_id, "optional startup task failed: import manual");
        return;
    }
    set_manual_metadata(paper_repo, filename, &paper_id, title).await;
    tracing::info!(filename, "seeded default manual");
}

async fn set_manual_metadata(
    paper_repo: &storage::PaperRepo<'_>,
    filename: &str,
    paper_id: &str,
    title: &str,
) {
    if let Err(error) = paper_repo
        .update_title_venue(paper_id, title, Some("LitFolio"))
        .await
    {
        tracing::warn!(%error, filename, paper_id, "optional startup task failed: set manual title");
    }
    if let Err(error) = paper_repo
        .set_read_status(paper_id, storage::ReadStatus::Read)
        .await
    {
        tracing::warn!(%error, filename, paper_id, "optional startup task failed: set manual read status");
    }
    set_manual_bibtex(paper_repo, filename, paper_id).await;
}

async fn set_manual_bibtex(paper_repo: &storage::PaperRepo<'_>, filename: &str, paper_id: &str) {
    match paper_repo.get(paper_id).await {
        Ok(Some(p)) => {
            let bib = bibtex::generate_bibtex(&p);
            if let Err(error) = paper_repo.update_bibtex(&p.id, &bib).await {
                tracing::warn!(%error, filename, paper_id, "optional startup task failed: set manual bibtex");
            }
        }
        Ok(None) => tracing::warn!(filename, paper_id, "manual vanished after import"),
        Err(error) => {
            tracing::warn!(%error, filename, paper_id, "optional startup task failed: reload manual")
        }
    }
}

async fn backfill_missing_bibtex(paper_repo: &storage::PaperRepo<'_>) {
    let need_bib = match paper_repo.list_needing_bibtex().await {
        Ok(papers) => papers,
        Err(error) => {
            tracing::warn!(%error, "optional startup task failed: list missing BibTeX");
            return;
        }
    };
    let count = need_bib.len();
    for paper in &need_bib {
        let bib = bibtex::generate_bibtex(paper);
        if let Err(error) = paper_repo.update_bibtex(&paper.id, &bib).await {
            tracing::warn!(%error, paper_id = %paper.id, "optional startup task failed: backfill BibTeX");
        }
    }
    if count > 0 {
        tracing::info!(count, "backfilled BibTeX entries");
    }
}
