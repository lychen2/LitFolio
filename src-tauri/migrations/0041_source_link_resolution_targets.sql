-- 0041 · Preserve original source-link anchors while tracking their latest
-- deterministic resolution target after document reparsing.
--
-- The original revision/segment/snapshot remain immutable evidence. These
-- nullable pointers are a derived projection updated by provenance_remap.

ALTER TABLE source_links ADD COLUMN resolved_revision_id TEXT
    REFERENCES paper_document_revisions(revision_id) ON DELETE SET NULL;
ALTER TABLE source_links ADD COLUMN resolved_segment_id TEXT
    REFERENCES source_segments(segment_id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_source_links_resolved_segment
    ON source_links(resolved_segment_id, resolution);
