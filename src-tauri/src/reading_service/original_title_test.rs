use super::*;
use crate::storage::run_migrations;
use serde_json::{json, Value};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt};
use tokio::net::TcpListener;

const EN_ID: &str = "000000000001";
const ZH_ID: &str = "000000000002";
const LEGACY_ID: &str = "legacy-reference";
const DOI_ID: &str = "000000000004";
const ARXIV_ID: &str = "000000000005";
const EN_TITLE: &str = "Deep Residual Learning for Image Recognition";
const TRANSLATION: &str = "用于图像识别的深度残差学习";
const ZH_TITLE: &str = "非线性光学中的相位匹配";
const DOI_FILTER: &str = "doi:10.1234/example|10.48550/arxiv.1706.03762|10.48550/arxiv.1810.04805";

#[tokio::test]
#[ignore = "requires LITFOLIO_READING_SOURCE_PYTHON or LITFOLIO_READING_SIDECAR"]
async fn workspace_original_titles_reach_openalex() -> Result<()> {
    let command = if let Some(python) = std::env::var_os("LITFOLIO_READING_SOURCE_PYTHON") {
        let source = Path::new(env!("CARGO_MANIFEST_DIR")).join("../vendor/core");
        let mut command = std::process::Command::new(python);
        command
            .arg(source.join("scripts/backend_entry.py"))
            .env("PYTHONPATH", source);
        command
    } else {
        std::process::Command::new(
            std::env::var_os("LITFOLIO_READING_SIDECAR")
                .context("set the source Python or frozen sidecar")?,
        )
    };
    let scratch =
        std::env::temp_dir().join(format!("litfolio-original-title-{}", ulid::Ulid::new()));
    let library = scratch.join("reading");
    for (id, meta, overrides) in [
        (
            EN_ID,
            json!({"title_en": EN_TITLE, "title_zh": TRANSLATION, "source": "resnet.pdf"}),
            json!({}),
        ),
        (
            ZH_ID,
            json!({"title_en": ZH_TITLE, "title_zh": "Phase Matching in Nonlinear Optics", "source": "optics.pdf"}),
            json!({"display_title": "Reader label", "title_en": "Edited field"}),
        ),
        (
            LEGACY_ID,
            json!({"title_en": "只有旧显示题", "source_type": "host-reference"}),
            json!({}),
        ),
        (
            DOI_ID,
            json!({"title_en": "No title search for DOI", "doi": "10.1234/example", "arxiv": "1706.03762v2"}),
            json!({}),
        ),
        (
            ARXIV_ID,
            json!({"title_en": "No title search for arXiv", "arxiv": "1810.04805v2"}),
            json!({}),
        ),
        (
            "000000000006",
            json!({"title_en": "download", "source": "download.pdf"}),
            json!({}),
        ),
        (
            "000000000007",
            json!({"title_en": "已覆盖的显示题"}),
            json!({"title_en": "后来编辑的题名", "display_title": "已覆盖的显示题"}),
        ),
        (
            "000000000008",
            json!({"title_en": "继承的显示题", "source": "legacy.pdf", "source_pdf_stat": {"size": 100}}),
            json!({}),
        ),
    ] {
        let workspace = library.join(id);
        std::fs::create_dir_all(&workspace)?;
        std::fs::write(
            workspace.join("paper.json"),
            json!({"meta": meta, "blocks": []}).to_string(),
        )?;
        std::fs::write(
            workspace.join("item.json"),
            json!({"meta_override": overrides}).to_string(),
        )?;
    }
    let pool = sqlx::SqlitePool::connect("sqlite::memory:").await?;
    run_migrations(&pool).await?;
    // Simulate a pre-upgrade projection whose display title is already current.
    sqlx::query(
        "INSERT INTO papers (id, title, authors_json, added_at, updated_at, read_status)
                 VALUES (?1, ?2, '[]', 1000, 1000, 'unread')",
    )
    .bind(EN_ID)
    .bind(TRANSLATION)
    .execute(&pool)
    .await?;
    let runtime = Runtime::start(command, &scratch.join("config"), &library).await?;
    let service = ReadingService {
        runtime: Mutex::new(Some(runtime)),
    };
    let outcome = async {
        let guard = service.runtime.lock().await;
        let runtime = guard.as_ref().context("started runtime")?;
        let catalog = runtime.catalog().await?;
        let item = |id| catalog.items.iter().find(|item| item.id == id).unwrap();
        assert_eq!(item(EN_ID).title, TRANSLATION);
        assert_eq!(item(EN_ID).original_title.as_deref(), Some(EN_TITLE));
        assert_eq!(item(ZH_ID).title, "Reader label");
        assert_eq!(item(ZH_ID).original_title.as_deref(), Some(ZH_TITLE));
        for id in [LEGACY_ID, "000000000006", "000000000007", "000000000008"] {
            assert_eq!(item(id).original_title, None, "{id}");
        }
        project_reading_catalog(&pool, &catalog.items).await?;
        let repo = PaperRepo::new(&pool);
        let en = repo.get(EN_ID).await?.context("projected English paper")?;
        assert_eq!(en.title, TRANSLATION);
        assert_eq!(en.added_at, 1000);
        assert!(en.doi.is_none() && en.arxiv_id.is_none());

        let listener = TcpListener::bind("127.0.0.1:0").await?;
        let works_url = format!("http://{}/works", listener.local_addr()?);
        let client = reqwest::Client::builder().no_proxy().build()?;
        let ids = [EN_ID, ZH_ID, LEGACY_ID, DOI_ID, ARXIV_ID].map(str::to_owned).to_vec();
        let (graph, mut requests) = tokio::time::timeout(Duration::from_secs(12), async {
            tokio::try_join!(
                crate::literature_network::load_from(&repo, &client, &works_url, ids),
                serve_openalex(listener),
            )
        }).await??;
        assert_eq!(requests.remove(0), ("filter".into(), DOI_FILTER.into()));
        requests.sort();
        assert_eq!(requests, [
            ("filter", "cites:W1"), ("filter", "cites:W2"),
            ("filter", "cites:W3"), ("filter", "cites:W4"),
            ("search", EN_TITLE), ("search", ZH_TITLE),
        ].map(|(key, value)| (key.to_owned(), value.to_owned())));
        let graph = serde_json::to_value(graph)?;
        let seeds = graph["nodes"].as_array().context("graph nodes")?;
        assert_eq!(seeds.len(), 4);
        for (node, (work, id)) in seeds.iter().zip([("W1", EN_ID), ("W2", ZH_ID), ("W3", DOI_ID), ("W4", ARXIV_ID)]) {
            assert_eq!(node["id"], work);
            assert_eq!(node["libraryPaperId"], id);
            assert_eq!(node["isSeed"], true);
        }
        assert_eq!(graph["unresolvedSeedIds"], json!([LEGACY_ID]));
        println!("filter={DOI_FILTER}; requests={requests:?}; seeds=W1:{EN_ID},W2:{ZH_ID},W3:{DOI_ID},W4:{ARXIV_ID}; unresolved={LEGACY_ID}");

        // A later host write-back changes the display title but keeps the verified original.
        runtime.post("/api/host/metadata", &json!({"id": EN_ID, "title": "User-facing metadata title"})).await?;
        let catalog = runtime.catalog().await?;
        let edited = catalog.items.iter().find(|item| item.id == EN_ID).context("edited paper")?;
        assert_eq!(edited.title, "User-facing metadata title");
        assert_eq!(edited.original_title.as_deref(), Some(EN_TITLE));
        Ok::<(), anyhow::Error>(())
    }.await;
    service.stop().await;
    pool.close().await;
    if outcome.is_ok() {
        std::fs::remove_dir_all(scratch)?;
    }
    outcome
}

