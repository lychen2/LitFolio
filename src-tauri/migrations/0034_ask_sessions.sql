CREATE TABLE IF NOT EXISTS ask_sessions (
    id TEXT PRIMARY KEY,
    project_id INTEGER REFERENCES research_projects(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    pinned_paper_ids TEXT NOT NULL DEFAULT '[]',
    model TEXT,
    conversation_json TEXT NOT NULL DEFAULT '[]',
    saved_artifacts_json TEXT NOT NULL DEFAULT '[]',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ask_sessions_project_updated
    ON ask_sessions(project_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_ask_sessions_updated
    ON ask_sessions(updated_at DESC);
