use super::response::parse_response;
use super::utils::{endpoint, request_chars, truncate};
use super::{chat_complete, ChatMessage};
use crate::ai::profile::LlmProfile;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpListener;

#[test]
fn endpoint_joins_correctly() {
    assert_eq!(
        endpoint("https://api.openai.com/v1", "/chat/completions"),
        "https://api.openai.com/v1/chat/completions"
    );
    assert_eq!(
        endpoint("http://localhost:11434/v1/", "/chat/completions"),
        "http://localhost:11434/v1/chat/completions"
    );
}

#[test]
fn truncate_works() {
    assert_eq!(truncate("abc", 10), "abc");
    assert_eq!(truncate("abcdefghij", 5), "abcde…");
}

#[test]
fn request_chars_sums_message_content() {
    let messages = vec![
        ChatMessage {
            role: "system".into(),
            content: "abc".into(),
        },
        ChatMessage {
            role: "user".into(),
            content: "你好".into(),
        },
    ];
    assert_eq!(request_chars(&messages), 5);
}

#[test]
fn parse_plain_json_response() {
    let body = r#"{"id":"x","choices":[{"message":{"role":"assistant","content":"hello"},"finish_reason":"stop"}],"usage":{"prompt_tokens":3,"completion_tokens":1,"total_tokens":4}}"#;
    let r = parse_response(body).unwrap();
    assert_eq!(r.content, "hello");
    assert_eq!(r.finish_reason.as_deref(), Some("stop"));
    assert_eq!(r.usage.completion_tokens, 1);
}

#[test]
fn parse_sse_concatenates_deltas() {
    let body = "\
data: {\"id\":\"r1\",\"choices\":[{\"index\":0,\"delta\":{\"role\":\"assistant\"}}]}\n\
\n\
data: {\"id\":\"r1\",\"choices\":[{\"index\":0,\"delta\":{\"content\":\"hel\"}}]}\n\
\n\
data: {\"id\":\"r1\",\"choices\":[{\"index\":0,\"delta\":{\"content\":\"lo\"},\"finish_reason\":\"stop\"}]}\n\
\n\
data: {\"id\":\"r1\",\"choices\":[],\"usage\":{\"prompt_tokens\":12,\"completion_tokens\":2,\"total_tokens\":14}}\n\
\n\
data: [DONE]\n";
    let r = parse_response(body).unwrap();
    assert_eq!(r.content, "hello");
    assert_eq!(r.finish_reason.as_deref(), Some("stop"));
    assert_eq!(r.usage.prompt_tokens, 12);
    assert_eq!(r.usage.completion_tokens, 2);
}

#[test]
fn parse_sse_with_only_empty_metadata_frames_errors() {
    let body = "data: {\"choices\":[],\"usage\":{\"prompt_tokens\":15,\"completion_tokens\":0,\"total_tokens\":15}}\n\ndata: [DONE]\n";
    let reply = parse_response(body).unwrap();
    assert!(reply.content.is_empty());
    assert_eq!(reply.usage.completion_tokens, 0);
}

#[test]
fn parse_sse_rejects_malformed_data_frame() {
    let body = "data: {\"choices\":[{\"delta\":{\"content\":\"hel\"}}]}\n\ndata: {bad json}\n";
    let err = parse_response(body).unwrap_err().to_string();

    assert!(err.contains("decode SSE data frame"));
}

#[tokio::test]
async fn chat_complete_reports_non_success_status() {
    let url = serve_once(500, "application/json", r#"{"error":"bad gateway"}"#).await;
    let err = chat_error(&url).await;

    assert!(err.contains("LLM endpoint returned 500"));
    assert!(err.contains("bad gateway"));
}

#[tokio::test]
async fn chat_complete_reports_empty_success_body() {
    let url = serve_once(200, "text/event-stream", "").await;
    let err = chat_error(&url).await;

    assert!(err.contains("empty response body"));
    assert!(err.contains("content-type=text/event-stream"));
}

#[tokio::test]
async fn chat_complete_reports_malformed_sse_body() {
    let url = serve_once(200, "text/event-stream", "data: {bad json}\n").await;
    let err = chat_error(&url).await;

    assert!(err.contains("decode chat response"));
    assert!(err.contains("decode SSE data frame"));
}

async fn chat_error(base_url: &str) -> String {
    let client = reqwest::Client::new();
    let err = chat_complete(&client, &profile(base_url), &sample_messages())
        .await
        .unwrap_err();
    format!("{err:#}")
}

fn profile(base_url: &str) -> LlmProfile {
    LlmProfile {
        name: "test".into(),
        base_url: base_url.into(),
        api_key: String::new(),
        chat_model: "test-model".into(),
        embed_model: None,
        max_tokens: 128,
        temperature: 0.2,
    }
}

fn sample_messages() -> Vec<ChatMessage> {
    vec![ChatMessage {
        role: "user".into(),
        content: "hello".into(),
    }]
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
    format!("http://{addr}/v1")
}

fn http_response(status: u16, content_type: &str, body: &str) -> String {
    format!(
        "HTTP/1.1 {status} Test\r\nContent-Type: {content_type}\r\nContent-Length: {}\r\n\r\n{body}",
        body.len()
    )
}
