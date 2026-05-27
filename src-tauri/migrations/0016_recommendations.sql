CREATE TABLE IF NOT EXISTS recommendation_cache (
    paper_id TEXT NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
    results_json TEXT NOT NULL,
    fetched_at INTEGER NOT NULL,
    PRIMARY KEY(paper_id)
);
