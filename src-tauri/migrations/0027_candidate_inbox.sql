CREATE TABLE IF NOT EXISTS candidate_papers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    authors_json TEXT NOT NULL DEFAULT '[]',
    year INTEGER,
    venue TEXT,
    doi TEXT,
    arxiv_id TEXT,
    abstract_text TEXT,
    source_type TEXT NOT NULL,
    source_url TEXT,
    status TEXT NOT NULL DEFAULT 'new',
    related_project TEXT,
    created_at INTEGER NOT NULL,
    last_seen_at INTEGER NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_candidate_doi
    ON candidate_papers(doi)
    WHERE doi IS NOT NULL AND doi != '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_candidate_arxiv
    ON candidate_papers(arxiv_id)
    WHERE arxiv_id IS NOT NULL AND arxiv_id != '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_candidate_title
    ON candidate_papers(lower(title));

CREATE INDEX IF NOT EXISTS idx_candidate_status_seen
    ON candidate_papers(status, last_seen_at DESC);
