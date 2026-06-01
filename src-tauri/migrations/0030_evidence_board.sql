CREATE TABLE IF NOT EXISTS evidence_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES research_projects(id) ON DELETE CASCADE,
    source_type TEXT NOT NULL,
    paper_id TEXT REFERENCES papers(id) ON DELETE SET NULL,
    highlight_id TEXT REFERENCES highlights(id) ON DELETE SET NULL,
    page INTEGER,
    label TEXT,
    excerpt TEXT NOT NULL,
    note TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_evidence_project
    ON evidence_items(project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_evidence_paper
    ON evidence_items(paper_id);
