CREATE TABLE IF NOT EXISTS topic_alerts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    query TEXT NOT NULL,
    frequency TEXT NOT NULL,
    target_folder_id INTEGER,
    auto_import INTEGER NOT NULL DEFAULT 0,
    last_run_at INTEGER,
    created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS topic_alert_results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    alert_id INTEGER NOT NULL REFERENCES topic_alerts(id) ON DELETE CASCADE,
    paper_doi TEXT,
    paper_arxiv_id TEXT,
    title TEXT NOT NULL,
    authors TEXT,
    year INTEGER,
    abstract_text TEXT,
    seen INTEGER NOT NULL DEFAULT 0,
    added_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_topic_alert_results_alert ON topic_alert_results(alert_id);
