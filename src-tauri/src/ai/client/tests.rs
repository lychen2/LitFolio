use super::response::parse_response;
use super::utils::{endpoint, request_chars, truncate};
use super::{chat_complete, ChatMessage};
use crate::ai::profile::LlmProfile;
use std::sync::{
    atomic::{AtomicUsize, Ordering},
    Arc,
};
use std::time::{Duration, Instant};
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
    let error = parse_response(body).unwrap_err().to_string();
    assert!(error.contains("no final answer"));
}

#[test]
fn empty_length_limited_response_preserves_finish_reason_for_chunk_retry() {
    let plain = r#"{"choices":[{"message":{"content":null,"reasoning_content":"private thought"},"finish_reason":"length"}],"usage":{"prompt_tokens":231,"completion_tokens":1024}}"#;
    let sse = "data: {\"choices\":[{\"delta\":{\"reasoning_content\":\"private thought\"},\"finish_reason\":\"length\"}]}\n\ndata: {\"choices\":[],\"usage\":{\"prompt_tokens\":231,\"completion_tokens\":1024}}\n\ndata: [DONE]\n";
    for body in [plain, sse] {
        let reply = parse_response(body).unwrap();
        assert_eq!(reply.content, "");
        assert_eq!(reply.finish_reason.as_deref(), Some("length"));
        assert_eq!(reply.usage.completion_tokens, 1024);
    }
}

#[test]
fn reasoning_only_stop_reports_redacted_finish_and_usage() {
    let body = r#"{"choices":[{"message":{"content":null,"reasoning_content":"private thought"},"finish_reason":"stop"}],"usage":{"prompt_tokens":21,"completion_tokens":1024}}"#;
    let error = parse_response(body).unwrap_err().to_string();
    assert!(error.contains("finish_reason=Some(\"stop\")"));
    assert!(error.contains("completion_tokens=1024"));
    assert!(!error.contains("private thought"));
}

#[test]
fn parse_sse_rejects_malformed_data_frame() {
    let body = "data: {\"choices\":[{\"delta\":{\"content\":\"hel\"}}]}\n\ndata: {bad json}\n";
    let err = parse_response(body).unwrap_err().to_string();

    assert!(err.contains("decode SSE data frame"));
}

