-- 0038 · Stable source segments per accepted document revision.
--
-- Segments are immutable per revision (cascade-deleted with their revision).
-- Geometry is nullable finite PDF-space data; PDF annotation geometry remains
-- authoritative for the Reader. quote_hash is sha256 of the normalized segment
-- text and is the content fingerprint used for current|moved|changed|missing
-- resolution.

CREATE TABLE IF NOT EXISTS source_segments (
    segment_id  TEXT PRIMARY KEY NOT NULL,
    revision_id TEXT NOT NULL REFERENCES paper_document_revisions(revision_id) ON DELETE CASCADE,
    paper_id    TEXT NOT NULL,
    seg_order   INTEGER NOT NULL CHECK (seg_order >= 1),
    kind        TEXT NOT NULL,
    markdown    TEXT NOT NULL,
    page        INTEGER,
    rect_json   TEXT,
    quote_hash  TEXT NOT NULL,
    UNIQUE (revision_id, seg_order)
);

CREATE INDEX IF NOT EXISTS idx_source_segments_revision
    ON source_segments(revision_id);
