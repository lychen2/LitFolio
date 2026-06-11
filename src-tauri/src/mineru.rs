use std::io::{Cursor, Read};
use std::path::Path;
use std::time::Duration;

use anyhow::{anyhow, Context, Result};
use reqwest::Client;
use serde::{Deserialize, Serialize};

const DEFAULT_BASE_URL: &str = "https://mineru.net";
const DEFAULT_MAX_POLLS: usize = 120;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum PdfMarkdownEngine {
    #[default]
    Local,
    MineruAgent,
    MineruPrecise,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PdfMarkdownConfig {
    #[serde(default)]
    pub engine: PdfMarkdownEngine,
    #[serde(default)]
    pub mineru_token: String,
}

impl Default for PdfMarkdownConfig {
    fn default() -> Self {
        Self {
            engine: PdfMarkdownEngine::Local,
            mineru_token: String::new(),
        }
    }
}

#[derive(Clone)]
pub struct MineruClient {
    http: Client,
    base_url: String,
    poll_interval: Duration,
    max_polls: usize,
}

impl MineruClient {
    pub fn new(http: Client) -> Self {
        Self::with_base_url(http, DEFAULT_BASE_URL)
    }

    pub fn with_base_url(http: Client, base_url: impl Into<String>) -> Self {
        Self {
            http,
            base_url: base_url.into().trim_end_matches('/').to_string(),
            poll_interval: Duration::from_secs(3),
            max_polls: DEFAULT_MAX_POLLS,
        }
    }

    #[cfg_attr(not(test), allow(dead_code))]
    pub fn with_polling(mut self, poll_interval: Duration, max_polls: usize) -> Self {
        self.poll_interval = poll_interval;
        self.max_polls = max_polls;
        self
    }

    pub async fn parse_agent_file(&self, pdf_path: &Path) -> Result<String> {
        let file_name = file_name(pdf_path)?;
        let create: ApiResponse<AgentCreateData> = self
            .http
            .post(self.endpoint("/api/v1/agent/parse/file"))
            .json(&AgentFileRequest::new(file_name))
            .send()
            .await
            .map_err(|e| anyhow!("MinerU Agent create request failed: {}", e.without_url()))?
            .json()
            .await
            .context("parse MinerU Agent create response")?;
        let created = create.into_data("Agent create task")?;
        upload_file(&self.http, &created.file_url, pdf_path).await?;
        let markdown_url = self.poll_agent_markdown_url(&created.task_id).await?;
        download_text(&self.http, &markdown_url, "MinerU Agent markdown").await
    }

    pub async fn parse_precise_file(&self, pdf_path: &Path, token: &str) -> Result<String> {
        let token = token.trim();
        if token.is_empty() {
            return Err(anyhow!("MinerU precise token is empty"));
        }
        let file_name = file_name(pdf_path)?;
        let create: ApiResponse<PreciseCreateData> = self
            .http
            .post(self.endpoint("/api/v4/file-urls/batch"))
            .bearer_auth(token)
            .json(&PreciseBatchRequest::new(file_name))
            .send()
            .await
            .map_err(|e| anyhow!("MinerU precise create request failed: {}", e.without_url()))?
            .json()
            .await
            .context("parse MinerU precise create response")?;
        let created = create.into_data("precise create task")?;
        let upload_url = created
            .file_urls
            .first()
            .ok_or_else(|| anyhow!("MinerU precise response did not include an upload URL"))?;
        upload_file(&self.http, upload_url, pdf_path).await?;
        let zip_url = self.poll_precise_zip_url(&created.batch_id, token).await?;
        let zip_bytes = download_bytes(&self.http, &zip_url, "MinerU precise zip").await?;
        extract_full_markdown_from_zip(&zip_bytes)
    }

    async fn poll_agent_markdown_url(&self, task_id: &str) -> Result<String> {
        for _ in 0..self.max_polls {
            let response: ApiResponse<AgentPollData> = self
                .http
                .get(self.endpoint(&format!("/api/v1/agent/parse/{task_id}")))
                .send()
                .await
                .map_err(|e| anyhow!("MinerU Agent poll request failed: {}", e.without_url()))?
                .json()
                .await
                .context("parse MinerU Agent poll response")?;
            let data = response.into_data("Agent poll task")?;
            match data.state.as_str() {
                "done" => {
                    return data
                        .markdown_url
                        .filter(|url| !url.trim().is_empty())
                        .ok_or_else(|| {
                            anyhow!("MinerU Agent result did not include markdown_url")
                        });
                }
                "failed" => {
                    return Err(anyhow!(
                        "MinerU Agent task failed{}",
                        error_suffix(data.err_msg.as_deref(), data.err_code)
                    ));
                }
                _ => tokio::time::sleep(self.poll_interval).await,
            }
        }
        Err(anyhow!("MinerU Agent polling timed out for task {task_id}"))
    }

    async fn poll_precise_zip_url(&self, batch_id: &str, token: &str) -> Result<String> {
        for _ in 0..self.max_polls {
            let response: ApiResponse<PrecisePollData> = self
                .http
                .get(self.endpoint(&format!("/api/v4/extract-results/batch/{batch_id}")))
                .bearer_auth(token)
                .send()
                .await
                .map_err(|e| anyhow!("MinerU precise poll request failed: {}", e.without_url()))?
                .json()
                .await
                .context("parse MinerU precise poll response")?;
            let data = response.into_data("precise poll task")?;
            let result = data.extract_result.first().ok_or_else(|| {
                anyhow!("MinerU precise poll response did not include extract_result")
            })?;
            match result.state.as_str() {
                "done" => {
                    return result
                        .full_zip_url
                        .clone()
                        .filter(|url| !url.trim().is_empty())
                        .ok_or_else(|| {
                            anyhow!("MinerU precise result did not include full_zip_url")
                        });
                }
                "failed" => {
                    return Err(anyhow!(
                        "MinerU precise task failed{}",
                        error_suffix(result.err_msg.as_deref(), None)
                    ));
                }
                _ => tokio::time::sleep(self.poll_interval).await,
            }
        }
        Err(anyhow!(
            "MinerU precise polling timed out for batch {batch_id}"
        ))
    }

    fn endpoint(&self, path: &str) -> String {
        format!("{}{}", self.base_url, path)
    }
}

#[derive(Serialize)]
struct AgentFileRequest {
    file_name: String,
    language: &'static str,
    enable_table: bool,
    is_ocr: bool,
    enable_formula: bool,
}

impl AgentFileRequest {
    fn new(file_name: String) -> Self {
        Self {
            file_name,
            language: "ch",
            enable_table: true,
            is_ocr: false,
            enable_formula: true,
        }
    }
}

#[derive(Serialize)]
struct PreciseBatchRequest {
    files: Vec<PreciseBatchFile>,
    model_version: &'static str,
    language: &'static str,
    enable_table: bool,
    enable_formula: bool,
}

impl PreciseBatchRequest {
    fn new(file_name: String) -> Self {
        Self {
            files: vec![PreciseBatchFile { name: file_name }],
            model_version: "vlm",
            language: "ch",
            enable_table: true,
            enable_formula: true,
        }
    }
}

#[derive(Serialize)]
struct PreciseBatchFile {
    name: String,
}

#[derive(Deserialize)]
struct ApiResponse<T> {
    code: serde_json::Value,
    #[serde(default)]
    msg: String,
    data: Option<T>,
}

impl<T> ApiResponse<T> {
    fn into_data(self, operation: &str) -> Result<T> {
        if !is_success_code(&self.code) {
            return Err(anyhow!(
                "MinerU {operation} returned code {}: {}",
                display_code(&self.code),
                self.msg
            ));
        }
        self.data
            .ok_or_else(|| anyhow!("MinerU {operation} response did not include data"))
    }
}

#[derive(Deserialize)]
struct AgentCreateData {
    task_id: String,
    file_url: String,
}

#[derive(Deserialize)]
struct AgentPollData {
    state: String,
    markdown_url: Option<String>,
    err_msg: Option<String>,
    err_code: Option<i64>,
}

#[derive(Deserialize)]
struct PreciseCreateData {
    batch_id: String,
    file_urls: Vec<String>,
}

#[derive(Deserialize)]
struct PrecisePollData {
    extract_result: Vec<PreciseExtractResult>,
}

#[derive(Deserialize)]
struct PreciseExtractResult {
    state: String,
    full_zip_url: Option<String>,
    err_msg: Option<String>,
}

async fn upload_file(http: &Client, upload_url: &str, pdf_path: &Path) -> Result<()> {
    let bytes = tokio::fs::read(pdf_path)
        .await
        .with_context(|| format!("read PDF {}", pdf_path.display()))?;
    let response = http
        .put(upload_url)
        .body(bytes)
        .send()
        .await
        .map_err(|e| anyhow!("MinerU upload request failed: {}", e.without_url()))?;
    if !response.status().is_success() {
        return Err(anyhow!("MinerU upload returned HTTP {}", response.status()));
    }
    Ok(())
}

async fn download_text(http: &Client, url: &str, label: &str) -> Result<String> {
    let response = http
        .get(url)
        .send()
        .await
        .map_err(|e| anyhow!("download {label} failed: {}", e.without_url()))?;
    if !response.status().is_success() {
        return Err(anyhow!(
            "download {label} returned HTTP {}",
            response.status()
        ));
    }
    response
        .text()
        .await
        .map_err(|e| anyhow!("read {label} body failed: {}", e.without_url()))
}

async fn download_bytes(http: &Client, url: &str, label: &str) -> Result<Vec<u8>> {
    let response = http
        .get(url)
        .send()
        .await
        .map_err(|e| anyhow!("download {label} failed: {}", e.without_url()))?;
    if !response.status().is_success() {
        return Err(anyhow!(
            "download {label} returned HTTP {}",
            response.status()
        ));
    }
    let bytes = response
        .bytes()
        .await
        .map_err(|e| anyhow!("read {label} body failed: {}", e.without_url()))?;
    Ok(bytes.to_vec())
}

fn extract_full_markdown_from_zip(bytes: &[u8]) -> Result<String> {
    let reader = Cursor::new(bytes);
    let mut archive = zip::ZipArchive::new(reader).context("open MinerU result zip")?;
    for index in 0..archive.len() {
        let mut file = archive
            .by_index(index)
            .with_context(|| format!("read MinerU zip entry {index}"))?;
        let normalized_name = file.name().replace('\\', "/");
        if normalized_name == "full.md" || normalized_name.ends_with("/full.md") {
            let mut markdown = String::new();
            file.read_to_string(&mut markdown)
                .context("read MinerU full.md as UTF-8")?;
            return Ok(markdown);
        }
    }
    Err(anyhow!("MinerU result zip did not contain full.md"))
}

fn file_name(path: &Path) -> Result<String> {
    path.file_name()
        .and_then(|value| value.to_str())
        .map(|value| value.to_string())
        .ok_or_else(|| anyhow!("PDF path has no UTF-8 file name: {}", path.display()))
}

fn is_success_code(code: &serde_json::Value) -> bool {
    code.as_i64() == Some(0) || code.as_str() == Some("0")
}

fn display_code(code: &serde_json::Value) -> String {
    code.as_str()
        .map(str::to_string)
        .unwrap_or_else(|| code.to_string())
}

fn error_suffix(message: Option<&str>, code: Option<i64>) -> String {
    let code = code
        .map(|value| format!(" code={value}"))
        .unwrap_or_default();
    let message = message
        .filter(|value| !value.trim().is_empty())
        .map(|value| format!(": {value}"))
        .unwrap_or_default();
    format!("{code}{message}")
}

#[cfg(test)]
mod tests {
    use std::io::Write;
    use std::path::PathBuf;
    use std::sync::{Arc, Mutex};
    use std::time::Duration;

    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    use tokio::net::{TcpListener, TcpStream};

    use super::MineruClient;

    #[tokio::test]
    async fn agent_file_flow_uploads_polls_and_downloads_markdown() {
        let server = TestServer::start(MockMode::Agent).await;
        let pdf = fixture_pdf("agent");
        let client = MineruClient::with_base_url(reqwest::Client::new(), server.base_url())
            .with_polling(Duration::from_millis(1), 4);

        let markdown = client.parse_agent_file(&pdf).await.unwrap();

        assert_eq!(markdown, "# Agent\n\nParsed markdown");
        let requests = server.requests();
        assert!(requests
            .iter()
            .any(|r| r.method == "POST" && r.path == "/api/v1/agent/parse/file"));
        assert!(requests.iter().any(|r| r.method == "PUT"
            && r.path == "/agent-upload"
            && r.body.starts_with(b"%PDF-")));
        assert!(
            requests
                .iter()
                .filter(|r| r.method == "GET" && r.path == "/api/v1/agent/parse/task-agent")
                .count()
                >= 2
        );
        assert!(requests
            .iter()
            .any(|r| r.method == "GET" && r.path == "/agent/full.md"));
        std::fs::remove_file(pdf).ok();
    }

    #[tokio::test]
    async fn precise_file_flow_uses_bearer_token_uploads_polls_and_extracts_full_md() {
        let server = TestServer::start(MockMode::Precise).await;
        let pdf = fixture_pdf("precise");
        let client = MineruClient::with_base_url(reqwest::Client::new(), server.base_url())
            .with_polling(Duration::from_millis(1), 4);

        let markdown = client
            .parse_precise_file(&pdf, "mineru-token")
            .await
            .unwrap();

        assert_eq!(markdown, "# Precise\n\nParsed markdown");
        let requests = server.requests();
        let create = requests
            .iter()
            .find(|r| r.method == "POST" && r.path == "/api/v4/file-urls/batch")
            .expect("precise batch creation request");
        assert!(create
            .headers
            .iter()
            .any(|h| h.eq_ignore_ascii_case("authorization: Bearer mineru-token")));
        assert!(String::from_utf8_lossy(&create.body).contains("\"model_version\":\"vlm\""));
        assert!(requests.iter().any(|r| r.method == "PUT"
            && r.path == "/precise-upload"
            && r.body.starts_with(b"%PDF-")));
        assert!(requests
            .iter()
            .any(|r| r.method == "GET" && r.path == "/api/v4/extract-results/batch/batch-1"));
        assert!(requests
            .iter()
            .any(|r| r.method == "GET" && r.path == "/precise/result.zip"));
        std::fs::remove_file(pdf).ok();
    }

    #[derive(Clone, Copy)]
    enum MockMode {
        Agent,
        Precise,
    }

    #[derive(Clone, Debug)]
    struct RecordedRequest {
        method: String,
        path: String,
        headers: Vec<String>,
        body: Vec<u8>,
    }

    struct TestServer {
        base_url: String,
        requests: Arc<Mutex<Vec<RecordedRequest>>>,
    }

    impl TestServer {
        async fn start(mode: MockMode) -> Self {
            let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
            let addr = listener.local_addr().unwrap();
            let base_url = format!("http://{addr}");
            let requests = Arc::new(Mutex::new(Vec::new()));
            let state = Arc::new(Mutex::new(MockState { polls: 0 }));
            let task_requests = Arc::clone(&requests);
            let task_state = Arc::clone(&state);
            let task_base_url = base_url.clone();
            tokio::spawn(async move {
                loop {
                    let Ok((stream, _)) = listener.accept().await else {
                        break;
                    };
                    let requests = Arc::clone(&task_requests);
                    let state = Arc::clone(&task_state);
                    let base_url = task_base_url.clone();
                    tokio::spawn(async move {
                        handle_connection(stream, mode, base_url, state, requests).await;
                    });
                }
            });
            Self { base_url, requests }
        }

        fn base_url(&self) -> String {
            self.base_url.clone()
        }

        fn requests(&self) -> Vec<RecordedRequest> {
            self.requests.lock().unwrap().clone()
        }
    }

    struct MockState {
        polls: usize,
    }

    async fn handle_connection(
        mut stream: TcpStream,
        mode: MockMode,
        base_url: String,
        state: Arc<Mutex<MockState>>,
        requests: Arc<Mutex<Vec<RecordedRequest>>>,
    ) {
        let Some(request) = read_request(&mut stream).await else {
            return;
        };
        requests.lock().unwrap().push(request.clone());
        let response = match mode {
            MockMode::Agent => agent_response(&request, &base_url, state),
            MockMode::Precise => precise_response(&request, &base_url),
        };
        let _ = stream.write_all(&response).await;
    }

    async fn read_request(stream: &mut TcpStream) -> Option<RecordedRequest> {
        let mut buf = Vec::new();
        let header_end = loop {
            let mut chunk = [0u8; 1024];
            let read = stream.read(&mut chunk).await.ok()?;
            if read == 0 {
                return None;
            }
            buf.extend_from_slice(&chunk[..read]);
            if let Some(pos) = find_header_end(&buf) {
                break pos;
            }
        };
        let header_bytes = &buf[..header_end];
        let header_text = String::from_utf8_lossy(header_bytes);
        let mut lines = header_text.lines();
        let first = lines.next()?;
        let mut first_parts = first.split_whitespace();
        let method = first_parts.next()?.to_string();
        let path = first_parts.next()?.to_string();
        let headers = lines
            .map(|line| line.trim().to_string())
            .collect::<Vec<_>>();
        let content_length = headers
            .iter()
            .find_map(|line| {
                line.strip_prefix("Content-Length:")
                    .or_else(|| line.strip_prefix("content-length:"))
            })
            .and_then(|value| value.trim().parse::<usize>().ok())
            .unwrap_or(0);
        let body_start = header_end + 4;
        while buf.len().saturating_sub(body_start) < content_length {
            let mut chunk = [0u8; 1024];
            let read = stream.read(&mut chunk).await.ok()?;
            if read == 0 {
                break;
            }
            buf.extend_from_slice(&chunk[..read]);
        }
        let body = buf
            [body_start..body_start + content_length.min(buf.len().saturating_sub(body_start))]
            .to_vec();
        Some(RecordedRequest {
            method,
            path,
            headers,
            body,
        })
    }

    fn find_header_end(buf: &[u8]) -> Option<usize> {
        buf.windows(4).position(|window| window == b"\r\n\r\n")
    }

    fn agent_response(
        request: &RecordedRequest,
        base_url: &str,
        state: Arc<Mutex<MockState>>,
    ) -> Vec<u8> {
        match (request.method.as_str(), request.path.as_str()) {
            ("POST", "/api/v1/agent/parse/file") => json_response(&format!(
                r#"{{"code":0,"msg":"ok","data":{{"task_id":"task-agent","file_url":"{base_url}/agent-upload"}}}}"#
            )),
            ("PUT", "/agent-upload") => empty_response(200),
            ("GET", "/api/v1/agent/parse/task-agent") => {
                let mut state = state.lock().unwrap();
                state.polls += 1;
                if state.polls == 1 {
                    json_response(
                        r#"{"code":0,"msg":"ok","data":{"task_id":"task-agent","state":"running"}}"#,
                    )
                } else {
                    json_response(&format!(
                        r#"{{"code":0,"msg":"ok","data":{{"task_id":"task-agent","state":"done","markdown_url":"{base_url}/agent/full.md"}}}}"#
                    ))
                }
            }
            ("GET", "/agent/full.md") => {
                text_response("# Agent\n\nParsed markdown", "text/markdown")
            }
            _ => empty_response(404),
        }
    }

    fn precise_response(request: &RecordedRequest, base_url: &str) -> Vec<u8> {
        match (request.method.as_str(), request.path.as_str()) {
            ("POST", "/api/v4/file-urls/batch") => json_response(&format!(
                r#"{{"code":0,"msg":"ok","data":{{"batch_id":"batch-1","file_urls":["{base_url}/precise-upload"]}}}}"#
            )),
            ("PUT", "/precise-upload") => empty_response(200),
            ("GET", "/api/v4/extract-results/batch/batch-1") => json_response(&format!(
                r#"{{"code":0,"msg":"ok","data":{{"batch_id":"batch-1","extract_result":[{{"file_name":"paper.pdf","state":"done","err_msg":"","full_zip_url":"{base_url}/precise/result.zip"}}]}}}}"#
            )),
            ("GET", "/precise/result.zip") => binary_response(
                zip_with_full_md("# Precise\n\nParsed markdown"),
                "application/zip",
            ),
            _ => empty_response(404),
        }
    }

    fn json_response(body: &str) -> Vec<u8> {
        text_response(body, "application/json")
    }

    fn text_response(body: &str, content_type: &str) -> Vec<u8> {
        binary_response(body.as_bytes().to_vec(), content_type)
    }

    fn binary_response(body: Vec<u8>, content_type: &str) -> Vec<u8> {
        let mut response = format!(
            "HTTP/1.1 200 OK\r\nContent-Type: {content_type}\r\nContent-Length: {}\r\n\r\n",
            body.len()
        )
        .into_bytes();
        response.extend_from_slice(&body);
        response
    }

    fn empty_response(status: u16) -> Vec<u8> {
        format!("HTTP/1.1 {status} OK\r\nContent-Length: 0\r\n\r\n").into_bytes()
    }

    fn zip_with_full_md(markdown: &str) -> Vec<u8> {
        let cursor = std::io::Cursor::new(Vec::new());
        let mut zip = zip::ZipWriter::new(cursor);
        zip.start_file("nested/full.md", zip::write::SimpleFileOptions::default())
            .unwrap();
        zip.write_all(markdown.as_bytes()).unwrap();
        zip.finish().unwrap().into_inner()
    }

    fn fixture_pdf(name: &str) -> PathBuf {
        let path =
            std::env::temp_dir().join(format!("litera-mineru-{name}-{}.pdf", ulid::Ulid::new()));
        std::fs::write(&path, b"%PDF-1.4\n%fixture\n%%EOF\n").unwrap();
        path
    }
}