async fn serve_openalex(listener: TcpListener) -> Result<Vec<(String, String)>> {
    let mut requests = Vec::new();
    for _ in 0..7 {
        let (stream, _) = listener.accept().await?;
        let mut stream = BufReader::new(stream);
        let mut line = String::new();
        stream.read_line(&mut line).await?;
        let target = line
            .split_whitespace()
            .nth(1)
            .context("OpenAlex request target")?;
        let url = url::Url::parse(&format!("http://localhost{target}"))?;
        let (key, value) = url
            .query_pairs()
            .find(|(key, _)| key == "search" || key == "filter")
            .context("OpenAlex lookup parameter")?;
        let results: Value = match (key.as_ref(), value.as_ref()) {
            ("filter", DOI_FILTER) => json!([
                {"id": "W3", "doi": "https://doi.org/10.1234/example"},
                {"id": "W4", "doi": "https://doi.org/10.48550/arxiv.1810.04805"},
                {"id": "W5", "doi": "https://doi.org/10.48550/arxiv.1706.03762"},
            ]),
            ("search", EN_TITLE) => json!([
                {"id": "W9", "display_name": TRANSLATION},
                {"id": "W1", "display_name": EN_TITLE},
            ]),
            ("search", ZH_TITLE) => json!([{"id": "W2", "display_name": ZH_TITLE}]),
            ("filter", "cites:W1" | "cites:W2" | "cites:W3" | "cites:W4") => json!([]),
            _ => bail!("unexpected OpenAlex lookup {key}={value}"),
        };
        requests.push((key.into_owned(), value.into_owned()));
        let body = json!({"results": results}).to_string();
        stream.get_mut().write_all(format!("HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}", body.len()).as_bytes()).await?;
    }
    Ok(requests)
}
