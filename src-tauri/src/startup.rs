use anyhow::Result;
use std::path::{Path, PathBuf};
use std::sync::Arc;

use crate::bibtex;
use crate::http;
use crate::ingest;
use crate::network_egress::{HostNetworkState, NetworkEgressObserver};
use crate::storage::{self, default_library_root, open_pool, run_migrations, LibraryPaths, Pool};
use crate::AppState;

pub(crate) async fn bootstrap_state(resources: Option<&Path>) -> Result<Arc<AppState>> {
    let root = default_library_root()?;
    bootstrap_state_at(root, NetworkEgressObserver::default(), resources).await
}

pub(crate) async fn bootstrap_state_at_with_observer(
    root: impl Into<PathBuf>,
    network_egress: NetworkEgressObserver,
) -> Result<Arc<AppState>> {
    bootstrap_state_at(root, network_egress, None).await
}

async fn bootstrap_state_at(
    root: impl Into<PathBuf>,
    network_egress: NetworkEgressObserver,
    resources: Option<&Path>,
) -> Result<Arc<AppState>> {
    let paths = LibraryPaths::new(root);
    paths.ensure()?;
    let pool = open_pool(&paths.db_file()).await?;
    run_migrations(&pool).await?;
    run_optional_startup_tasks(&pool, &paths, resources).await;
    let paper_repo = storage::PaperRepo::new(&pool);
    backfill_missing_bibtex(&paper_repo).await;
    let http = http::build_api_client()?;
    let http_external = http::build_external_client()?;
    tracing::info!(root = %paths.root.display(), "library ready");
    Ok(Arc::new(AppState {
        ai_cancels: tokio::sync::Mutex::new(std::collections::HashMap::new()),
        pool,
        paths,
        http,
        http_external,
        host_network: HostNetworkState::new(network_egress),
        batch_cancel: tokio::sync::Mutex::new(None),
        sync_lock: tokio::sync::Mutex::new(()),
        plugin_host: crate::plugin_host::PluginHostState::new(),
    }))
}

async fn run_optional_startup_tasks(pool: &Pool, paths: &LibraryPaths, resources: Option<&Path>) {
    // Default RSS seeding is discovery-feeds plugin behavior; a core-only
    // boot stays silent and touches no feed tables' seed logic.
    #[cfg(feature = "plugin-discovery-feeds")]
    {
        repair_default_feeds(pool).await;
        seed_default_feeds(pool).await;
    }
    if let Some(resources) = resources {
        seed_manual_pdfs_if_empty(pool, paths, resources).await;
    }
    migrate_legacy_pdf_text_cache(pool, paths).await;
    // PDF markdown rebuild stays lazy: imports, Ask backfill, and the PDF.js
    // reader generate document.md without making startup parse the whole library.
}

#[cfg(feature = "plugin-discovery-feeds")]
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

#[cfg(feature = "plugin-discovery-feeds")]
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

async fn seed_manual_pdfs_if_empty(pool: &Pool, paths: &LibraryPaths, resource_dir: &Path) {
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
    seed_manual_pdf(
        &paper_repo,
        paths,
        resource_dir,
        "manual.pdf",
        "LitFolio 用户手册 (中文版)",
    )
    .await;
    seed_manual_pdf(
        &paper_repo,
        paths,
        resource_dir,
        "manual-en.pdf",
        "LitFolio User Manual (English)",
    )
    .await;
}

