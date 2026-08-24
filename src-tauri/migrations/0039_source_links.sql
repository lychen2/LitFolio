-- 0039 · Source links with immutable snapshots and indexed backlinks.
--
-- A source link binds a note/annotation/paper anchor to a stable source
-- segment. snapshot_json is captured at creation time (page, geometry, kind,
-- text, markdown, asset) and never rewritten; quote_hash fingerprints the
-- quoted content. Resolution is one of current|moved|changed|missing and is
-- recomputed lazily on read and persisted on remap — readers must not trust a
-- stored status alone. Backlinks are served exclusively through the indexed
-- queries over these tables (no frontend library-wide scans).

CREATE TABLE IF NOT EXISTS source_links (
    link_id       TEXT PRIMARY KEY NOT NULL,
    paper_id      TEXT NOT NULL,
    anchor_domain TEXT NOT NULL CHECK (anchor_domain IN ('note', 'annotation', 'paper')),
    anchor_id     TEXT NOT NULL,
    segment_id    TEXT NOT NULL REFERENCES source_segments(segment_id) ON DELETE CASCADE,
    revision_id   TEXT NOT NULL REFERENCES paper_document_revisions(revision_id),
    snapshot_json TEXT NOT NULL,
    quote_hash    TEXT NOT NULL,
    resolution    TEXT NOT NULL DEFAULT 'current'
                  CHECK (resolution IN ('current', 'moved', 'changed', 'missing')),
    created_at    INTEGER NOT NULL,
    updated_at    INTEGER NOT NULL,
    UNIQUE (anchor_domain, anchor_id, segment_id)
);

CREATE INDEX IF NOT EXISTS idx_source_links_segment
    ON source_links(segment_id, resolution);
CREATE INDEX IF NOT EXISTS idx_source_links_anchor
    ON source_links(anchor_domain, anchor_id);
CREATE INDEX IF NOT EXISTS idx_source_links_paper
    ON source_links(paper_id, resolution);
