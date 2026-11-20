use super::*;
use crate::storage::{open_pool, run_migrations, LibraryPaths, ReadStatus};
use serde_json::{json, Value};

// Opt-in: this exercises the shipped executable, not an importable Python module.
#[tokio::test]
#[ignore = "requires LITFOLIO_READING_SIDECAR pointing at the frozen backend"]
async fn frozen_service_preserves_legacy_identity_edits_and_stops() -> Result<()> {
    let binary = std::env::var_os("LITFOLIO_READING_SIDECAR")
        .context("set LITFOLIO_READING_SIDECAR to the frozen backend")?;
    let scratch = std::env::temp_dir().join(format!("litfolio-reading-{}", ulid::Ulid::new()));
    let paths = LibraryPaths::new(scratch.join("library"));
    paths.ensure()?;
    let pool = open_pool(&paths.db_file()).await?;
    run_migrations(&pool).await?;
    let state = AppState {
        pool,
        paths,
        http: reqwest::Client::new(),
        http_external: reqwest::Client::new(),
        host_network: crate::network_egress::HostNetworkState::new(Default::default()),
        ai_cancels: Mutex::new(Default::default()),
        batch_cancel: Mutex::new(None),
        plugin_host: crate::plugin_host::PluginHostState::new(),
    };
    let id = ulid::Ulid::new().to_string();
    let source = state.paths.paper_dir(&id).join("original.pdf");
    std::fs::create_dir_all(source.parent().context("PDF parent")?)?;
    let fixture = Path::new(env!("CARGO_MANIFEST_DIR")).join("../e2e/fixtures/reader.pdf");
    std::fs::copy(fixture, &source)?;
    notes::write(&state.paths, &id, "Legacy paper note")?;
    sqlx::query(
        "INSERT INTO papers (id, title, authors_json, added_at, updated_at, read_status,
                             pdf_path, note_path, tldr)
         VALUES (?1, 'Legacy title', '[\"Original Author\"]', 1000, 1000, 'unread',
                 ?2, 'legacy-note-path', 'retained summary')",
    )
    .bind(&id)
    .bind(source.to_str().context("UTF-8 PDF path")?)
    .execute(&state.pool)
    .await?;
    let rect = json!({"page": 1, "x": 0.1, "y": 0.2, "width": 0.3, "height": 0.04});
    let highlight = HighlightRepo::new(&state.pool)
        .insert(&id, 1, &rect, "Legacy quote", Some("yellow"), None)
        .await?;
    let reference_id = ulid::Ulid::new().to_string();
    sqlx::query("INSERT INTO papers (id, title, authors_json, abstract, added_at, updated_at, read_status)
                 VALUES (?1, 'Metadata-only paper', '[]', 'Original abstract', 900, 900, 'must')")
        .bind(&reference_id).execute(&state.pool).await?;
    let tag = TagRepo::new(&state.pool).create("legacy-tag", Some("#ff0000")).await?;
    TagRepo::new(&state.pool).attach(&reference_id, tag.id).await?;
    let paper = PaperRepo::new(&state.pool).get(&id).await?.context("seed paper")?;
    let config_dir = scratch.join("config");
    let legacy_home = config_dir.join("easyread");
    std::fs::create_dir_all(&legacy_home)?;
    std::fs::write(legacy_home.join("config.json"), r#"{"target":"ja"}"#)?;
    let home = reading_home(&config_dir)?;
    assert_eq!(home, config_dir.join("core"));
    assert!(!legacy_home.try_exists()?);
    assert_eq!(reading_home(&config_dir)?, home);
    let runtime = Runtime::start(
        std::process::Command::new(binary),
        &home,
        &state.paths.root.join("reading"),
    )
    .await?;
    let url = runtime.url.clone();
    let pid = runtime.process.pid;
    let service = ReadingService { runtime: Mutex::new(Some(runtime)) };
    let outcome: Result<()> = async {
        let mut guard = service.runtime.lock().await;
        let runtime = guard.as_mut().context("started runtime")?;
        let config: Value = runtime.http.get(format!("{url}/api/config"))
            .send().await?.error_for_status()?.json().await?;
        assert_eq!(config["config"]["target"], "ja");
        runtime.configure(&state).await?;
        runtime.attach_missing(&state, &HashSet::new(), None).await?;
        runtime.attach_legacy(&state, &paper).await?;
        let workspace = state.paths.root.join("reading").join(&id);
        assert!(!workspace.join("source.pdf").exists(), "legacy PDF must stay in place");
        assert!(!workspace.join("pages").exists(), "attachment must not prepare pages");
        let catalog = runtime.catalog().await?;
        assert_eq!(catalog.items.len(), 2);
        let reference = catalog.items.iter().find(|item| item.id == reference_id).context("metadata-only catalog entry")?;
        assert!(reference.pdf_path.is_none());
        assert_eq!(reference.abstract_text.as_deref(), Some("Original abstract"));
        assert!(reference.starred);
        assert_eq!(reference.tags, ["legacy-tag"]);
        let listed: Value = runtime.http.get(format!("{url}/api/library"))
            .send().await?.error_for_status()?.json().await?;
        let reference = listed["items"].as_array().context("library items")?
            .iter().find(|item| item["id"] == reference_id).context("visible metadata-only entry")?;
        assert_eq!(reference["source_type"], "host-reference");
        assert_eq!(reference["abstract"], "Original abstract");
        let reference_document: Value = serde_json::from_reader(std::fs::File::open(
            state.paths.root.join("reading").join(&reference_id).join("paper.json"))?)?;
        assert!(reference_document["blocks"].as_array().context("metadata-only blocks")?.is_empty());
        runtime.project(&state).await?;
        let reference = PaperRepo::new(&state.pool).get(&reference_id).await?.context("projected reference")?;
        assert_eq!(reference.read_status, ReadStatus::Must);
        assert_eq!(reference.added_at, 900);
        assert_eq!(TagRepo::new(&state.pool).for_paper(&reference_id).await?[0].name, "legacy-tag");
        let reader: Value = runtime.http.get(format!("{url}/api/p/{id}/part/reader"))
            .send().await?.error_for_status()?.json().await?;
        let note_id = format!("lf-{}", highlight.id);
        assert_eq!(reader["data"]["paper_note"]["body"], "Legacy paper note");
        assert_eq!(reader["data"]["notes"][&note_id]["quote"], "Legacy quote");
        assert_eq!(reader["data"]["notes"][&note_id]["rects"], rect);
        assert_eq!(reader["data"]["notes"][&note_id]["unmarked"], true);
        runtime.post(&format!("/api/p/{id}/ops"), &json!({"ops": [
            {"op": "paper_note", "body": "", "at": "2099-01-01T00:00:00Z"},
            {"op": "note_del", "id": note_id, "at": "2099-01-01T00:00:00Z"}
        ]})).await?;
        runtime.post(&format!("/api/p/{id}/item"), &json!({
            "meta_override": {"display_title": "Edited upstream", "authors": "Edited Author", "year": "2025"},
            "status": "done", "tags": ["upstream-tag"]
        })).await?;
        // A stale host snapshot must neither overwrite edits nor resurrect notes.
        runtime.attach_legacy(&state, &paper).await?;
        let reader: Value = runtime.http.get(format!("{url}/api/p/{id}/part/reader"))
            .send().await?.error_for_status()?.json().await?;
        assert_eq!(reader["data"]["paper_note"]["body"], "");
        assert_eq!(reader["data"]["notes"][&note_id]["deleted"], true);
        // Prepared reader originals feed the existing AI and whole-library search consumers.
        let document_path = workspace.join("paper.json");
        let mut document: Value = serde_json::from_reader(std::fs::File::open(&document_path)?)?;
        document["blocks"] = json!([
            {"id": "p1-1", "type": "para", "en": "Quasar spectroscopy from canonical reader blocks.", "zh": "translationonly"}
        ]);
        std::fs::write(&document_path, serde_json::to_vec(&document)?)?;
        let ai_body = crate::commands::summaries::load_or_extract_pdf_body(
            &state.paths, &id, paper.pdf_path.as_deref()).await.context("prepared AI body")?;
        assert!(ai_body.contains("Quasar spectroscopy"));
        assert!(!ai_body.contains("translationonly"));
        runtime.project(&state).await?;
        let projected = PaperRepo::new(&state.pool).get(&id).await?.context("projected paper")?;
        assert_eq!(projected.title, "Edited upstream");
        assert_eq!(projected.authors, ["Edited Author"]);
        assert_eq!(projected.year, Some(2025));
        assert_eq!(projected.read_status, ReadStatus::Read);
        assert_eq!(projected.added_at, 1000);
        assert_eq!(projected.tldr.as_deref(), Some("retained summary"));
        assert_eq!(projected.note_path.as_deref(), Some("legacy-note-path"));
        assert_eq!(projected.pdf_path, paper.pdf_path);
        assert_eq!(notes::read(&state.paths, &id)?, "Legacy paper note");
        assert_eq!(HighlightRepo::new(&state.pool).list_by_paper(&id).await?.len(), 1);
        let matches = PaperRepo::new(&state.pool).search("spectroscopy", 10).await?;
        assert_eq!(matches.len(), 1);
        assert_eq!(matches[0].id, id);
        assert!(PaperRepo::new(&state.pool).search("translationonly", 10).await?.is_empty());
        let missing = scratch.join("missing.pdf").display().to_string();
        let imported = runtime.import_files(&state, vec![source.display().to_string(), missing.clone()]).await?;
        assert_eq!(imported.imported.len(), 1);
        assert_eq!(imported.imported[0].id, id);
        assert_eq!(imported.failed.len(), 1);
        assert_eq!(imported.failed[0].path, missing);
        assert!(!imported.failed[0].error.is_empty());
        // The upstream page's raw-file import must also find the legacy ULID.
        let page_import: Value = runtime.http.post(format!("{url}/api/import?translate=0"))
            .header("X-Token", &runtime.token)
            .body(std::fs::read(&source)?)
            .send().await?.error_for_status()?.json().await?;
        assert_eq!(page_import["id"], id);
        // A genuinely new system import copies the file into the reading library.
        let external = scratch.join("new-paper.pdf");
        let mut bytes = std::fs::read(&source)?;
        bytes.extend_from_slice(b"\n% distinct import fixture\n");
        std::fs::write(&external, &bytes)?;
        let imported = runtime.import_files(&state, vec![external.display().to_string()]).await?;
        assert_eq!(imported.imported.len(), 1);
        assert!(imported.failed.is_empty());
        let stored = Path::new(imported.imported[0].pdf_path.as_deref().context("copied PDF path")?);
        assert!(stored.starts_with(state.paths.root.join("reading")));
        assert_ne!(stored, external);
        assert_eq!(std::fs::read(stored)?, bytes);
        assert_eq!(runtime.catalog().await?.items.len(), 3);
        assert_eq!(PaperRepo::new(&state.pool).list_all().await?.len(), 3);
        // The detail commands write canonical state, then project it back.
        for status in [ReadStatus::Must, ReadStatus::Reading, ReadStatus::Read, ReadStatus::Unread] {
            runtime.set_read_status(&state, &reference_id, status).await?;
            runtime.project(&state).await?;
            assert_eq!(PaperRepo::new(&state.pool).get(&reference_id).await?.context("status paper")?.read_status, status);
        }
        runtime.change_tag(&state, TagChange::Attach { paper_id: &id, id: tag.id }).await?;
        runtime.change_tag(&state, TagChange::Rename { id: tag.id, new_name: "renamed-tag" }).await?;
        runtime.project(&state).await?;
        for paper_id in [&id, &reference_id] {
            let tags = TagRepo::new(&state.pool).for_paper(paper_id).await?;
            let renamed = tags.iter().find(|item| item.id == tag.id).context("renamed tag retains identity")?;
            assert_eq!(renamed.name, "renamed-tag");
            assert_eq!(renamed.color.as_deref(), Some("#ff0000"));
        }
        runtime.change_tag(&state, TagChange::Detach { paper_id: &id, id: tag.id }).await?;
        assert!(!TagRepo::new(&state.pool).for_paper(&id).await?.iter().any(|item| item.id == tag.id));
        runtime.change_tag(&state, TagChange::Delete { id: tag.id }).await?;
        runtime.project(&state).await?;
        assert!(!TagRepo::new(&state.pool).list().await?.iter().any(|item| item.name == "renamed-tag"));
        let mut enriched = PaperRepo::new(&state.pool).get(&id).await?.context("enrich paper")?;
        enriched.title = "Host DOI title".into();
        enriched.authors = vec!["CrossRef Author".into()];
        enriched.year = Some(2026);
        enriched.venue = Some("Host Venue".into());
        enriched.doi = Some("10.0000/host-writeback".into());
        enriched.abstract_text = Some("Updated host abstract".into());
        runtime.update_metadata(&state, &enriched).await?;
        runtime.attach_legacy(&state, &paper).await?;
        runtime.project(&state).await?;
        let enriched = PaperRepo::new(&state.pool).get(&id).await?.context("enriched projection")?;
        assert_eq!(enriched.title, "Host DOI title");
        assert_eq!(enriched.authors, ["CrossRef Author"]);
        assert_eq!(enriched.year, Some(2026));
        assert_eq!(enriched.venue.as_deref(), Some("Host Venue"));
        assert_eq!(enriched.doi.as_deref(), Some("10.0000/host-writeback"));
        assert_eq!(enriched.abstract_text.as_deref(), Some("Updated host abstract"));
        assert_eq!(enriched.tldr.as_deref(), Some("retained summary"));
        // Adding a PDF upgrades the same metadata-only workspace, not its id.
        let attached = state.paths.paper_dir(&reference_id).join("original.pdf");
        std::fs::create_dir_all(attached.parent().context("attachment parent")?)?;
        std::fs::copy(&source, &attached)?;
        PaperRepo::new(&state.pool).update_pdf_path(&reference_id, attached.to_str().context("attachment path")?).await?;
        runtime.refresh_pdf(&state, &reference_id).await?;
        let catalog = runtime.catalog().await?;
        let reference = catalog.items.iter().find(|item| item.id == reference_id).context("upgraded reference")?;
        assert_eq!(reference.pdf_path.as_deref(), attached.to_str());
        assert_eq!(reference.title, "Metadata-only paper");
        let listed: Value = runtime.http.get(format!("{url}/api/library")).send().await?.error_for_status()?.json().await?;
        let reference = listed["items"].as_array().context("updated library")?.iter()
            .find(|item| item["id"] == reference_id).context("updated reference")?;
        assert_eq!(reference["source_type"], "pdf");
        runtime.delete_paper(&state, &reference_id).await?;
        runtime.delete_paper(&state, &reference_id).await?;
        runtime.project(&state).await?;
        let catalog = runtime.catalog().await?;
        let known = catalog.items.iter().map(|item| item.id.as_str()).collect();
        runtime.attach_missing(&state, &known, None).await?;
        assert!(!runtime.catalog().await?.items.iter().any(|item| item.id == reference_id));
        assert!(PaperRepo::new(&state.pool).get(&reference_id).await?.is_none());
        assert!(source.exists(), "deleting another workspace must preserve the legacy PDF");
        Ok(())
    }.await;
    // Always close this test's service, including when a request fails.
    service.stop().await;
    assert!(state.http.get(format!("{url}/api/library")).send().await.is_err());
    #[cfg(unix)]
    assert_eq!(unsafe { libc::kill(-(pid as i32), 0) }, -1, "sidecar process group survived shutdown");
    state.pool.close().await;
    if outcome.is_ok() {
        std::fs::remove_dir_all(&scratch)?;
    } else {
        eprintln!("reading-service diagnostics: {}", scratch.display());
    }
    outcome
}