#[test]
fn reasoning_fields_never_become_answers() {
    for body in [
        r#"{"choices":[{"message":{"content":null,"reasoning_content":"private thought"}}]}"#,
        r#"{"choices":[{"message":{"thinking":"private thought"}}]}"#,
        "data: {\"choices\":[{\"delta\":{\"reasoning_content\":\"private thought\"}}]}\n\ndata: [DONE]\n",
    ] {
        let error = parse_response(body).unwrap_err().to_string();
        assert!(error.contains("no final answer"));
        assert!(!error.contains("private thought"));
    }
    let reply = parse_response(r#"{"choices":[{"message":{"content":"answer","reasoning_content":"private thought","reasoning":"private thought"}}]}"#).unwrap();
    assert_eq!(reply.content, "answer");
}

#[test]
fn tagged_reasoning_is_removed_from_plain_and_split_sse() {
    for (content, expected) in [
        ("<think>private thought</think>answer", "answer"),
        ("<THINKING>private thought</THINKING>答案", "答案"),
        (
            "<think>outer<think>inner</think>outer</think>answer",
            "answer",
        ),
        ("private thought</think>answer", "answer"),
        ("answer<think>unfinished thought", "answer"),
        ("answer<thi", "answer"),
        (
            "first<think>one</think> second<thinking>two</thinking>",
            "first second",
        ),
        ("Use x < y and > z.", "Use x < y and > z."),
    ] {
        let plain = serde_json::json!({"choices":[{"message":{"content":content}}]}).to_string();
        assert_eq!(parse_response(&plain).unwrap().content, expected);
        let sse = content
            .chars()
            .map(|c| {
                format!(
                    "data: {}\n\n",
                    serde_json::json!({"choices":[{"delta":{"content":c.to_string()}}]})
                )
            })
            .collect::<String>();
        assert_eq!(parse_response(&sse).unwrap().content, expected);
    }
    for content in ["<think>unfinished", "<think>only thought</think>", "   "] {
        let body = serde_json::json!({"choices":[{"message":{"content":content}}]}).to_string();
        assert!(parse_response(&body)
            .unwrap_err()
            .to_string()
            .contains("no final answer"));
    }
}

#[tokio::test]
async fn configured_reasoning_reaches_http_and_reply_is_sanitized() {
    use crate::ai::profile::{ReasoningEffort, ThinkingFormat, ThinkingMode};
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    let server = tokio::spawn(async move {
        let (mut socket, _) = listener.accept().await.unwrap();
        let mut bytes = Vec::new();
        let (start, length) = loop {
            let mut buffer = [0; 2048];
            let read = socket.read(&mut buffer).await.unwrap();
            assert!(read > 0);
            bytes.extend_from_slice(&buffer[..read]);
            if let Some(start) = bytes.windows(4).position(|part| part == b"\r\n\r\n") {
                let headers = String::from_utf8_lossy(&bytes[..start]);
                let length: usize = headers
                    .lines()
                    .find_map(|line| {
                        let (key, value) = line.split_once(':')?;
                        key.eq_ignore_ascii_case("content-length")
                            .then(|| value.trim().parse().unwrap())
                    })
                    .unwrap();
                break (start + 4, length);
            }
        };
        while bytes.len() < start + length {
            let mut buffer = [0; 2048];
            let read = socket.read(&mut buffer).await.unwrap();
            assert!(read > 0);
            bytes.extend_from_slice(&buffer[..read]);
        }
        let body: serde_json::Value =
            serde_json::from_slice(&bytes[start..start + length]).unwrap();
        let reply = r#"{"choices":[{"message":{"content":"<think>private thought</think>answer","reasoning_content":"private thought"}}]}"#;
        socket
            .write_all(http_response(200, "application/json", reply).as_bytes())
            .await
            .unwrap();
        body
    });
    let mut p = profile(&format!("http://{addr}/v1"));
    p.thinking_format = ThinkingFormat::ReasoningEffort;
    p.thinking_mode = ThinkingMode::Enabled;
    p.reasoning_effort = ReasoningEffort::High;
    p.max_tokens = 8192;
    let response = super::chat_complete_with_task_kind(
        &reqwest::Client::new(),
        &p,
        "translate",
        &sample_messages(),
    )
    .await
    .unwrap();
    assert_eq!(response.content, "answer");
    let body = server.await.unwrap();
    assert_eq!(body["reasoning_effort"], "high");
    assert_eq!(body["max_tokens"], 8192);
    assert!(body.get("thinking").is_none());
    assert!(body.get("extra_body").is_none());
}

#[tokio::test]
async fn malformed_reply_does_not_echo_private_thoughts() {
    let url = serve_once(
        200,
        "application/json",
        r#"{"choices":[],"reasoning_content":"private thought" broken"#,
    )
    .await;
    let error = chat_error(&url).await;
    assert!(error.contains("decode chat response"));
    assert!(!error.contains("private thought"));
}

#[tokio::test]
async fn chat_complete_reports_non_success_status() {
    let url = serve_once(500, "application/json", r#"{"error":"bad gateway"}"#).await;
    let err = chat_error(&url).await;

    assert!(err.contains("LLM endpoint returned 500"));
    assert!(err.contains("bad gateway"));
}

#[tokio::test]
async fn chat_complete_reports_provider_overload_actionably() {
    let body = r#"{"error":{"message":"system cpu overloaded (current: 98.9%, threshold: 90%)","type":"new_api_error","param":"","code":"system_cpu_overloaded"}}"#;
    let url = serve_once(503, "application/json", body).await;
    let err = chat_error(&url).await;

    assert!(err.contains("LLM provider is temporarily overloaded"));
    assert!(err.contains("503 Service Unavailable"));
    assert!(err.contains("Retry later or switch to another LLM profile/model"));
    assert!(err.contains("system_cpu_overloaded"));
}

#[tokio::test]
async fn chat_complete_reports_cloudflare_timeout_without_html_dump() {
    let body = r#"<!DOCTYPE html><html><head><title>zonazcy.xyz | 522: Connection timed out</title></head><body><div id="cf-error-details">cloudflare timeout</div></body></html>"#;
    let url = serve_once(522, "text/html", body).await;
    let err = chat_error(&url).await;

    assert!(err.contains("LLM gateway timed out"));
    assert!(err.contains("522"));
    assert!(err.contains("HTML error page: zonazcy.xyz | 522: Connection timed out"));
    assert!(!err.contains("<!DOCTYPE html>"));
    assert!(!err.contains("cf-error-details"));
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

#[tokio::test]
async fn chat_complete_serializes_concurrent_requests() {
    let active = Arc::new(AtomicUsize::new(0));
    let max_active = Arc::new(AtomicUsize::new(0));
    let url = serve_many(2, active.clone(), max_active.clone()).await;
    let client = reqwest::Client::new();
    let first_profile = profile(&url);
    let second_profile = profile(&url);
    let first_messages = sample_messages();
    let second_messages = sample_messages();

    let (first, second) = tokio::join!(
        chat_complete(&client, &first_profile, &first_messages),
        chat_complete(&client, &second_profile, &second_messages),
    );

    first.unwrap();
    second.unwrap();
    assert_eq!(max_active.load(Ordering::SeqCst), 1);
}

#[tokio::test]
async fn chat_complete_cools_down_after_provider_overload() {
    let bodies = vec![
        http_response(
            503,
            "application/json",
            r#"{"error":{"message":"system cpu overloaded (current: 98.9%, threshold: 90%)","code":"system_cpu_overloaded"}}"#,
        ),
        http_response(
            200,
            "application/json",
            r#"{"choices":[{"message":{"role":"assistant","content":"ok"},"finish_reason":"stop"}],"usage":{"prompt_tokens":1,"completion_tokens":1,"total_tokens":2}}"#,
        ),
    ];
    let url = serve_sequence(bodies).await;
    let client = reqwest::Client::new();
    let profile = profile(&url);
    let messages = sample_messages();

    let first = chat_complete(&client, &profile, &messages).await;
    assert!(first
        .unwrap_err()
        .to_string()
        .contains("temporarily overloaded"));

    let started = Instant::now();
    chat_complete(&client, &profile, &messages).await.unwrap();
    assert!(started.elapsed() >= Duration::from_millis(25));
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
        thinking_mode: Default::default(),
        thinking_format: Default::default(),
        reasoning_effort: Default::default(),
    }
}

#[test]
fn request_payloads_match_endpoint_protocols() {
    use super::request::{reasoning_params, request_shape, ChatRequest};
    use crate::ai::profile::{ReasoningEffort, ThinkingFormat, ThinkingMode};
    for (url, model, expected) in [
        (
            "https://api.openai.com/v1",
            "gpt-4o-mini",
            serde_json::json!({}),
        ),
        (
            "https://api.deepseek.com/v1",
            "deepseek-chat",
            serde_json::json!({"thinking":{"type":"disabled"}}),
        ),
        (
            "https://api.siliconflow.cn/v1",
            "Qwen/Qwen3-8B",
            serde_json::json!({"enable_thinking":false}),
        ),
        (
            "https://api.moonshot.cn/v1",
            "kimi-k2.5",
            serde_json::json!({"thinking":{"type":"disabled"}}),
        ),
        (
            "http://localhost:11434/v1",
            "qwen3:8b",
            serde_json::json!({"reasoning_effort":"none"}),
        ),
        ("https://gateway.example/v1", "qwen3", serde_json::json!({})),
        (
            "https://api.openai.com.example/v1",
            "gpt-5.1",
            serde_json::json!({}),
        ),
        ("https://api.openai.com/v1", "o3", serde_json::json!({})),
        ("https://api.openai.com/v1", "gpt-5", serde_json::json!({})),
        (
            "https://api.openai.com/v1",
            "gpt-5.1",
            serde_json::json!({"reasoning_effort":"none"}),
        ),
    ] {
        let mut p = profile(url);
        p.chat_model = model.into();
        assert_eq!(
            serde_json::to_value(reasoning_params(&p, "translate").unwrap()).unwrap(),
            expected,
            "{url} {model}"
        );
    }
    let mut p = profile("https://gateway.example/v1");
    p.thinking_mode = ThinkingMode::Enabled;
    assert!(reasoning_params(&p, "translate").is_err());
    for (format, expected) in [
        (
            ThinkingFormat::Thinking,
            serde_json::json!({"thinking":{"type":"enabled"}}),
        ),
        (
            ThinkingFormat::EnableThinking,
            serde_json::json!({"enable_thinking":true}),
        ),
        (
            ThinkingFormat::ChatTemplate,
            serde_json::json!({"chat_template_kwargs":{"enable_thinking":true}}),
        ),
        (
            ThinkingFormat::ReasoningEffort,
            serde_json::json!({"reasoning_effort":"medium"}),
        ),
        (ThinkingFormat::Omit, serde_json::json!({})),
    ] {
        p.thinking_format = format;
        let shape = request_shape(&p.chat_model, 4096, 0.3);
        let messages = sample_messages();
        let body = serde_json::to_value(ChatRequest {
            model: &p.chat_model,
            messages: &messages,
            temperature: shape.temperature,
            stream: true,
            max_tokens: shape.max_tokens,
            max_completion_tokens: shape.max_completion_tokens,
            reasoning: reasoning_params(&p, "translate").unwrap(),
        })
        .unwrap();
        for key in [
            "thinking",
            "enable_thinking",
            "chat_template_kwargs",
            "reasoning_effort",
        ] {
            assert_eq!(body.get(key), expected.get(key));
        }
        assert_eq!(body["max_tokens"], 4096);
        assert!(body.get("extra_body").is_none());
        assert!(body.get("max_completion_tokens").is_none());
    }
    p.thinking_format = ThinkingFormat::ReasoningEffort;
    p.reasoning_effort = ReasoningEffort::High;
    assert_eq!(
        serde_json::to_value(reasoning_params(&p, "translate").unwrap()).unwrap(),
        serde_json::json!({"reasoning_effort":"high"})
    );
    p.thinking_format = ThinkingFormat::Thinking;
    assert!(reasoning_params(&p, "translate").is_err());
    p.thinking_format = ThinkingFormat::ReasoningEffort;
    p.thinking_mode = ThinkingMode::Disabled;
    assert!(reasoning_params(&p, "translate").is_err());
    p.reasoning_effort = ReasoningEffort::Auto;
    p.chat_model = "o3".into();
    assert!(reasoning_params(&p, "translate").is_err());
    for model in ["gpt-5", "gpt-5.1", "o1", "o3", "o4-mini"] {
        let shape = request_shape(model, 8192, 0.3);
        assert_eq!(shape.max_completion_tokens, Some(8192));
        assert!(shape.max_tokens.is_none());
        assert!(shape.temperature.is_none());
    }
    assert!(request_shape("kimi-k2.5", 4096, 0.3).temperature.is_none());
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

async fn serve_sequence(responses: Vec<String>) -> String {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    tokio::spawn(async move {
        for response in responses {
            let (mut socket, _) = listener.accept().await.unwrap();
            let mut request = [0_u8; 2048];
            let _ = socket.read(&mut request).await.unwrap();
            socket.write_all(response.as_bytes()).await.unwrap();
        }
    });
    format!("http://{addr}/v1")
}

async fn serve_many(
    count: usize,
    active: Arc<AtomicUsize>,
    max_active: Arc<AtomicUsize>,
) -> String {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    tokio::spawn(async move {
        for _ in 0..count {
            let (mut socket, _) = listener.accept().await.unwrap();
            let active = active.clone();
            let max_active = max_active.clone();
            tokio::spawn(async move {
                let current = active.fetch_add(1, Ordering::SeqCst) + 1;
                update_max(&max_active, current);
                tokio::time::sleep(Duration::from_millis(25)).await;
                let mut request = [0_u8; 2048];
                let _ = socket.read(&mut request).await.unwrap();
                let body = r#"{"choices":[{"message":{"role":"assistant","content":"ok"},"finish_reason":"stop"}],"usage":{"prompt_tokens":1,"completion_tokens":1,"total_tokens":2}}"#;
                socket
                    .write_all(http_response(200, "application/json", body).as_bytes())
                    .await
                    .unwrap();
                active.fetch_sub(1, Ordering::SeqCst);
            });
        }
    });
    format!("http://{addr}/v1")
}

fn update_max(max_active: &AtomicUsize, current: usize) {
    let mut previous = max_active.load(Ordering::SeqCst);
    while current > previous {
        match max_active.compare_exchange(previous, current, Ordering::SeqCst, Ordering::SeqCst) {
            Ok(_) => return,
            Err(actual) => previous = actual,
        }
    }
}
fn http_response(status: u16, content_type: &str, body: &str) -> String {
    format!(
        "HTTP/1.1 {status} Test\r\nContent-Type: {content_type}\r\nContent-Length: {}\r\n\r\n{body}",
        body.len()
    )
}
