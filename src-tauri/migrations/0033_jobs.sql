-- Litera schema · 0033 · persisted job lifecycle
-- Generic long-running task ledger for imports, sync, AI batches, and graph maintenance.

CREATE TABLE IF NOT EXISTS jobs (
    id               TEXT PRIMARY KEY NOT NULL,
    kind             TEXT NOT NULL,
    scope            TEXT,
    title            TEXT NOT NULL,
    status           TEXT NOT NULL DEFAULT 'queued'
        CHECK (status IN ('queued', 'running', 'succeeded', 'failed', 'cancelled')),
    details_json     TEXT NOT NULL DEFAULT '{}',
    progress_current INTEGER NOT NULL DEFAULT 0 CHECK (progress_current >= 0),
    progress_total   INTEGER NOT NULL DEFAULT 0 CHECK (progress_total >= 0),
    error            TEXT,
    attempts         INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    max_attempts     INTEGER NOT NULL DEFAULT 1 CHECK (max_attempts >= 1),
    created_at       INTEGER NOT NULL,
    updated_at       INTEGER NOT NULL,
    started_at       INTEGER,
    finished_at      INTEGER
);

CREATE INDEX IF NOT EXISTS idx_jobs_status_updated ON jobs(status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_jobs_kind_updated ON jobs(kind, updated_at DESC);
