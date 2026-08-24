//! Core AI Reading foundation.
//!
//! Owns three contracts shared by every core Reader AI action:
//!
//! 1. [`freeze_reading_context`] — builds the host-constructed, immutable
//!    [`ReadingContextEnvelope`] from verified inputs. The envelope is frozen
//!    before provider dispatch: refs, source hashes/revisions, budgets,
//!    truncation flags, provenance, and warnings cannot change afterwards.
//! 2. [`dispatch_with_cancel`] — wraps provider I/O in a real cancellation
//!    token; cancelled work returns before persistence.
//! 3. Execution-record helpers used with [`crate::storage::AiExecutionRepo`].

use std::future::Future;

use serde::{Deserialize, Serialize};
use tokio_util::sync::CancellationToken;

use crate::storage::DocumentRevision;

/// Default body budget sent to the provider when the caller does not pin one.
const DEFAULT_BODY_BUDGET_CHARS: usize = 24_000;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SelectionContext {
    pub text: String,
    pub page: Option<i32>,
}

/// What the frontend asks for. Refs here are untrusted until the host verifies
/// ownership against storage and freezes the envelope.
#[derive(Debug, Clone, PartialEq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadingContextRequest {
    pub paper_id: String,
    pub selection: Option<SelectionContext>,
    pub highlight_id: Option<String>,
    /// Client-pinned document revision. Must still be the paper's active
    /// revision, otherwise the request is rejected as stale.
    pub revision_id: Option<String>,
    pub max_body_chars: Option<usize>,
}

/// Host-constructed, frozen context for one AI dispatch.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadingContextEnvelope {
    pub envelope_id: String,
    pub paper_id: String,
    pub revision_id: Option<String>,
    pub source_hash: Option<String>,
    pub parser_owner: Option<String>,
    pub selection: Option<SelectionContext>,
    pub highlight_id: Option<String>,
    pub title: String,
    pub abstract_text: Option<String>,
    /// Body excerpt already truncated to the effective budget.
    pub body_excerpt: Option<String>,
    pub body_truncated: bool,
    pub warnings: Vec<String>,
}

#[derive(Debug, thiserror::Error)]
pub enum ReadingContextError {
    #[error("stale document revision: requested {requested}, current {current}")]
    StaleRevision { requested: String, current: String },
    #[error("reference does not belong to paper {paper_id}")]
    CrossPaperRef { paper_id: String },
}

impl ReadingContextError {
    /// Short redacted category for execution records — never includes content.
    pub fn category(&self) -> &'static str {
        match self {
            Self::StaleRevision { .. } => "stale-revision",
            Self::CrossPaperRef { .. } => "cross-paper-ref",
        }
    }
}

/// Freeze the dispatch context. Pure: all storage lookups (paper existence,
/// highlight ownership, active revision) happen in the host command *before*
/// this call; nothing is re-read or appended after freezing.
///
/// Empty scope (no body, no selection, no abstract) is allowed but produces an
/// explicit warning — the provider only ever sees that paper's metadata and
/// must never widen to the library.
pub fn freeze_reading_context(
    paper: &str,
    title: &str,
    abstract_text: Option<&str>,
    body_text: Option<&str>,
    active_revision: Option<&DocumentRevision>,
    request: &ReadingContextRequest,
) -> Result<ReadingContextEnvelope, ReadingContextError> {
    if request.paper_id != paper {
        return Err(ReadingContextError::CrossPaperRef {
            paper_id: paper.to_string(),
        });
    }

    let mut warnings = Vec::new();

    let revision = match (&request.revision_id, active_revision) {
        (Some(requested), Some(active)) => {
            if requested != &active.revision_id {
                return Err(ReadingContextError::StaleRevision {
                    requested: requested.clone(),
                    current: active.revision_id.clone(),
                });
            }
            Some(active)
        }
        // Pinning a revision on a paper without an accepted document is stale
        // by definition: there is nothing that revision could refer to.
        (Some(requested), None) => {
            return Err(ReadingContextError::StaleRevision {
                requested: requested.clone(),
                current: String::new(),
            })
        }
        (None, other) => other,
    };

    let body = body_text.map(str::trim).filter(|b| !b.is_empty());
    let budget = request
        .max_body_chars
        .unwrap_or(DEFAULT_BODY_BUDGET_CHARS)
        .max(1);
    let (body_excerpt, body_truncated) = match body {
        Some(body) if body.chars().count() > budget => (
            Some(body.chars().take(budget).collect::<String>()),
            true,
        ),
        Some(body) => (Some(body.to_string()), false),
        None => (None, false),
    };

    let has_selection = request.selection.is_some() || request.highlight_id.is_some();
    if body_excerpt.is_none()
        && !has_selection
        && abstract_text.map(str::trim).unwrap_or_default().is_empty()
    {
        warnings.push("empty-document-scope-fallback".to_string());
    }
    if body_truncated {
        warnings.push("body-truncated".to_string());
    }

    Ok(ReadingContextEnvelope {
        envelope_id: format!("env-{}-{}", paper, now_ms()),
        paper_id: paper.to_string(),
        revision_id: revision.map(|r| r.revision_id.clone()),
        source_hash: revision.map(|r| r.source_hash.clone()),
        parser_owner: revision.map(|r| r.parser_owner.clone()),
        selection: request.selection.clone(),
        highlight_id: request.highlight_id.clone(),
        title: title.to_string(),
        abstract_text: abstract_text.map(str::to_string),
        body_excerpt,
        body_truncated,
        warnings,
    })
}

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or_default()
}

