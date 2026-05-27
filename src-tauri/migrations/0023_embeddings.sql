CREATE TABLE IF NOT EXISTS paper_embeddings (
    paper_id TEXT NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
    model TEXT NOT NULL,
    embedding BLOB NOT NULL,
    content_hash TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (paper_id, model)
);

CREATE INDEX IF NOT EXISTS idx_paper_embeddings_model ON paper_embeddings(model);
