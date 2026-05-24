-- Litera schema · 0001 · initial tables
-- Papers, tags, folders, highlights, AI jobs

CREATE TABLE IF NOT EXISTS papers (
    id              TEXT PRIMARY KEY NOT NULL,
    title           TEXT NOT NULL,
    authors_json    TEXT NOT NULL DEFAULT '[]',
    year            INTEGER,
    venue           TEXT,
    doi             TEXT UNIQUE,
    arxiv_id        TEXT UNIQUE,
    abstract        TEXT,
    pdf_path        TEXT,
    note_path       TEXT,
    added_at        INTEGER NOT NULL,
    updated_at      INTEGER NOT NULL,
    read_status     TEXT NOT NULL DEFAULT 'unread',
    tldr            TEXT,
    research_question TEXT,
    method          TEXT,
    dataset         TEXT,
    key_findings_json TEXT,
    limitations     TEXT,
    raw_metadata_json TEXT
);

CREATE INDEX IF NOT EXISTS idx_papers_added_at ON papers(added_at DESC);
CREATE INDEX IF NOT EXISTS idx_papers_year ON papers(year);
CREATE INDEX IF NOT EXISTS idx_papers_read_status ON papers(read_status);

CREATE TABLE IF NOT EXISTS tags (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL UNIQUE,
    parent_id   INTEGER REFERENCES tags(id) ON DELETE SET NULL,
    color       TEXT
);

CREATE TABLE IF NOT EXISTS paper_tags (
    paper_id    TEXT NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
    tag_id      INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (paper_id, tag_id)
);

CREATE TABLE IF NOT EXISTS folders (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL,
    parent_id   INTEGER REFERENCES folders(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS paper_folders (
    paper_id    TEXT NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
    folder_id   INTEGER NOT NULL REFERENCES folders(id) ON DELETE CASCADE,
    PRIMARY KEY (paper_id, folder_id)
);

CREATE TABLE IF NOT EXISTS highlights (
    id          TEXT PRIMARY KEY NOT NULL,
    paper_id    TEXT NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
    page        INTEGER NOT NULL,
    rect_json   TEXT NOT NULL,
    color       TEXT NOT NULL DEFAULT 'yellow',
    text        TEXT NOT NULL DEFAULT '',
    note        TEXT,
    created_at  INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_highlights_paper ON highlights(paper_id);

CREATE TABLE IF NOT EXISTS ai_jobs (
    id          TEXT PRIMARY KEY NOT NULL,
    kind        TEXT NOT NULL,
    paper_id    TEXT REFERENCES papers(id) ON DELETE SET NULL,
    status      TEXT NOT NULL DEFAULT 'queued',
    model       TEXT,
    tokens_in   INTEGER NOT NULL DEFAULT 0,
    tokens_out  INTEGER NOT NULL DEFAULT 0,
    error       TEXT,
    created_at  INTEGER NOT NULL,
    finished_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_ai_jobs_status ON ai_jobs(status);
CREATE INDEX IF NOT EXISTS idx_ai_jobs_paper ON ai_jobs(paper_id);

-- FTS5 virtual table for unified full-text search
CREATE VIRTUAL TABLE IF NOT EXISTS papers_fts USING fts5(
    title, authors, abstract, tldr, notes,
    content='', tokenize='unicode61'
);
