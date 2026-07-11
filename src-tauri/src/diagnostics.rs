//! Persistent crash/startup diagnostics.
//!
//! On Windows GUI builds stderr is discarded, so a panic or a bootstrap error
//! vanishes and the app just "flash-crashes" with nothing to report. This module
//! tees tracing to a durable on-disk log under the library root and records
//! panics / fatal errors there so a Windows user can hand us the file.

use std::fs::OpenOptions;
use std::io::{self, Write};
use std::path::{Path, PathBuf};
use std::sync::OnceLock;

use once_cell::sync::Lazy;
use regex::Regex;
use tracing_subscriber::fmt::writer::{MakeWriter, MakeWriterExt};
use tracing_subscriber::EnvFilter;

static LOG_FILE: OnceLock<PathBuf> = OnceLock::new();
static FIELD_SECRET_RE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(
        r#"(?ix)
        \b(api[_-]?key|apikey|password|token|secret|tauri_signing_private_key)
        (\s*[:=]\s*)
        ("?)
        [^"\s,;}]+
        ("?)
        "#,
    )
    .expect("valid field secret redaction regex")
});
static BEARER_RE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r#"(?i)\b(authorization\s*[:=]\s*bearer\s+)[A-Za-z0-9._~+/=-]+"#)
        .expect("valid bearer token redaction regex")
});
static OPENAI_KEY_RE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r#"\bsk-[A-Za-z0-9._-]{8,}\b"#).expect("valid OpenAI key redaction regex")
});
static PRIVATE_KEY_RE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r#"(?s)-----BEGIN [A-Z ]*PRIVATE KEY-----.*?-----END [A-Z ]*PRIVATE KEY-----"#)
        .expect("valid private key redaction regex")
});

/// Initialize tracing. When the library root resolves, log events are written to
/// both stderr and `<root>/logs/litfolio.log`; otherwise stderr only.
pub(crate) fn init(filter: EnvFilter) {
    let Some(path) = resolve_log_file() else {
        let _ = tracing_subscriber::fmt()
            .with_env_filter(filter)
            .with_writer(RedactingStderr)
            .try_init();
        return;
    };

    ensure_parent(&path);
    let _ = LOG_FILE.set(path.clone());
    let writer = LogFileWriter { path: path.clone() }.and(RedactingStderr);
    let _ = tracing_subscriber::fmt()
        .with_env_filter(filter)
        .with_writer(writer)
        .try_init();
    append_line(&path, "LitFolio logging initialized");
}

/// Capture panics to the log file. stderr alone is invisible on Windows GUI.
pub(crate) fn install_panic_hook() {
    std::panic::set_hook(Box::new(|info| {
        let location = info
            .location()
            .map(|l| format!("{}:{}:{}", l.file(), l.line(), l.column()))
            .unwrap_or_else(|| "unknown".to_string());
        write_fatal(&format!("panic at {location}: {info}"));
    }));
}

/// Record a fatal error to stderr and the log file, resolving the path lazily so
/// it works even if `init` never managed to set up the file writer.
pub(crate) fn write_fatal(message: &str) {
    eprintln!("{}", redact_secrets(message));
    if let Some(path) = LOG_FILE.get().cloned().or_else(resolve_log_file) {
        append_line(&path, message);
    }
}

fn resolve_log_file() -> Option<PathBuf> {
    crate::storage::default_library_root()
        .ok()
        .map(|root| crate::storage::LibraryPaths::new(root).app_log_file())
}

fn ensure_parent(path: &Path) {
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
}

fn append_line(path: &Path, message: &str) {
    ensure_parent(path);
    let Ok(mut file) = OpenOptions::new().create(true).append(true).open(path) else {
        return;
    };
    let _ = writeln!(
        file,
        "{} {}",
        chrono::Local::now().to_rfc3339(),
        redact_secrets(message)
    );
}

fn redact_secrets(message: &str) -> String {
    let message = PRIVATE_KEY_RE.replace_all(message, "[REDACTED_PRIVATE_KEY]");
    let message = BEARER_RE.replace_all(&message, "${1}[REDACTED]");
    let message = FIELD_SECRET_RE.replace_all(&message, "${1}${2}${3}[REDACTED]${4}");
    OPENAI_KEY_RE
        .replace_all(&message, "sk-[REDACTED]")
        .into_owned()
}

