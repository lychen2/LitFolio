use super::*;
use crate::library_sync::WebDavConfig;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpListener;

#[test]
fn propfind_status_accepts_webdav_success_codes() {
    ensure_propfind_status(200, "https://dav.test/lib").unwrap();
    ensure_propfind_status(207, "https://dav.test/lib").unwrap();
}

#[test]
fn propfind_status_reports_http_failure() {
    let err = ensure_propfind_status(500, "https://dav.test/lib").unwrap_err();

    assert!(err
        .to_string()
        .contains("WebDAV PROPFIND for https://dav.test/lib failed with HTTP 500"));
}

#[test]
fn propfind_status_reports_auth_failure() {
    let err = ensure_propfind_status(401, "https://dav.test/lib").unwrap_err();

    assert!(err
        .to_string()
        .contains("WebDAV PROPFIND for https://dav.test/lib failed with HTTP 401"));
}

#[test]
fn mkcol_status_accepts_existing_or_created_collection() {
    ensure_mkcol_status(201, "litera/main").unwrap();
    ensure_mkcol_status(405, "litera/main").unwrap();
}

#[test]
fn mkcol_status_reports_http_failure() {
    let err = ensure_mkcol_status(403, "litera/main").unwrap_err();

    assert!(err
        .to_string()
        .contains("WebDAV MKCOL for litera/main failed with HTTP 403"));
}

#[tokio::test]
async fn download_snapshot_reports_missing_manifest_http_status() {
    let base_url = serve_once(404, "text/plain", "missing").await;
    let client = reqwest::Client::new();
    let cfg = config(&base_url);
    let remote = WebDavRemote::new(&client, &cfg);

    let err = expect_download_error(remote).await;

    assert!(err
        .to_string()
        .contains("download .litera-sync-manifest.json failed with HTTP 404"));
}

#[tokio::test]
async fn download_snapshot_reports_corrupt_manifest_body() {
    let base_url = serve_once(200, "application/json", r#"{"version":1,"files":["#).await;
    let client = reqwest::Client::new();
    let cfg = config(&base_url);
    let remote = WebDavRemote::new(&client, &cfg);

    let err = expect_download_error(remote).await;

    assert!(err.to_string().contains("parse sync manifest"));
}

fn config(base_url: &str) -> WebDavConfig {
    WebDavConfig {
        base_url: base_url.into(),
        username: String::new(),
        password: String::new(),
        remote_path: "litera/main".into(),
    }
}

async fn expect_download_error(remote: WebDavRemote<'_>) -> anyhow::Error {
    match remote.download_snapshot().await {
        Ok(_) => panic!("download_snapshot unexpectedly succeeded"),
        Err(error) => error,
    }
}

async fn serve_once(status: u16, content_type: &str, body: &str) -> String {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    let response = http_response(status, content_type, body);
    tokio::spawn(async move {
        let (mut socket, _) = listener.accept().await.unwrap();
        let mut request = [0_u8; 2048];
        let _ = socket.read(&mut request).await.unwrap();
        socket.write_all(response.as_bytes()).await.unwrap();
    });
    format!("http://{addr}")
}

fn http_response(status: u16, content_type: &str, body: &str) -> String {
    format!(
        "HTTP/1.1 {status} Test\r\nContent-Type: {content_type}\r\nContent-Length: {}\r\n\r\n{body}",
        body.len()
    )
}