/// Run provider I/O under a real cancellation token. Returns `None` when the
/// token fires first; callers must treat `None` as terminal-cancelled and skip
/// result publication and persistence.
pub async fn dispatch_with_cancel<T>(
    token: &CancellationToken,
    fut: impl Future<Output = T>,
) -> Option<T> {
    tokio::select! {
        () = token.cancelled() => None,
        value = fut => Some(value),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn revision(id: &str, paper: &str) -> DocumentRevision {
        let resource_ref = crate::mono_contracts::ResourceRefV1 {
            contract_version: "v1".into(),
            resource: crate::mono_contracts::DomainRefV1 {
                contract_version: "v1".into(),
                domain: crate::mono_contracts::DomainNameV1::DocumentRevision,
                id: id.to_string(),
            },
            revision: None,
        };
        DocumentRevision {
            revision_id: id.to_string(),
            resource_ref,
            paper_id: paper.to_string(),
            revision: 1,
            source_hash: format!("hash-{id}"),
            source_kind: "pdf".into(),
            source_uri: "file.pdf".into(),
            parser_owner: "core".into(),
            markdown: "# paper".into(),
            segments: Vec::new(),
            accepted_at: 0,
            active: true,
        }
    }

    fn base_request(paper: &str) -> ReadingContextRequest {
        ReadingContextRequest {
            paper_id: paper.to_string(),
            selection: None,
            highlight_id: None,
            revision_id: None,
            max_body_chars: None,
        }
    }

    fn freeze(
        body: Option<&str>,
        rev: Option<&DocumentRevision>,
        req: &ReadingContextRequest,
    ) -> Result<ReadingContextEnvelope, ReadingContextError> {
        freeze_reading_context("p1", "Title", Some("abstract"), body, rev, req)
    }

    #[test]
    fn cross_paper_request_is_rejected() {
        let err = freeze(None, None, &base_request("p2")).unwrap_err();
        assert_eq!(err.category(), "cross-paper-ref");
    }

    #[test]
    fn stale_revision_is_rejected_against_active() {
        let active = revision("rev-2", "p1");
        let mut req = base_request("p1");
        req.revision_id = Some("rev-1".into());
        let err = freeze(Some("body"), Some(&active), &req).unwrap_err();
        assert_eq!(err.category(), "stale-revision");
    }

    #[test]
    fn pinned_revision_without_document_is_stale() {
        let mut req = base_request("p1");
        req.revision_id = Some("rev-1".into());
        assert!(freeze(None, None, &req).is_err());
    }

    #[test]
    fn matching_revision_freezes_hash_and_provenance() {
        let active = revision("rev-2", "p1");
        let mut req = base_request("p1");
        req.revision_id = Some("rev-2".into());
        let env = freeze(Some("body"), Some(&active), &req).unwrap();
        assert_eq!(env.source_hash.as_deref(), Some("hash-rev-2"));
        assert_eq!(env.parser_owner.as_deref(), Some("core"));
    }

    #[test]
    fn body_is_truncated_to_budget_with_warning() {
        let mut req = base_request("p1");
        req.max_body_chars = Some(5);
        let env = freeze(Some("abcdefgh"), None, &req).unwrap();
        assert_eq!(env.body_excerpt.as_deref(), Some("abcde"));
        assert!(env.body_truncated);
        assert!(env.warnings.contains(&"body-truncated".to_string()));
    }

    #[test]
    fn empty_scope_falls_back_to_metadata_with_warning_only() {
        let mut req = base_request("p1");
        req.selection = Some(SelectionContext {
            text: "sel".into(),
            page: Some(1),
        });
        // Selection present even without body/abstract: no fallback warning.
        let env = freeze_reading_context("p1", "T", None, None, None, &req).unwrap();
        assert!(!env.warnings.contains(&"empty-document-scope-fallback".to_string()));

        let env = freeze_reading_context("p1", "T", None, None, None, &base_request("p1")).unwrap();
        assert!(env.warnings.contains(&"empty-document-scope-fallback".to_string()));
    }

    #[tokio::test]
    async fn cancellation_beats_completion_and_suppresses_result() {
        use std::time::Duration;
        let token = CancellationToken::new();
        let slow = tokio::time::sleep(Duration::from_secs(60));
        token.cancel();
        assert!(dispatch_with_cancel(&token, slow).await.is_none());

        let token = CancellationToken::new();
        let value = dispatch_with_cancel(&token, async { 42 }).await;
        assert_eq!(value, Some(42));
    }
}
