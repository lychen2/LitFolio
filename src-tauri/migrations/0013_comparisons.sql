CREATE TABLE IF NOT EXISTS paper_comparisons (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    paper_ids TEXT NOT NULL,          -- JSON array of paper IDs
    content TEXT NOT NULL,            -- Markdown table
    model TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);
