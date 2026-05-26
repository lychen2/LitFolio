-- 0009 · paper glossary terms for reader translation and tooltip reuse
CREATE TABLE IF NOT EXISTS paper_terms (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    paper_id          TEXT NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
    term              TEXT NOT NULL,
    normalized_term   TEXT NOT NULL,
    local_definition  TEXT NOT NULL,
    local_evidence    TEXT NOT NULL,
    score             REAL NOT NULL DEFAULT 0,
    created_at        INTEGER NOT NULL,
    updated_at        INTEGER NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_paper_terms_unique
ON paper_terms(paper_id, normalized_term);

CREATE INDEX IF NOT EXISTS idx_paper_terms_paper
ON paper_terms(paper_id, score DESC);

CREATE INDEX IF NOT EXISTS idx_paper_terms_norm
ON paper_terms(normalized_term);
