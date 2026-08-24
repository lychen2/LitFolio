-- 0037 · Accepted document revisions (provenance core).
--
-- One row per accepted parser-produced document revision. The per-paper
-- revision number is monotonic starting at 1; superseded revisions are
-- retained (never overwritten or deleted) so evidence can be resolved later.
-- At most one row per paper is the active projection. A partial unique index
-- enforces the single-active invariant while still allowing many retained
-- inactive revisions (a plain UNIQUE(paper_id, active) would block the second
-- superseded revision).

CREATE TABLE IF NOT EXISTS paper_document_revisions (
    revision_id  TEXT PRIMARY KEY NOT NULL,
    paper_id     TEXT NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
    revision     INTEGER NOT NULL CHECK (revision >= 1),
    source_hash  TEXT NOT NULL,
    source_kind  TEXT NOT NULL,
    source_uri   TEXT NOT NULL,
    parser_owner TEXT NOT NULL,
    markdown     TEXT NOT NULL,
    segments_json TEXT NOT NULL,
    accepted_at  INTEGER NOT NULL,
    active       INTEGER NOT NULL DEFAULT 0 CHECK (active IN (0, 1)),
    UNIQUE (paper_id, revision)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_paper_document_revisions_active
    ON paper_document_revisions(paper_id) WHERE active = 1;

CREATE INDEX IF NOT EXISTS idx_paper_document_revisions_paper
    ON paper_document_revisions(paper_id, revision);