async fn seed_manual_pdf(
    paper_repo: &storage::PaperRepo<'_>,
    paths: &LibraryPaths,
    res_dir: &Path,
    filename: &str,
    title: &str,
) {
    let src = res_dir.join(filename);
    if !src.exists() {
        return;
    }
    let paper_id = ulid::Ulid::new().to_string();
    let imported = match ingest::import_pdf_file(&src, &paper_id, paths) {
        Ok(imported) => imported,
        Err(error) => {
            tracing::warn!(%error, filename, paper_id, "optional startup task failed: import manual");
            return;
        }
    };
    let mut paper = imported.draft.into_paper();
    paper.id = paper_id;
    paper.title = title.to_owned();
    paper.venue = Some("LitFolio".into());
    paper.pdf_path = Some(imported.stored_path.display().to_string());
    paper.read_status = storage::ReadStatus::Read;
    paper.bibtex = Some(bibtex::generate_bibtex(&paper));
    if let Err(error) = paper_repo.insert(&paper).await {
        tracing::warn!(%error, filename, paper_id = %paper.id, "optional startup task failed: store manual");
        return;
    }
    tracing::info!(filename, "seeded default manual");
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::network_egress::{EgressAttempt, EgressPhase, NetworkEgressObserver};
    use std::time::Duration;

    #[tokio::test]
    async fn cold_boot_registers_packaged_manuals_once() -> Result<()> {
        let scratch = std::env::temp_dir().join(format!("litfolio-manuals-{}", ulid::Ulid::new()));
        let resources = scratch.join("resources");
        std::fs::create_dir_all(&resources)?;
        let fixture = Path::new(env!("CARGO_MANIFEST_DIR")).join("../e2e/fixtures/reader.pdf");
        for name in ["manual.pdf", "manual-en.pdf"] {
            std::fs::copy(&fixture, resources.join(name))?;
        }
        let root = scratch.join("library");
        let state =
            bootstrap_state_at(&root, NetworkEgressObserver::default(), Some(&resources)).await?;
        let repo = storage::PaperRepo::new(&state.pool);
        let papers = repo.list_all().await?;
        assert_eq!(papers.len(), 2);
        let expected = std::fs::read(&fixture)?;
        for title in [
            "LitFolio 用户手册 (中文版)",
            "LitFolio User Manual (English)",
        ] {
            let paper = papers
                .iter()
                .find(|paper| paper.title == title)
                .expect(title);
            assert_eq!(paper.read_status, storage::ReadStatus::Read);
            assert!(paper.bibtex.is_some());
            let pdf = state.paths.paper_dir(&paper.id).join("original.pdf");
            assert_eq!(paper.pdf_path.as_deref(), pdf.to_str());
            assert_eq!(std::fs::read(pdf)?, expected);
        }
        state.pool.close().await;

        let state =
            bootstrap_state_at(&root, NetworkEgressObserver::default(), Some(&resources)).await?;
        let repo = storage::PaperRepo::new(&state.pool);
        assert_eq!(repo.list_all().await?.len(), 2);
        state.pool.close().await;
        std::fs::remove_dir_all(scratch)?;
        Ok(())
    }

    #[tokio::test]
    async fn core_boot_host_adapter_observes_no_dispatch_until_called() {
        let observer = NetworkEgressObserver::default();
        let root =
            std::env::temp_dir().join(format!("litera-core-boot-network-{}", ulid::Ulid::new()));

        let state = bootstrap_state_at_with_observer(&root, observer.clone())
            .await
            .expect("core state boots");
        assert_eq!(
            state.host_network.observer().attempt_count(),
            0,
            "host adapter observed an attempt before dispatch"
        );

        let papers = storage::PaperRepo::new(&state.pool)
            .list_recent(1)
            .await
            .expect("library readiness query succeeds");
        assert!(papers.is_empty(), "temporary library starts empty");
        assert!(storage::PaperRepo::new(&state.pool)
            .get("reader-readiness-fixture")
            .await
            .expect("reader readiness query succeeds")
            .is_none());
        assert_eq!(
            state.host_network.observer().attempt_count(),
            0,
            "readiness used the host request adapter"
        );

        tokio::time::pause();
        tokio::time::advance(Duration::from_secs(30)).await;
        tokio::task::yield_now().await;
        assert_eq!(
            state.host_network.observer().attempt_count(),
            0,
            "idle used the host request adapter"
        );

        let denied = state.host_network.attempt(EgressAttempt {
            phase: EgressPhase::Idle,
            owner: "core-positive-control".into(),
            transport: "fake-updater-host-adapter".into(),
            operation: "updates.check".into(),
            redacted_destination: "https://network.invalid/<redacted>".into(),
            correlation_id: "core-boot-positive-control".into(),
        });
        assert!(denied.is_err(), "positive control must remain denied");
        assert_eq!(
            observer.attempt_count(),
            1,
            "host adapter observer missed positive control"
        );
        assert_eq!(
            observer.snapshot()[0].correlation_id,
            "core-boot-positive-control"
        );

        state.pool.close().await;
        let _ = std::fs::remove_dir_all(root);
    }
}