/// Opens the log file per event in append mode. Blocking + flush-per-line is
/// intentional: durability on crash matters more than throughput, and backend
/// logging is sparse (info level), not a hot path.
struct LogFileWriter {
    path: PathBuf,
}

impl<'a> MakeWriter<'a> for LogFileWriter {
    type Writer = RedactingLineWriter<Box<dyn Write>>;

    fn make_writer(&'a self) -> Self::Writer {
        let writer: Box<dyn Write> = match OpenOptions::new()
            .create(true)
            .append(true)
            .open(&self.path)
        {
            Ok(file) => Box::new(file),
            Err(_) => Box::new(io::sink()),
        };
        RedactingLineWriter::new(writer)
    }
}

struct RedactingStderr;

impl<'a> MakeWriter<'a> for RedactingStderr {
    type Writer = RedactingLineWriter<io::Stderr>;

    fn make_writer(&'a self) -> Self::Writer {
        RedactingLineWriter::new(io::stderr())
    }
}

struct RedactingLineWriter<W: Write> {
    inner: W,
    pending: Vec<u8>,
}

impl<W: Write> RedactingLineWriter<W> {
    fn new(inner: W) -> Self {
        Self {
            inner,
            pending: Vec::new(),
        }
    }

    fn write_pending(&mut self) -> io::Result<()> {
        if self.pending.is_empty() {
            return Ok(());
        }
        let line = String::from_utf8_lossy(&self.pending);
        self.inner.write_all(redact_secrets(&line).as_bytes())?;
        self.pending.clear();
        Ok(())
    }
}

impl<W: Write> Write for RedactingLineWriter<W> {
    fn write(&mut self, buf: &[u8]) -> io::Result<usize> {
        self.pending.extend_from_slice(buf);
        while let Some(pos) = self.pending.iter().position(|b| *b == b'\n') {
            let line = self.pending.drain(..=pos).collect::<Vec<_>>();
            let line = String::from_utf8_lossy(&line);
            self.inner.write_all(redact_secrets(&line).as_bytes())?;
        }
        Ok(buf.len())
    }

    fn flush(&mut self) -> io::Result<()> {
        self.write_pending()?;
        self.inner.flush()
    }
}

impl<W: Write> Drop for RedactingLineWriter<W> {
    fn drop(&mut self) {
        let _ = self.write_pending();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn append_line_writes_message_to_file() {
        let dir = std::env::temp_dir().join(format!("litfolio-diag-{}", std::process::id()));
        let path = dir.join("litfolio.log");
        let _ = std::fs::remove_dir_all(&dir);

        append_line(&path, "boot marker");

        let contents = std::fs::read_to_string(&path).expect("log file should exist");
        assert!(contents.contains("boot marker"));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn redacts_credentials_before_writing_logs() {
        let raw = r#"api_key="sk-secret123456" password=hunter2 token: abcdef Authorization: Bearer xyz987 TAURI_SIGNING_PRIVATE_KEY=signing-secret -----BEGIN PRIVATE KEY-----abc-----END PRIVATE KEY-----"#;
        let redacted = redact_secrets(raw);

        assert!(!redacted.contains("sk-secret123456"));
        assert!(!redacted.contains("hunter2"));
        assert!(!redacted.contains("abcdef"));
        assert!(!redacted.contains("xyz987"));
        assert!(!redacted.contains("signing-secret"));
        assert!(!redacted.contains("BEGIN PRIVATE KEY"));
        assert!(redacted.contains("[REDACTED]"));
        assert!(redacted.contains("[REDACTED_PRIVATE_KEY]"));
    }

    #[test]
    fn append_line_redacts_credentials_in_file() {
        let dir = std::env::temp_dir().join(format!("litfolio-redact-{}", std::process::id()));
        let path = dir.join("litfolio.log");
        let _ = std::fs::remove_dir_all(&dir);

        append_line(&path, "token=super-secret-value");

        let contents = std::fs::read_to_string(&path).expect("log file should exist");
        assert!(!contents.contains("super-secret-value"));
        assert!(contents.contains("token=[REDACTED]"));
        let _ = std::fs::remove_dir_all(&dir);
    }
}
