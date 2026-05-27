-- Typed, directed relationships between papers.
-- Each row is one directional edge. Bidirectional relations (e.g. "compares")
-- are stored as two rows with swapped source/target via application logic.

CREATE TABLE IF NOT EXISTS paper_links (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    source_paper_id TEXT NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
    target_paper_id TEXT NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
    relation        TEXT NOT NULL,
    source_type     TEXT NOT NULL DEFAULT 'user',
    confidence      REAL NOT NULL DEFAULT 1.0,
    snippet         TEXT,
    created_at      INTEGER NOT NULL,
    updated_at      INTEGER NOT NULL,
    CHECK(source_paper_id != target_paper_id),
    CHECK(source_type IN ('user', 'ai')),
    CHECK(confidence >= 0.0 AND confidence <= 1.0)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_paper_links_unique
ON paper_links(source_paper_id, target_paper_id, relation);

CREATE INDEX IF NOT EXISTS idx_paper_links_source
ON paper_links(source_paper_id);

CREATE INDEX IF NOT EXISTS idx_paper_links_target
ON paper_links(target_paper_id);

CREATE INDEX IF NOT EXISTS idx_paper_links_relation
ON paper_links(relation);
