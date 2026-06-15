-- 0035 · Store per-paper supplementary material attachments.

CREATE TABLE IF NOT EXISTS paper_supplements (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    paper_id           TEXT NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
    title              TEXT NOT NULL,
    file_path          TEXT NOT NULL,
    file_kind          TEXT NOT NULL,
    note               TEXT NOT NULL DEFAULT '',
    converted_pdf_path TEXT,
    created_at         INTEGER NOT NULL,
    updated_at         INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_paper_supplements_paper
ON paper_supplements(paper_id, created_at DESC);
