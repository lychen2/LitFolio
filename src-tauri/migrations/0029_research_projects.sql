CREATE TABLE IF NOT EXISTS research_projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    research_question TEXT,
    target_output TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    due_date INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_research_projects_status
    ON research_projects(status, updated_at DESC);

CREATE TABLE IF NOT EXISTS project_papers (
    project_id INTEGER NOT NULL REFERENCES research_projects(id) ON DELETE CASCADE,
    paper_id TEXT NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
    added_at INTEGER NOT NULL,
    PRIMARY KEY (project_id, paper_id)
);

CREATE INDEX IF NOT EXISTS idx_project_papers_paper
    ON project_papers(paper_id);
