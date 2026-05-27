CREATE TABLE IF NOT EXISTS reading_queue (
    paper_id TEXT NOT NULL REFERENCES papers(id) ON DELETE CASCADE PRIMARY KEY,
    priority INTEGER NOT NULL DEFAULT 0,
    target_date INTEGER,
    note TEXT,
    added_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_reading_queue_priority ON reading_queue(priority DESC);
