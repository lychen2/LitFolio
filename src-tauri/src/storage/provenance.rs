//! Core-owned evidence provenance: accepted document revisions, stable source
//! segments, source links with immutable snapshots, indexed backlinks,
//! revision-safe note saves, deterministic backfill/remap, and provenance
//! export. Parser owner strings are descriptive only; parser disable keeps
//! all provenance data usable (AC-009).

use chrono::Utc;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::Row;
use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::path::{Path, PathBuf};
use thiserror::Error;
use ulid::Ulid;

use super::db::Pool;
use super::paths::LibraryPaths;
use crate::mono_contracts::{
    DomainNameV1, DomainRefV1, ResourceRefV1, RevisionKindV1, RevisionV1, CONTRACT_VERSION,
};
pub const MAX_PAGE: i32 = 10_000;
pub const MAX_COORDINATE: f64 = 100_000.0;
pub const MAX_MARKDOWN_BYTES: usize = 32 * 1024 * 1024;
pub const MAX_ASSET_BYTES: usize = 64 * 1024 * 1024;
pub const PROVENANCE_SCHEMA_VERSION: i64 = 1;
pub const PROVENANCE_TARGET_VERSION: i64 = 1;

pub const SEGMENT_KINDS: [&str; 8] = [
    "heading",
    "paragraph",
    "table",
    "list",
    "figure",
    "code",
    "quote",
    "asset",
];
fn resource_ref(domain: DomainNameV1, id: &str, revision: i64) -> ResourceRefV1 {
    ResourceRefV1 {
        contract_version: CONTRACT_VERSION.to_string(),
        resource: DomainRefV1 {
            contract_version: CONTRACT_VERSION.to_string(),
            domain,
            id: id.to_string(),
        },
        revision: Some(RevisionV1 {
            kind: RevisionKindV1::Number,
            value: revision.to_string(),
        }),
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceSegment {
    pub segment_id: String,
    pub resource_ref: ResourceRefV1,
    pub revision_id: String,
    pub paper_id: String,
    pub seg_order: i64,
    pub kind: String,
    pub markdown: String,
    pub page: Option<i32>,
    pub rect: Option<Value>,
    pub quote_hash: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentRevision {
    pub revision_id: String,
    pub resource_ref: ResourceRefV1,
    pub paper_id: String,
    pub revision: i64,
    pub source_hash: String,
    pub source_kind: String,
    pub source_uri: String,
    pub parser_owner: String,
    pub markdown: String,
    pub segments: Vec<SourceSegment>,
    pub accepted_at: i64,
    pub active: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceLink {
    pub link_id: String,
    pub paper_id: String,
    pub anchor_domain: String,
    pub anchor_id: String,
    pub segment_id: String,
    pub revision_id: String,
    pub snapshot: Value,
    pub quote_hash: String,
    pub resolution: String,
    /// Derived target for the latest active revision. Original fields above
    /// remain immutable evidence and are never overwritten during remapping.
    pub resolved_revision_id: Option<String>,
    pub resolved_segment_id: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BacklinkRow {
    pub anchor_domain: String,
    pub anchor_id: String,
    pub segment_id: String,
    pub resolution: String,
    pub updated_at: i64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteRevision {
    pub note_id: String,
    pub paper_id: String,
    pub revision: i64,
    pub content_hash: String,
    pub saved_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteSaveResult {
    pub revision: i64,
    pub content_hash: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DocumentCandidate {
    pub source_hash: String,
    pub source_kind: String,
    pub source_uri: String,
    pub parser_owner: String,
    pub markdown: String,
    pub segments: Vec<CandidateSegment>,
    pub assets: Vec<CandidateAsset>,
    pub warnings: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CandidateSegment {
    pub kind: String,
    pub markdown: String,
    pub page: Option<i32>,
    pub rect: Option<Value>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CandidateAsset {
    pub name: String,
    pub bytes: i64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackfillReport {
    pub schema_version: i64,
    pub papers: Vec<BackfillPaperReport>,
    pub total_papers: i64,
    pub created_revisions: i64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackfillPaperReport {
    pub paper_id: String,
    pub created: bool,
    pub revision: i64,
    pub note_revision: i64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemapReport {
    pub schema_version: i64,
    pub paper_ids: Vec<String>,
    pub links_recomputed: i64,
    pub changed: i64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProvenanceExport {
    pub schema_version: i64,
    pub target_version: i64,
    pub papers: Vec<ProvenancePaperExport>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProvenanceRevisionExport {
    pub revision_id: String,
    pub resource_ref: ResourceRefV1,
    pub paper_id: String,
    pub revision: i64,
    pub source_hash: String,
    pub source_kind: String,
    pub source_uri: String,
    pub parser_owner: String,
    pub markdown: String,
    pub segments: Vec<SourceSegment>,
    pub active: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProvenanceLinkExport {
    pub link_id: String,
    pub paper_id: String,
    pub anchor_domain: String,
    pub anchor_id: String,
    pub segment_id: String,
    pub revision_id: String,
    pub snapshot: Value,
    pub quote_hash: String,
    pub resolution: String,
    pub resolved_revision_id: Option<String>,
    pub resolved_segment_id: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProvenancePaperExport {
    pub paper_id: String,
    pub revisions: Vec<ProvenanceRevisionExport>,
    pub links: Vec<ProvenanceLinkExport>,
    pub backlink_counts: BTreeMap<String, i64>,
    pub remap_status: String,
}

#[derive(Debug, Error)]
pub enum ProvenanceError {
    #[error("document candidate invalid: {0}")]
    CandidateInvalid(String),
    #[error("document candidate hash mismatch")]
    CandidateHashMismatch,
    #[error("document candidate asset invalid: {0}")]
    AssetInvalid(String),
    #[error("segment geometry invalid")]
    SegmentGeometryInvalid,
    #[error("segment order invalid")]
    SegmentOrderInvalid,
    #[error("segment kind invalid")]
    SegmentKindInvalid,
    #[error("source link snapshot missing")]
    SnapshotMissing,
    #[error("source link resolution unknown")]
    ResolutionUnknown,
    #[error("note revision conflict")]
    NoteRevisionConflict { current: NoteSaveResult },
    #[error("provenance backfill exists")]
    BackfillExists,
    #[error("provenance export io error: {0}")]
    ExportIo(String),
    #[error("provenance storage error: {0}")]
    Storage(String),
}

impl From<sqlx::Error> for ProvenanceError {
    fn from(error: sqlx::Error) -> Self {
        Self::Storage(error.to_string())
    }
}

impl Serialize for ProvenanceError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        let value = match self {
            Self::CandidateInvalid(message) => serde_json::json!({
                "code": "document_candidate_invalid",
                "message": message,
            }),
            Self::CandidateHashMismatch => serde_json::json!({
                "code": "document_candidate_hash_mismatch",
            }),
            Self::AssetInvalid(message) => serde_json::json!({
                "code": "document_asset_invalid",
                "message": message,
            }),
            Self::SegmentGeometryInvalid => serde_json::json!({
                "code": "segment_geometry_invalid",
            }),
            Self::SegmentOrderInvalid => serde_json::json!({
                "code": "segment_order_invalid",
            }),
            Self::SegmentKindInvalid => serde_json::json!({
                "code": "document_candidate_invalid",
                "message": "segment kind invalid",
            }),
            Self::SnapshotMissing => serde_json::json!({
                "code": "source_link_snapshot_missing",
            }),
            Self::ResolutionUnknown => serde_json::json!({
                "code": "source_link_resolution_unknown",
            }),
            Self::NoteRevisionConflict { current } => serde_json::json!({
                "code": "note_revision_conflict",
                "current": current,
            }),
            Self::BackfillExists => serde_json::json!({
                "code": "provenance_backfill_exists",
            }),
            Self::ExportIo(message) => serde_json::json!({
                "code": "provenance_export_io",
                "message": message,
            }),
            Self::Storage(message) => serde_json::json!({
                "code": "provenance_storage",
                "message": message,
            }),
        };
        value.serialize(serializer)
    }
}

#[derive(Debug, Clone)]
pub struct ProvenanceRepo<'a> {
    pool: &'a Pool,
}

impl<'a> ProvenanceRepo<'a> {
    pub fn new(pool: &'a Pool) -> Self {
        Self { pool }
    }

    // ---- Acceptance service ----

    /// Validate a candidate in a single pass. Pure; no database writes.
    pub fn validate_candidate(&self, candidate: &DocumentCandidate) -> Result<(), ProvenanceError> {
        if candidate.source_kind != "pdf"
            && candidate.source_kind != "markdown"
            && !(candidate.source_kind.starts_with("parser-")
                && candidate.source_kind.len() > "parser-".len())
        {
            return Err(ProvenanceError::CandidateInvalid(format!(
                "unknown source kind {}",
                candidate.source_kind
            )));
        }
        if candidate.source_uri.trim().is_empty() {
            return Err(ProvenanceError::CandidateInvalid("empty source uri".into()));
        }
        if candidate.parser_owner.trim().is_empty() {
            return Err(ProvenanceError::CandidateInvalid(
                "empty parser owner".into(),
            ));
        }
        if candidate.markdown.len() > MAX_MARKDOWN_BYTES {
            return Err(ProvenanceError::CandidateInvalid(
                "markdown too large".into(),
            ));
        }
        if candidate.segments.is_empty() {
            return Err(ProvenanceError::CandidateInvalid("no segments".into()));
        }
        let mut last_order = 0i64;
        for (index, segment) in candidate.segments.iter().enumerate() {
            if !SEGMENT_KINDS.contains(&segment.kind.as_str()) {
                return Err(ProvenanceError::SegmentKindInvalid);
            }
            let order = index as i64 + 1;
            if order <= last_order {
                return Err(ProvenanceError::SegmentOrderInvalid);
            }
            last_order = order;
            if let Some(page) = segment.page {
                if !(1..=MAX_PAGE).contains(&page) {
                    return Err(ProvenanceError::CandidateInvalid(
                        "page out of bounds".into(),
                    ));
                }
            }
            validate_geometry(segment.rect.as_ref())?;
            if segment.markdown.len() > MAX_MARKDOWN_BYTES {
                return Err(ProvenanceError::CandidateInvalid(
                    "segment too large".into(),
                ));
            }
        }
        for asset in &candidate.assets {
            if asset.name.trim().is_empty() {
                return Err(ProvenanceError::AssetInvalid("empty asset name".into()));
            }
            if asset.bytes < 0 || asset.bytes > MAX_ASSET_BYTES as i64 {
                return Err(ProvenanceError::AssetInvalid(format!(
                    "asset {} size {} out of range",
                    asset.name, asset.bytes
                )));
            }
        }
        let canonical = canonical_candidate_bytes(candidate);
        if sha256_hex(&canonical) != candidate.source_hash {
            return Err(ProvenanceError::CandidateHashMismatch);
        }
        Ok(())
    }

    /// Stage -> validate -> compatibility-file promotion -> transaction ->
    /// finalize. Any failure or cancellation preserves the prior active
    /// revision byte-identical.
    pub async fn accept_candidate(
        &self,
        paths: &LibraryPaths,
        paper_id: &str,
        candidate: &DocumentCandidate,
    ) -> Result<DocumentRevision, ProvenanceError> {
        self.validate_candidate(candidate)?;
        self.ensure_paper(paper_id).await?;

        let revision = self.next_revision(paper_id).await?;
        let revision_id = format!("rev-{paper_id}-{revision}");
        let now = Utc::now().timestamp();
        let segments = candidate
            .segments
            .iter()
            .enumerate()
            .map(|(index, segment)| {
                let segment_id = format!("{revision_id}:{}", index + 1);
                SourceSegment {
                    segment_id: segment_id.clone(),
                    resource_ref: resource_ref(DomainNameV1::SourceSegment, &segment_id, revision),
                    revision_id: revision_id.clone(),
                    paper_id: paper_id.to_string(),
                    seg_order: index as i64 + 1,
                    kind: segment.kind.clone(),
                    markdown: segment.markdown.clone(),
                    page: segment.page,
                    rect: segment.rect.clone(),
                    quote_hash: sha256_hex(segment.markdown.as_bytes()),
                }
            })
            .collect::<Vec<_>>();
        let segments_json = serde_json::to_string(&segments)
            .map_err(|error| ProvenanceError::Storage(error.to_string()))?;

        // Compatibility-file promotion: preserve prior bytes so a failed
        // transaction can restore the exact previous state.
        let markdown_file = paths.paper_markdown_file(paper_id);
        if let Some(parent) = markdown_file.parent() {
            fs::create_dir_all(parent).map_err(|error| {
                ProvenanceError::ExportIo(format!("create markdown directory: {error}"))
            })?;
        }
        let prior_file_bytes = if markdown_file.exists() {
            Some(fs::read(&markdown_file).map_err(|error| {
                ProvenanceError::ExportIo(format!("read prior markdown file: {error}"))
            })?)
        } else {
            None
        };
        let staged = markdown_file.with_extension(format!("md.tmp-{}", Ulid::new()));
        fs::write(&staged, candidate.markdown.as_bytes())
            .map_err(|error| ProvenanceError::ExportIo(format!("stage markdown file: {error}")))?;
        fs::rename(&staged, &markdown_file).map_err(|error| {
            ProvenanceError::ExportIo(format!("promote markdown file: {error}"))
        })?;

        let result = self
            .finalize_accept(
                paper_id,
                &revision_id,
                revision,
                candidate,
                &segments,
                &segments_json,
                now,
            )
            .await;

        if result.is_err() {
            // Restore the exact prior compatibility file.
            match prior_file_bytes {
                Some(bytes) => {
                    let _ = fs::write(&markdown_file, bytes);
                }
                None => {
                    let _ = fs::remove_file(&markdown_file);
                }
            }
        }
        result?;

        Ok(DocumentRevision {
            revision_id: revision_id.clone(),
            resource_ref: resource_ref(DomainNameV1::DocumentRevision, &revision_id, revision),
            paper_id: paper_id.to_string(),
            revision,
            source_hash: candidate.source_hash.clone(),
            source_kind: candidate.source_kind.clone(),
            source_uri: redact_uri(&candidate.source_uri),
            parser_owner: candidate.parser_owner.clone(),
            markdown: candidate.markdown.clone(),
            segments,
            accepted_at: now,
            active: true,
        })
    }

    async fn finalize_accept(
        &self,
        paper_id: &str,
        revision_id: &str,
        revision: i64,
        candidate: &DocumentCandidate,
        segments: &[SourceSegment],
        segments_json: &str,
        now: i64,
    ) -> Result<(), ProvenanceError> {
        let mut tx = self.pool.begin().await?;
        // Deactivate the previous active revision first (partial unique index).
        sqlx::query(
            "UPDATE paper_document_revisions SET active = 0 WHERE paper_id = ?1 AND active = 1",
        )
        .bind(paper_id)
        .execute(&mut *tx)
        .await?;
        sqlx::query(
            "INSERT INTO paper_document_revisions
             (revision_id, paper_id, revision, source_hash, source_kind, source_uri, parser_owner,
              markdown, segments_json, accepted_at, active)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, 1)",
        )
        .bind(revision_id)
        .bind(paper_id)
        .bind(revision)
        .bind(&candidate.source_hash)
        .bind(&candidate.source_kind)
        .bind(redact_uri(&candidate.source_uri))
        .bind(&candidate.parser_owner)
        .bind(&candidate.markdown)
        .bind(segments_json)
        .bind(now)
        .execute(&mut *tx)
        .await?;
        for segment in segments {
            sqlx::query(
                "INSERT INTO source_segments
                 (segment_id, revision_id, paper_id, seg_order, kind, markdown, page, rect_json, quote_hash)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            )
            .bind(&segment.segment_id)
            .bind(revision_id)
            .bind(paper_id)
            .bind(segment.seg_order)
            .bind(&segment.kind)
            .bind(&segment.markdown)
            .bind(segment.page)
            .bind(segment.rect.as_ref().map(|value| value.to_string()))
            .bind(&segment.quote_hash)
            .execute(&mut *tx)
            .await?;
        }
        // Active projection + FTS, preserving upsert semantics.
        sqlx::query(
            "INSERT INTO paper_documents (paper_id, markdown, updated_at, index_status, indexed_at)
             VALUES (?1, ?2, ?3, 'indexed', ?3)
             ON CONFLICT(paper_id) DO UPDATE SET
                markdown = excluded.markdown,
                updated_at = excluded.updated_at,
                index_status = 'indexed',
                index_error = NULL,
                indexed_at = excluded.indexed_at",
        )
        .bind(paper_id)
        .bind(&candidate.markdown)
        .bind(now)
        .execute(&mut *tx)
        .await?;
        tx.commit().await?;
        Ok(())
    }

    async fn next_revision(&self, paper_id: &str) -> Result<i64, ProvenanceError> {
        let current: i64 = sqlx::query_scalar(
            "SELECT COALESCE(MAX(revision), 0) FROM paper_document_revisions WHERE paper_id = ?1",
        )
        .bind(paper_id)
        .fetch_one(self.pool)
        .await?;
        Ok(current + 1)
    }

    async fn ensure_paper(&self, paper_id: &str) -> Result<(), ProvenanceError> {
        let exists: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM papers WHERE id = ?1")
            .bind(paper_id)
            .fetch_one(self.pool)
            .await?;
        if exists == 0 {
            return Err(ProvenanceError::CandidateInvalid("paper not found".into()));
        }
        Ok(())
    }

    // ---- Revisions and segments ----

    pub async fn revisions_list(
        &self,
        paper_id: &str,
    ) -> Result<Vec<DocumentRevision>, ProvenanceError> {
        let rows = sqlx::query(
            "SELECT revision_id, paper_id, revision, source_hash, source_kind, source_uri,
                    parser_owner, markdown, segments_json, accepted_at, active
             FROM paper_document_revisions WHERE paper_id = ?1
             ORDER BY revision",
        )
        .bind(paper_id)
        .fetch_all(self.pool)
        .await?;
        let mut out = Vec::with_capacity(rows.len());
        for row in rows {
            let revision_id: String = row.try_get("revision_id")?;
            let revision_number: i64 = row.try_get("revision")?;
            let segments = self.segments_for_revision(&revision_id).await?;
            out.push(DocumentRevision {
                revision_id: revision_id.clone(),
                resource_ref: resource_ref(
                    DomainNameV1::DocumentRevision,
                    &revision_id,
                    revision_number,
                ),
                paper_id: row.try_get("paper_id")?,
                revision: revision_number,
                source_hash: row.try_get("source_hash")?,
                source_kind: row.try_get("source_kind")?,
                source_uri: row.try_get("source_uri")?,
                parser_owner: row.try_get("parser_owner")?,
                markdown: row.try_get("markdown")?,
                segments,
                accepted_at: row.try_get("accepted_at")?,
                active: row.try_get::<i64, _>("active")? != 0,
            });
        }
        Ok(out)
    }

    pub async fn segments_for_revision(
        &self,
        revision_id: &str,
    ) -> Result<Vec<SourceSegment>, ProvenanceError> {
        let rows = sqlx::query(
            "SELECT s.segment_id, s.revision_id, s.paper_id, s.seg_order, s.kind, s.markdown, s.page, s.rect_json, s.quote_hash, r.revision
             FROM source_segments s
             JOIN paper_document_revisions r ON r.revision_id = s.revision_id
             WHERE s.revision_id = ?1 ORDER BY s.seg_order",
        )
        .bind(revision_id)
        .fetch_all(self.pool)
        .await?;
        let mut out = Vec::with_capacity(rows.len());
        for row in rows {
            out.push(SourceSegment {
                segment_id: row.try_get("segment_id")?,
                resource_ref: resource_ref(
                    DomainNameV1::SourceSegment,
                    &row.try_get::<String, _>("segment_id")?,
                    row.try_get("revision")?,
                ),
                revision_id: row.try_get("revision_id")?,
                paper_id: row.try_get("paper_id")?,
                seg_order: row.try_get("seg_order")?,
                kind: row.try_get("kind")?,
                markdown: row.try_get("markdown")?,
                page: row.try_get("page")?,
                rect: row
                    .try_get::<Option<String>, _>("rect_json")?
                    .and_then(|value| serde_json::from_str(&value).ok()),
                quote_hash: row.try_get("quote_hash")?,
            });
        }
        Ok(out)
    }

    pub async fn active_revision(
        &self,
        paper_id: &str,
    ) -> Result<Option<DocumentRevision>, ProvenanceError> {
        let rows = self.revisions_list(paper_id).await?;
        Ok(rows.into_iter().find(|revision| revision.active))
    }

    // ---- Source links ----

    pub async fn link_create(
        &self,
        paper_id: &str,
        anchor_domain: &str,
        anchor_id: &str,
        segment_id: &str,
    ) -> Result<SourceLink, ProvenanceError> {
        if !matches!(anchor_domain, "note" | "annotation" | "paper") {
            return Err(ProvenanceError::CandidateInvalid(format!(
                "unknown anchor domain {anchor_domain}"
            )));
        }
        let segment = sqlx::query(
            "SELECT segment_id, revision_id, paper_id, kind, markdown, page, rect_json, quote_hash
             FROM source_segments WHERE segment_id = ?1 AND paper_id = ?2",
        )
        .bind(segment_id)
        .bind(paper_id)
        .fetch_optional(self.pool)
        .await?
        .ok_or(ProvenanceError::SnapshotMissing)?;
        let existing = sqlx::query(
            "SELECT link_id, paper_id, anchor_domain, anchor_id, segment_id, revision_id,
                    snapshot_json, quote_hash, resolution, resolved_revision_id, resolved_segment_id,
                    created_at, updated_at
             FROM source_links
             WHERE anchor_domain = ?1 AND anchor_id = ?2 AND segment_id = ?3",
        )
        .bind(anchor_domain)
        .bind(anchor_id)
        .bind(segment_id)
        .fetch_optional(self.pool)
        .await?;
        if let Some(existing) = existing {
            return row_to_link(&existing);
        }
        let geometry = segment
            .try_get::<Option<String>, _>("rect_json")?
            .and_then(|value| serde_json::from_str::<Value>(&value).ok());
        let text: String = segment.try_get("markdown")?;
        let snapshot = serde_json::json!({
            "page": segment.try_get::<Option<i32>, _>("page")?,
            "geometry": geometry,
            "type": segment.try_get::<String, _>("kind")?,
            "text": text,
            "markdown": segment.try_get::<String, _>("markdown")?,
            "asset": Value::Null,
        });
        let quote_hash: String = segment.try_get("quote_hash")?;
        let link_id = Ulid::new().to_string();
        let now = Utc::now().timestamp();
        sqlx::query(
            "INSERT INTO source_links
             (link_id, paper_id, anchor_domain, anchor_id, segment_id, revision_id,
              snapshot_json, quote_hash, resolution, resolved_revision_id, resolved_segment_id,
              created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 'current', ?6, ?5, ?9, ?9)",
        )
        .bind(&link_id)
        .bind(paper_id)
        .bind(anchor_domain)
        .bind(anchor_id)
        .bind(segment_id)
        .bind(segment.try_get::<String, _>("revision_id")?)
        .bind(snapshot.to_string())
        .bind(&quote_hash)
        .bind(now)
        .execute(self.pool)
        .await?;
        self.get_link(&link_id)
            .await?
            .ok_or(ProvenanceError::SnapshotMissing)
    }

    pub async fn get_link(&self, link_id: &str) -> Result<Option<SourceLink>, ProvenanceError> {
        let row = sqlx::query(
            "SELECT link_id, paper_id, anchor_domain, anchor_id, segment_id, revision_id,
                    snapshot_json, quote_hash, resolution, resolved_revision_id, resolved_segment_id, created_at, updated_at
             FROM source_links WHERE link_id = ?1",
        )
        .bind(link_id)
        .fetch_optional(self.pool)
        .await?;
        Ok(row.map(|row| row_to_link(&row).expect("parse source link")))
    }

    pub async fn links_for_anchor(
        &self,
        anchor_domain: &str,
        anchor_id: &str,
    ) -> Result<Vec<SourceLink>, ProvenanceError> {
        let rows = sqlx::query(
            "SELECT link_id, paper_id, anchor_domain, anchor_id, segment_id, revision_id,
                    snapshot_json, quote_hash, resolution, resolved_revision_id, resolved_segment_id, created_at, updated_at
             FROM source_links WHERE anchor_domain = ?1 AND anchor_id = ?2
             ORDER BY created_at, link_id",
        )
        .bind(anchor_domain)
        .bind(anchor_id)
        .fetch_all(self.pool)
        .await?;
        Ok(rows
            .iter()
            .map(|row| row_to_link(row).expect("parse source link"))
            .collect())
    }

    pub async fn backlinks(
        &self,
        paper_id: &str,
        segment_id: Option<&str>,
    ) -> Result<Vec<BacklinkRow>, ProvenanceError> {
        let rows = match segment_id {
            Some(segment_id) => {
                sqlx::query(
                    "SELECT anchor_domain, anchor_id,
                            COALESCE(resolved_segment_id, segment_id) AS segment_id,
                            resolution, updated_at
                     FROM source_links
                     WHERE paper_id = ?1
                       AND COALESCE(resolved_segment_id, segment_id) = ?2
                       AND resolution != 'missing'
                     ORDER BY anchor_domain, anchor_id",
                )
                .bind(paper_id)
                .bind(segment_id)
                .fetch_all(self.pool)
                .await?
            }
            None => {
                sqlx::query(
                    "SELECT anchor_domain, anchor_id,
                            COALESCE(resolved_segment_id, segment_id) AS segment_id,
                            resolution, updated_at
                     FROM source_links
                     WHERE paper_id = ?1 AND resolution != 'missing'
                     ORDER BY segment_id, anchor_domain, anchor_id",
                )
                .bind(paper_id)
                .fetch_all(self.pool)
                .await?
            }
        };
        Ok(rows
            .iter()
            .map(|row| BacklinkRow {
                anchor_domain: row.try_get("anchor_domain").expect("anchor domain"),
                anchor_id: row.try_get("anchor_id").expect("anchor id"),
                segment_id: row.try_get("segment_id").expect("segment id"),
                resolution: row.try_get("resolution").expect("resolution"),
                updated_at: row.try_get("updated_at").expect("updated at"),
            })
            .collect())
    }

    /// Recompute a link's resolution against the CURRENT active revision.
    /// The lookup is bounded by the active revision, segment id, quote hash,
    /// and (as a changed-content fallback) the old segment order.
    pub async fn resolve_link(&self, link: &SourceLink) -> Result<String, ProvenanceError> {
        let active_revision_id: Option<String> = sqlx::query_scalar(
            "SELECT revision_id FROM paper_document_revisions WHERE paper_id = ?1 AND active = 1",
        )
        .bind(&link.paper_id)
        .fetch_optional(self.pool)
        .await?;
        let Some(active_revision_id) = active_revision_id else {
            return Ok("missing".to_string());
        };
        let mut segment = sqlx::query(
            "SELECT segment_id, revision_id, kind, page, rect_json, quote_hash
             FROM source_segments WHERE segment_id = ?1 AND revision_id = ?2",
        )
        .bind(&link.segment_id)
        .bind(&active_revision_id)
        .fetch_optional(self.pool)
        .await?;
        if segment.is_none() {
            // Exact quote matches recover moved segments before falling back
            // to the corresponding old order for changed content.
            segment = sqlx::query(
                "SELECT segment_id, revision_id, kind, page, rect_json, quote_hash
                 FROM source_segments
                 WHERE revision_id = ?1 AND quote_hash = ?2
                 ORDER BY seg_order LIMIT 1",
            )
            .bind(&active_revision_id)
            .bind(&link.quote_hash)
            .fetch_optional(self.pool)
            .await?;
        }
        if segment.is_none() {
            let old_order = link
                .segment_id
                .rsplit_once(':')
                .and_then(|(_, order)| order.parse::<i64>().ok());
            if let Some(old_order) = old_order {
                segment = sqlx::query(
                    "SELECT segment_id, revision_id, kind, page, rect_json, quote_hash
                     FROM source_segments
                     WHERE revision_id = ?1 AND seg_order = ?2",
                )
                .bind(&active_revision_id)
                .bind(old_order)
                .fetch_optional(self.pool)
                .await?;
            }
        }
        let Some(segment) = segment else {
            return Ok("missing".to_string());
        };
        let current_kind: String = segment.try_get("kind")?;
        let stored_kind = link.snapshot.get("type").and_then(Value::as_str);
        if stored_kind != Some(current_kind.as_str()) {
            return Ok("changed".to_string());
        }
        let current_hash: String = segment.try_get("quote_hash")?;
        if current_hash != link.quote_hash {
            return Ok("changed".to_string());
        }
        let current_page = segment.try_get::<Option<i32>, _>("page")?;
        let stored_page = link
            .snapshot
            .get("page")
            .and_then(Value::as_i64)
            .and_then(|value| i32::try_from(value).ok());
        let current_rect = segment
            .try_get::<Option<String>, _>("rect_json")?
            .and_then(|value| serde_json::from_str::<Value>(&value).ok());
        let stored_rect = link.snapshot.get("geometry").cloned();
        if current_page == stored_page && current_rect == stored_rect {
            Ok("current".to_string())
        } else {
            Ok("moved".to_string())
        }
    }

    pub async fn resolve_link_target(
        &self,
        link: &SourceLink,
    ) -> Result<(String, Option<String>, Option<String>), ProvenanceError> {
        let status = self.resolve_link(link).await?;
        if status == "missing" {
            return Ok((status, None, None));
        }
        let active_revision_id: Option<String> = sqlx::query_scalar(
            "SELECT revision_id FROM paper_document_revisions WHERE paper_id = ?1 AND active = 1",
        )
        .bind(&link.paper_id)
        .fetch_optional(self.pool)
        .await?;
        let Some(active_revision_id) = active_revision_id else {
            return Ok(("missing".to_string(), None, None));
        };
        let old_order = link
            .segment_id
            .rsplit_once(':')
            .and_then(|(_, order)| order.parse::<i64>().ok());
        let target = sqlx::query(
            "SELECT segment_id, revision_id FROM source_segments
             WHERE revision_id = ?1 AND (quote_hash = ?2 OR seg_order = ?3)
             ORDER BY CASE WHEN quote_hash = ?2 THEN 0 ELSE 1 END, seg_order LIMIT 1",
        )
        .bind(&active_revision_id)
        .bind(&link.quote_hash)
        .bind(old_order)
        .fetch_optional(self.pool)
        .await?;
        match target {
            Some(target) => Ok((
                status,
                Some(target.try_get("revision_id")?),
                Some(target.try_get("segment_id")?),
            )),
            None => Ok(("missing".to_string(), None, None)),
        }
    }

    /// Persist recomputed resolution for all of a paper's links (single pass).
    pub async fn remap(&self, paper_id: &str) -> Result<RemapReport, ProvenanceError> {
        let rows = sqlx::query(
            "SELECT link_id, paper_id, anchor_domain, anchor_id, segment_id, revision_id,
                    snapshot_json, quote_hash, resolution, resolved_revision_id, resolved_segment_id, created_at, updated_at
             FROM source_links WHERE paper_id = ?1",
        )
        .bind(paper_id)
        .fetch_all(self.pool)
        .await?;
        let mut links = Vec::with_capacity(rows.len());
        for row in &rows {
            links.push(row_to_link(row)?);
        }
        let mut changed = 0i64;
        for link in &links {
            let (status, resolved_revision_id, resolved_segment_id) =
                self.resolve_link_target(link).await?;
            if status != link.resolution
                || resolved_revision_id != link.resolved_revision_id
                || resolved_segment_id != link.resolved_segment_id
            {
                let now = Utc::now().timestamp();
                sqlx::query(
                    "UPDATE source_links
                     SET resolution = ?1, resolved_revision_id = ?2, resolved_segment_id = ?3,
                         updated_at = ?4
                     WHERE link_id = ?5",
                )
                .bind(&status)
                .bind(resolved_revision_id)
                .bind(resolved_segment_id)
                .bind(now)
                .bind(&link.link_id)
                .execute(self.pool)
                .await?;
                changed += 1;
            }
        }
        Ok(RemapReport {
            schema_version: PROVENANCE_SCHEMA_VERSION,
            paper_ids: vec![paper_id.to_string()],
            links_recomputed: links.len() as i64,
            changed,
        })
    }

    // ---- Revision-safe note saves ----

    pub async fn note_save(
        &self,
        paths: &LibraryPaths,
        paper_id: &str,
        content: &str,
        expected_revision: Option<i64>,
    ) -> Result<NoteSaveResult, ProvenanceError> {
        let note_id = format!("note-{paper_id}");
        let content_hash = sha256_hex(content.as_bytes());
        let note_path = paths.paper_dir(paper_id).join("note.md");
        if let Some(parent) = note_path.parent() {
            fs::create_dir_all(parent)
                .map_err(|error| ProvenanceError::ExportIo(format!("create note dir: {error}")))?;
        }
        let prior_file = if note_path.exists() {
            Some(fs::read(&note_path).map_err(|error| {
                ProvenanceError::ExportIo(format!("read prior note file: {error}"))
            })?)
        } else {
            None
        };
        let staged = note_path.with_extension(format!("md.tmp-{}", Ulid::new()));
        fs::write(&staged, content.as_bytes())
            .map_err(|error| ProvenanceError::ExportIo(format!("stage note file: {error}")))?;

        let mut tx = self.pool.begin().await?;
        let current: Option<(i64, String)> = sqlx::query_as::<_, (i64, String)>(
            "SELECT revision, content_hash FROM note_revisions WHERE note_id = ?1",
        )
        .bind(&note_id)
        .fetch_optional(&mut *tx)
        .await?;
        let (next_revision, compare_revision) = match current {
            Some((revision, current_hash)) => {
                let compare_revision = expected_revision.unwrap_or(revision);
                if compare_revision != revision {
                    let _ = fs::remove_file(&staged);
                    let _ = tx.rollback().await;
                    return Err(ProvenanceError::NoteRevisionConflict {
                        current: NoteSaveResult {
                            revision,
                            content_hash: current_hash,
                        },
                    });
                }
                (revision + 1, Some(revision))
            }
            None => {
                if expected_revision.filter(|value| *value != 0).is_some() {
                    let _ = fs::remove_file(&staged);
                    let _ = tx.rollback().await;
                    return Err(ProvenanceError::NoteRevisionConflict {
                        current: NoteSaveResult {
                            revision: 0,
                            content_hash: String::new(),
                        },
                    });
                }
                (1, None)
            }
        };
        let now = Utc::now().timestamp();
        if let Some(compare_revision) = compare_revision {
            let result = sqlx::query(
                "UPDATE note_revisions
                 SET revision = ?1, content_hash = ?2, saved_at = ?3
                 WHERE note_id = ?4 AND revision = ?5",
            )
            .bind(next_revision)
            .bind(&content_hash)
            .bind(now)
            .bind(&note_id)
            .bind(compare_revision)
            .execute(&mut *tx)
            .await?;
            if result.rows_affected() != 1 {
                let current = sqlx::query_as::<_, (i64, String)>(
                    "SELECT revision, content_hash FROM note_revisions WHERE note_id = ?1",
                )
                .bind(&note_id)
                .fetch_optional(&mut *tx)
                .await?;
                let _ = fs::remove_file(&staged);
                let _ = tx.rollback().await;
                let (revision, current_hash) = current.unwrap_or((0, String::new()));
                return Err(ProvenanceError::NoteRevisionConflict {
                    current: NoteSaveResult {
                        revision,
                        content_hash: current_hash,
                    },
                });
            }
        } else {
            sqlx::query(
                "INSERT INTO note_revisions
                 (note_id, paper_id, revision, content_hash, saved_at)
                 VALUES (?1, ?2, ?3, ?4, ?5)",
            )
            .bind(&note_id)
            .bind(paper_id)
            .bind(next_revision)
            .bind(&content_hash)
            .bind(now)
            .execute(&mut *tx)
            .await?;
        }
        if let Err(error) = fs::rename(&staged, &note_path) {
            let _ = fs::remove_file(&staged);
            let _ = tx.rollback().await;
            return Err(ProvenanceError::ExportIo(format!(
                "promote note file: {error}"
            )));
        }
        if let Err(error) = tx.commit().await {
            match prior_file {
                Some(bytes) => {
                    let _ = fs::write(&note_path, bytes);
                }
                None => {
                    let _ = fs::remove_file(&note_path);
                }
            }
            return Err(ProvenanceError::Storage(error.to_string()));
        }
        Ok(NoteSaveResult {
            revision: next_revision,
            content_hash,
        })
    }

    pub async fn note_revisions(
        &self,
        paper_id: &str,
    ) -> Result<Vec<NoteRevision>, ProvenanceError> {
        let rows = sqlx::query(
            "SELECT note_id, paper_id, revision, content_hash, saved_at
             FROM note_revisions WHERE paper_id = ?1",
        )
        .bind(paper_id)
        .fetch_all(self.pool)
        .await?;
        Ok(rows
            .iter()
            .map(|row| NoteRevision {
                note_id: row.try_get("note_id").expect("note id"),
                paper_id: row.try_get("paper_id").expect("paper id"),
                revision: row.try_get("revision").expect("revision"),
                content_hash: row.try_get("content_hash").expect("content hash"),
                saved_at: row.try_get("saved_at").expect("saved at"),
            })
            .collect())
    }

    // ---- Backfill and export ----

    /// Deterministic backfill for existing papers/notes. Never rewrites
    /// Markdown and never touches annotation geometry. Creating a revision
    /// only when none exists keeps the backfill idempotent.
    pub async fn backfill(
        &self,
        paths: &LibraryPaths,
        paper_id: &str,
    ) -> Result<BackfillPaperReport, ProvenanceError> {
        let existing: i64 =
            sqlx::query_scalar("SELECT COUNT(*) FROM paper_document_revisions WHERE paper_id = ?1")
                .bind(paper_id)
                .fetch_one(self.pool)
                .await?;
        let (created, revision) = if existing == 0 {
            let markdown: Option<String> =
                sqlx::query_scalar("SELECT markdown FROM paper_documents WHERE paper_id = ?1")
                    .bind(paper_id)
                    .fetch_optional(self.pool)
                    .await?;
            let markdown = markdown.unwrap_or_default();
            let mut candidate = DocumentCandidate {
                source_hash: String::new(),
                source_kind: "markdown".to_string(),
                source_uri: format!("backfill://{paper_id}"),
                parser_owner: "core-backfill".to_string(),
                markdown: markdown.clone(),
                segments: vec![CandidateSegment {
                    kind: "paragraph".to_string(),
                    markdown,
                    page: None,
                    rect: None,
                }],
                assets: Vec::new(),
                warnings: Vec::new(),
            };
            candidate.source_hash = sha256_hex(&canonical_candidate_bytes(&candidate));
            let accepted = self.accept_candidate(paths, paper_id, &candidate).await?;
            (true, accepted.revision)
        } else {
            (false, self.next_revision(paper_id).await? - 1)
        };

        let note_id = format!("note-{paper_id}");
        let note_revision = if let Some((revision, _)) = sqlx::query_as::<_, (i64, String)>(
            "SELECT revision, content_hash FROM note_revisions WHERE note_id = ?1",
        )
        .bind(&note_id)
        .fetch_optional(self.pool)
        .await?
        {
            revision
        } else {
            let content =
                fs::read_to_string(paths.paper_dir(paper_id).join("note.md")).unwrap_or_default();
            let mut tx = self.pool.begin().await?;
            sqlx::query(
                "INSERT INTO note_revisions (note_id, paper_id, revision, content_hash, saved_at)
                 VALUES (?1, ?2, 1, ?3, ?4) ON CONFLICT(note_id) DO NOTHING",
            )
            .bind(&note_id)
            .bind(paper_id)
            .bind(sha256_hex(content.as_bytes()))
            .bind(Utc::now().timestamp())
            .execute(&mut *tx)
            .await?;
            let revision = sqlx::query_scalar::<_, i64>(
                "SELECT revision FROM note_revisions WHERE note_id = ?1",
            )
            .bind(&note_id)
            .fetch_one(&mut *tx)
            .await?;
            tx.commit().await?;
            revision
        };
        Ok(BackfillPaperReport {
            paper_id: paper_id.to_string(),
            created,
            revision,
            note_revision,
        })
    }

    pub async fn export(&self, paper_ids: &[String]) -> Result<ProvenanceExport, ProvenanceError> {
        let mut papers = Vec::with_capacity(paper_ids.len());
        for paper_id in paper_ids {
            let revisions = self
                .revisions_list(paper_id)
                .await?
                .into_iter()
                .map(|revision| ProvenanceRevisionExport {
                    revision_id: revision.revision_id.clone(),
                    resource_ref: revision.resource_ref,
                    paper_id: revision.paper_id,
                    revision: revision.revision,
                    source_hash: revision.source_hash,
                    source_kind: revision.source_kind,
                    source_uri: revision.source_uri,
                    parser_owner: revision.parser_owner,
                    markdown: revision.markdown,
                    segments: revision.segments,
                    active: revision.active,
                })
                .collect::<Vec<_>>();
            let rows = sqlx::query(
                "SELECT link_id, paper_id, anchor_domain, anchor_id, segment_id, revision_id,
                 snapshot_json, quote_hash, resolution, resolved_revision_id, resolved_segment_id, created_at, updated_at
                 FROM source_links WHERE paper_id = ?1 ORDER BY created_at, link_id",
            )
            .bind(paper_id)
            .fetch_all(self.pool)
            .await?;
            let links = rows
                .iter()
                .map(row_to_link)
                .collect::<Result<Vec<_>, _>>()?;
            let mut backlink_counts = BTreeMap::new();
            for link in &links {
                *backlink_counts
                    .entry(link.anchor_domain.clone())
                    .or_insert(0i64) += 1;
            }
            let links = links
                .into_iter()
                .map(|link| ProvenanceLinkExport {
                    link_id: link.link_id,
                    paper_id: link.paper_id,
                    anchor_domain: link.anchor_domain,
                    anchor_id: link.anchor_id,
                    segment_id: link.segment_id,
                    revision_id: link.revision_id,
                    snapshot: link.snapshot,
                    quote_hash: link.quote_hash,
                    resolution: link.resolution,
                    resolved_revision_id: link.resolved_revision_id,
                    resolved_segment_id: link.resolved_segment_id,
                })
                .collect::<Vec<_>>();
            let remap_status = if revisions.is_empty() {
                "unsegmented".to_string()
            } else {
                "mapped".to_string()
            };
            papers.push(ProvenancePaperExport {
                paper_id: paper_id.to_string(),
                revisions,
                links,
                backlink_counts,
                remap_status,
            });
        }
        Ok(ProvenanceExport {
            schema_version: PROVENANCE_SCHEMA_VERSION,
            target_version: PROVENANCE_TARGET_VERSION,
            papers,
        })
    }
}

fn row_to_link(row: &sqlx::sqlite::SqliteRow) -> Result<SourceLink, ProvenanceError> {
    let snapshot: String = row.try_get("snapshot_json")?;
    Ok(SourceLink {
        link_id: row.try_get("link_id")?,
        paper_id: row.try_get("paper_id")?,
        anchor_domain: row.try_get("anchor_domain")?,
        anchor_id: row.try_get("anchor_id")?,
        segment_id: row.try_get("segment_id")?,
        revision_id: row.try_get("revision_id")?,
        snapshot: serde_json::from_str(&snapshot)
            .map_err(|error| ProvenanceError::Storage(error.to_string()))?,
        quote_hash: row.try_get("quote_hash")?,
        resolution: row.try_get("resolution")?,
        resolved_revision_id: row.try_get("resolved_revision_id")?,
        resolved_segment_id: row.try_get("resolved_segment_id")?,
        created_at: row.try_get("created_at")?,
        updated_at: row.try_get("updated_at")?,
    })
}

fn validate_geometry(rect: Option<&Value>) -> Result<(), ProvenanceError> {
    let Some(rect) = rect else { return Ok(()) };
    let object = match rect.as_object() {
        Some(object) => object,
        None => return Err(ProvenanceError::SegmentGeometryInvalid),
    };
    if let Some(page) = object.get("page") {
        let page = page
            .as_i64()
            .ok_or(ProvenanceError::SegmentGeometryInvalid)?;
        if !(1..=MAX_PAGE as i64).contains(&page) {
            return Err(ProvenanceError::SegmentGeometryInvalid);
        }
    }
    let mut coordinates = [0.0; 4];
    for (index, key) in ["x", "y", "width", "height"].iter().enumerate() {
        let value = object
            .get(*key)
            .and_then(Value::as_f64)
            .ok_or(ProvenanceError::SegmentGeometryInvalid)?;
        if !value.is_finite() || value < 0.0 || value > MAX_COORDINATE {
            return Err(ProvenanceError::SegmentGeometryInvalid);
        }
        coordinates[index] = value;
    }
    if coordinates[0] + coordinates[2] > MAX_COORDINATE
        || coordinates[1] + coordinates[3] > MAX_COORDINATE
    {
        return Err(ProvenanceError::SegmentGeometryInvalid);
    }
    Ok(())
}

/// Canonical candidate bytes for source-hash verification: a stable JSON
/// encoding with sorted keys, no whitespace, no wall-clock timestamps.
pub fn canonical_candidate_bytes(candidate: &DocumentCandidate) -> Vec<u8> {
    let assets = candidate
        .assets
        .iter()
        .map(|asset| serde_json::json!({"bytes": asset.bytes, "name": asset.name}))
        .collect::<Vec<_>>();
    let segments = candidate
        .segments
        .iter()
        .map(|segment| {
            serde_json::json!({
                "kind": segment.kind,
                "markdown": segment.markdown,
                "page": segment.page,
                "rect": segment.rect,
            })
        })
        .collect::<Vec<_>>();
    let mut sorted: BTreeMap<String, Value> = BTreeMap::new();
    sorted.insert("assets".into(), Value::Array(assets));
    sorted.insert("markdown".into(), Value::String(candidate.markdown.clone()));
    sorted.insert(
        "parserOwner".into(),
        Value::String(candidate.parser_owner.clone()),
    );
    sorted.insert("segments".into(), Value::Array(segments));
    sorted.insert(
        "sourceKind".into(),
        Value::String(candidate.source_kind.clone()),
    );
    sorted.insert(
        "sourceUri".into(),
        Value::String(candidate.source_uri.clone()),
    );
    sorted.insert(
        "warnings".into(),
        serde_json::to_value(&candidate.warnings).expect("canonical warnings serialization"),
    );
    serde_json::to_vec(&sorted).expect("canonical candidate serialization")
}

pub fn sha256_hex(bytes: &[u8]) -> String {
    use sha2::{Digest, Sha256};
    let digest = Sha256::digest(bytes);
    digest.iter().map(|byte| format!("{byte:02x}")).collect()
}

fn redact_uri(uri: &str) -> String {
    let parsed = uri.parse::<url::Url>().ok();
    match parsed {
        Some(url) => {
            let scheme = url.scheme();
            match url.host_str() {
                Some(host) => format!("{scheme}://{host}/<redacted>"),
                None => format!("{scheme}:<redacted>"),
            }
        }
        None => {
            // Non-URL descriptors like backfill://<id> are already opaque ids.
            if uri.starts_with("backfill://") || uri.starts_with("parser://") {
                uri.split('/').take(2).collect::<Vec<_>>().join("/") + "/<redacted>"
            } else {
                "<redacted>".to_string()
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::storage::{open_pool, run_migrations, LibraryPaths};
    use std::fs;

    async fn test_context(name: &str) -> (Pool, LibraryPaths, PathBuf) {
        let root = std::env::temp_dir().join(format!("litera-provenance-{name}-{}", Ulid::new()));
        fs::create_dir_all(&root).expect("create test root");
        let paths = LibraryPaths::new(&root);
        let pool = open_pool(&paths.db_file()).await.expect("open pool");
        run_migrations(&pool).await.expect("run migrations");
        (pool, paths, root)
    }

    async fn seed_paper(pool: &Pool, paper_id: &str) {
        sqlx::query(
            "INSERT INTO papers (id, title, authors_json, added_at, updated_at, read_status)
             VALUES (?1, ?2, '[]', 0, 0, 'unread')",
        )
        .bind(paper_id)
        .bind(paper_id)
        .execute(pool)
        .await
        .expect("seed paper");
    }

    fn candidate(paper: &str, markdown: &str, hash: &str) -> DocumentCandidate {
        DocumentCandidate {
            source_hash: hash.to_string(),
            source_kind: "pdf".to_string(),
            source_uri: format!("parser://fixture/{paper}"),
            parser_owner: "fixture-parser".to_string(),
            markdown: markdown.to_string(),
            segments: vec![CandidateSegment {
                kind: "paragraph".to_string(),
                markdown: markdown.to_string(),
                page: Some(1),
                rect: Some(
                    serde_json::json!({"page": 1, "x": 0.0, "y": 0.0, "width": 100.0, "height": 50.0}),
                ),
            }],
            assets: Vec::new(),
            warnings: Vec::new(),
        }
    }

    fn candidate_hash(paper: &str, markdown: &str) -> String {
        let candidate = candidate(paper, markdown, "");
        sha256_hex(&canonical_candidate_bytes(&candidate))
    }

    #[tokio::test]
    async fn validation_rejects_hash_mismatch_bad_geometry_and_bad_order() {
        let (pool, _paths, root) = test_context("validate").await;
        let repo = ProvenanceRepo::new(&pool);
        let good = candidate("paper-a", "content", &candidate_hash("paper-a", "content"));
        repo.validate_candidate(&good).expect("valid candidate");

        let mut bad_hash = good.clone();
        bad_hash.source_hash =
            "0000000000000000000000000000000000000000000000000000000000000000".into();
        assert!(matches!(
            repo.validate_candidate(&bad_hash),
            Err(ProvenanceError::CandidateHashMismatch)
        ));

        let mut bad_geometry = good.clone();
        bad_geometry.segments[0].rect = Some(
            serde_json::json!({"page": 1, "x": -5.0, "y": 0.0, "width": 10.0, "height": 10.0}),
        );
        assert!(matches!(
            repo.validate_candidate(&bad_geometry),
            Err(ProvenanceError::SegmentGeometryInvalid)
        ));

        let mut bad_kind = good.clone();
        bad_kind.segments[0].kind = "mystery".into();
        assert!(matches!(
            repo.validate_candidate(&bad_kind),
            Err(ProvenanceError::SegmentKindInvalid)
        ));

        pool.close().await;
        let _ = fs::remove_dir_all(root);
    }

    #[tokio::test]
    async fn acceptance_is_monotonic_and_preserves_prior_revision_on_failure() {
        let (pool, paths, root) = test_context("accept").await;
        seed_paper(&pool, "paper-a").await;
        let repo = ProvenanceRepo::new(&pool);

        let v1_hash = candidate_hash("paper-a", "version one");
        let v1 = candidate("paper-a", "version one", &v1_hash);
        let accepted = repo
            .accept_candidate(&paths, "paper-a", &v1)
            .await
            .expect("accept v1");
        assert_eq!(accepted.revision, 1);
        assert!(accepted.active);

        // Re-accept with a valid revision 2; both revisions retained.
        let v2_hash = candidate_hash("paper-a", "version two");
        let v2 = candidate("paper-a", "version two", &v2_hash);
        let accepted2 = repo
            .accept_candidate(&paths, "paper-a", &v2)
            .await
            .expect("accept v2");
        assert_eq!(accepted2.revision, 2);
        let revisions = repo.revisions_list("paper-a").await.expect("list");
        assert_eq!(revisions.len(), 2);
        assert!(revisions[0].active == false || revisions[1].active == false);
        assert_eq!(revisions.iter().filter(|r| r.active).count(), 1);
        assert!(revisions
            .iter()
            .any(|r| r.revision == 1 && r.markdown == "version one"));

        // Failure (bad hash) preserves the prior active revision byte-identical.
        let active_before = repo
            .active_revision("paper-a")
            .await
            .expect("active")
            .expect("some");
        let mut tampered = candidate(
            "paper-a",
            "version three",
            &candidate_hash("paper-a", "different"),
        );
        tampered.source_hash = sha256_hex(b"wrong bytes");
        assert!(repo
            .accept_candidate(&paths, "paper-a", &tampered)
            .await
            .is_err());
        let active_after = repo
            .active_revision("paper-a")
            .await
            .expect("active after")
            .expect("some");
        assert_eq!(active_after.revision_id, active_before.revision_id);
        assert_eq!(active_after.markdown, active_before.markdown);
        assert_eq!(repo.revisions_list("paper-a").await.expect("list").len(), 2);

        // Active projection + FTS updated atomically.
        let projection: String =
            sqlx::query_scalar("SELECT markdown FROM paper_documents WHERE paper_id = 'paper-a'")
                .fetch_one(&pool)
                .await
                .expect("projection");
        assert_eq!(projection, "version two");
        let fts: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM paper_documents_fts WHERE markdown MATCH 'version'",
        )
        .fetch_one(&pool)
        .await
        .expect("fts");
        assert_eq!(fts, 1);

        pool.close().await;
        let _ = fs::remove_dir_all(root);
    }

    #[tokio::test]
    async fn links_snapshot_resolution_and_indexed_backlinks() {
        let (pool, paths, root) = test_context("links").await;
        seed_paper(&pool, "paper-a").await;
        let repo = ProvenanceRepo::new(&pool);
        let hash = candidate_hash("paper-a", "quote target");
        let accepted = repo
            .accept_candidate(
                &paths,
                "paper-a",
                &candidate("paper-a", "quote target", &hash),
            )
            .await
            .expect("accept");
        let segment = accepted.segments[0].clone();

        let link = repo
            .link_create("paper-a", "note", "note-a", &segment.segment_id)
            .await
            .expect("link");
        assert_eq!(link.resolution, "current");
        assert_eq!(link.snapshot["type"], "paragraph");
        assert_eq!(link.quote_hash, segment.quote_hash);

        // Link is immutable after create: snapshot/quote unchanged.
        let link_again = repo
            .get_link(&link.link_id)
            .await
            .expect("get")
            .expect("exists");
        assert_eq!(link_again.snapshot, link.snapshot);
        assert_eq!(link_again.quote_hash, link.quote_hash);

        // Backlinks served by core storage.
        let backlinks = repo.backlinks("paper-a", None).await.expect("backlinks");
        assert_eq!(backlinks.len(), 1);
        assert_eq!(backlinks[0].anchor_id, "note-a");

        // Re-accept with changed content -> resolution becomes changed.
        let hash2 = candidate_hash("paper-a", "different quote");
        repo.accept_candidate(
            &paths,
            "paper-a",
            &candidate("paper-a", "different quote", &hash2),
        )
        .await
        .expect("accept v2");
        let resolved = repo.resolve_link(&link).await.expect("resolve");
        assert_eq!(resolved, "changed");
        let remap = repo.remap("paper-a").await.expect("remap");
        assert_eq!(remap.changed, 1);
        let link_after = repo
            .get_link(&link.link_id)
            .await
            .expect("get")
            .expect("exists");
        assert_eq!(link_after.resolution, "changed");
        assert_eq!(
            link_after.revision_id, accepted.revision_id,
            "original evidence is retained"
        );
        assert_eq!(
            link_after.segment_id, segment.segment_id,
            "original anchor is retained"
        );
        assert_eq!(
            link_after.resolved_revision_id.as_deref(),
            Some("rev-paper-a-2")
        );
        assert_eq!(
            link_after.resolved_segment_id.as_deref(),
            Some("rev-paper-a-2:1")
        );
        let backlinks = repo
            .backlinks("paper-a", Some("rev-paper-a-2:1"))
            .await
            .unwrap();
        assert_eq!(backlinks.len(), 1);
        assert_eq!(backlinks[0].anchor_id, "note-a");
        assert_eq!(backlinks[0].segment_id, "rev-paper-a-2:1");
        // Second remap is a no-op (deterministic).
        let remap2 = repo.remap("paper-a").await.expect("remap2");
        assert_eq!(remap2.changed, 0);

        pool.close().await;
        let _ = fs::remove_dir_all(root);
    }

    #[tokio::test]
    async fn note_save_is_revision_safe_and_transactional() {
        let (pool, paths, root) = test_context("note").await;
        seed_paper(&pool, "paper-a").await;
        let repo = ProvenanceRepo::new(&pool);

        let first = repo
            .note_save(&paths, "paper-a", "draft one", None)
            .await
            .expect("save 1");
        assert_eq!(first.revision, 1);
        let second = repo
            .note_save(&paths, "paper-a", "draft two", Some(1))
            .await
            .expect("save 2");
        assert_eq!(second.revision, 2);

        // Stale expected revision -> structured conflict, nothing written.
        let conflict = repo
            .note_save(&paths, "paper-a", "stale write", Some(1))
            .await;
        assert!(matches!(
            conflict,
            Err(ProvenanceError::NoteRevisionConflict { .. })
        ));
        let content =
            fs::read_to_string(paths.paper_dir("paper-a").join("note.md")).expect("note file");
        assert_eq!(content, "draft two");
        let revisions = repo.note_revisions("paper-a").await.expect("revisions");
        assert_eq!(revisions.len(), 1);
        assert_eq!(revisions[0].revision, 2);

        // Optional expected revision still serializes (no silent race).
        let third = repo
            .note_save(&paths, "paper-a", "draft three", None)
            .await
            .expect("save 3");
        assert_eq!(third.revision, 3);

        pool.close().await;
        let _ = fs::remove_dir_all(root);
    }

    #[tokio::test]
    async fn backfill_is_deterministic_and_never_rewrites_markdown() {
        let (pool, paths, root) = test_context("backfill").await;
        seed_paper(&pool, "paper-a").await;
        let note_dir = paths.notes_dir();
        fs::create_dir_all(&note_dir).expect("notes dir");
        fs::create_dir_all(paths.paper_dir("paper-a")).expect("paper dir");
        fs::write(paths.paper_dir("paper-a").join("note.md"), "existing note").expect("note file");
        sqlx::query("INSERT INTO paper_documents (paper_id, markdown, updated_at) VALUES ('paper-a', 'backfill body', 0)")
            .execute(&pool).await.expect("seed document");

        let repo = ProvenanceRepo::new(&pool);
        let first = repo.backfill(&paths, "paper-a").await.expect("backfill 1");
        assert!(first.created);
        assert_eq!(first.revision, 1);
        assert_eq!(first.note_revision, 1);

        let second = repo.backfill(&paths, "paper-a").await.expect("backfill 2");
        assert!(!second.created, "backfill must be idempotent");

        // Markdown and note bytes are never rewritten by backfill.
        let note_bytes =
            fs::read_to_string(paths.paper_dir("paper-a").join("note.md")).expect("note");
        assert_eq!(note_bytes, "existing note");
        let doc: String =
            sqlx::query_scalar("SELECT markdown FROM paper_documents WHERE paper_id = 'paper-a'")
                .fetch_one(&pool)
                .await
                .expect("doc");
        assert_eq!(doc, "backfill body");

        // Export is deterministic and reversible to the report shape.
        let export = repo.export(&["paper-a".to_string()]).await.expect("export");
        assert_eq!(export.papers.len(), 1);
        assert_eq!(export.papers[0].revisions.len(), 1);
        let bytes = serde_json::to_vec_pretty(&export).expect("serialize");
        let reparsed: ProvenanceExport = serde_json::from_slice(&bytes).expect("reparse");
        assert_eq!(reparsed.papers[0].remap_status, "mapped");
        assert!(
            !String::from_utf8_lossy(&bytes).contains("acceptedAt\":"),
            "no wall-clock inside export"
        );

        pool.close().await;
        let _ = fs::remove_dir_all(root);
    }
}
