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

use tracing_subscriber::fmt::writer::{MakeWriter, MakeWriterExt};
use tracing_subscriber::EnvFilter;

static LOG_FILE: OnceLock<PathBuf> = OnceLock::new();

/// Initialize tracing. When the library root resolves, log events are written to
/// both stderr and `<root>/logs/litfolio.log`; otherwise stderr only.
pub(crate) fn init(filter: EnvFilter) {
    let Some(path) = resolve_log_file() else {
        let _ = tracing_subscriber::fmt()
            .with_env_filter(filter)
            .with_writer(io::stderr)
            .try_init();
        return;
    };

    ensure_parent(&path);
    let _ = LOG_FILE.set(path.clone());
    let writer = LogFileWriter { path: path.clone() }.and(io::stderr);
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
    eprintln!("{message}");
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
    let _ = writeln!(file, "{} {message}", chrono::Local::now().to_rfc3339());
}

/// Opens the log file per event in append mode. Blocking + flush-per-line is
/// intentional: durability on crash matters more than throughput, and backend
/// logging is sparse (info level), not a hot path.
struct LogFileWriter {
    path: PathBuf,
}

impl<'a> MakeWriter<'a> for LogFileWriter {
    type Writer = Box<dyn Write>;

    fn make_writer(&'a self) -> Self::Writer {
        match OpenOptions::new()
            .create(true)
            .append(true)
            .open(&self.path)
        {
            Ok(file) => Box::new(file),
            Err(_) => Box::new(io::sink()),
        }
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
}
