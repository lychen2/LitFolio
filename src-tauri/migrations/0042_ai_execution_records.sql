-- Core-owned, redacted execution records for every AI dispatch.
CREATE TABLE ai_execution_records (
    id TEXT PRIMARY KEY,
    operation TEXT NOT NULL,
    trigger TEXT NOT NULL,
    envelope_id TEXT NOT NULL,
    paper_id TEXT,
    profile_name TEXT NOT NULL,
    model TEXT NOT NULL,
    state TEXT NOT NULL CHECK (state IN ('running', 'succeeded', 'failed', 'cancelled')),
    started_at INTEGER NOT NULL,
    finished_at INTEGER,
    duration_ms INTEGER,
    error_summary TEXT
);

CREATE INDEX idx_ai_execution_records_paper ON ai_execution_records (paper_id, started_at);
CREATE INDEX idx_ai_execution_records_state ON ai_execution_records (state);
