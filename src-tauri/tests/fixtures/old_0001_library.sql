CREATE TABLE papers (
    id TEXT PRIMARY KEY NOT NULL,
    title TEXT NOT NULL,
    authors_json TEXT NOT NULL DEFAULT '[]',
    year INTEGER,
    venue TEXT,
    doi TEXT UNIQUE,
    arxiv_id TEXT UNIQUE,
    abstract TEXT,
    pdf_path TEXT,
    note_path TEXT,
    added_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    read_status TEXT NOT NULL DEFAULT 'unread',
    tldr TEXT,
    research_question TEXT,
    method TEXT,
    dataset TEXT,
    key_findings_json TEXT,
    limitations TEXT,
    raw_metadata_json TEXT
);

CREATE INDEX idx_papers_added_at ON papers(added_at DESC);
CREATE INDEX idx_papers_year ON papers(year);
CREATE INDEX idx_papers_read_status ON papers(read_status);

CREATE TABLE tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    parent_id INTEGER REFERENCES tags(id) ON DELETE SET NULL,
    color TEXT
);

CREATE TABLE paper_tags (
    paper_id TEXT NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
    tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (paper_id, tag_id)
);

CREATE TABLE folders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    parent_id INTEGER REFERENCES folders(id) ON DELETE SET NULL
);

CREATE TABLE paper_folders (
    paper_id TEXT NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
    folder_id INTEGER NOT NULL REFERENCES folders(id) ON DELETE CASCADE,
    PRIMARY KEY (paper_id, folder_id)
);

CREATE TABLE highlights (
    id TEXT PRIMARY KEY NOT NULL,
    paper_id TEXT NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
    page INTEGER NOT NULL,
    rect_json TEXT NOT NULL,
    color TEXT NOT NULL DEFAULT 'yellow',
    text TEXT NOT NULL DEFAULT '',
    note TEXT,
    created_at INTEGER NOT NULL
);

CREATE INDEX idx_highlights_paper ON highlights(paper_id);

CREATE TABLE ai_jobs (
    id TEXT PRIMARY KEY NOT NULL,
    kind TEXT NOT NULL,
    paper_id TEXT REFERENCES papers(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'queued',
    model TEXT,
    tokens_in INTEGER NOT NULL DEFAULT 0,
    tokens_out INTEGER NOT NULL DEFAULT 0,
    error TEXT,
    created_at INTEGER NOT NULL,
    finished_at INTEGER
);

CREATE INDEX idx_ai_jobs_status ON ai_jobs(status);
CREATE INDEX idx_ai_jobs_paper ON ai_jobs(paper_id);

CREATE VIRTUAL TABLE papers_fts USING fts5(
    title, authors, abstract, tldr, notes,
    content='', tokenize='unicode61'
);

INSERT INTO papers (
    id, title, authors_json, year, venue, doi, arxiv_id, abstract,
    pdf_path, note_path, added_at, updated_at, read_status, tldr,
    research_question, method, dataset, key_findings_json, limitations,
    raw_metadata_json
) VALUES (
    'paper-old-1',
    'Old Library Paper',
    '["Ada Lovelace","Grace Hopper"]',
    2020,
    'Journal of Fixtures',
    '10.0000/old-fixture',
    '2001.00001',
    'Legacy abstract about retrieval and local-first libraries.',
    '/tmp/old.pdf',
    '/tmp/old.md',
    1000,
    1000,
    'reading',
    'Legacy TLDR',
    'Legacy question',
    'Legacy method',
    'Legacy dataset',
    '["Legacy finding"]',
    'Legacy limitation',
    '{"source":"fixture"}'
);

INSERT INTO tags (name, color) VALUES ('legacy-tag', '#8edcff');
INSERT INTO folders (name) VALUES ('Legacy Folder');
INSERT INTO paper_tags (paper_id, tag_id) VALUES ('paper-old-1', 1);
INSERT INTO paper_folders (paper_id, folder_id) VALUES ('paper-old-1', 1);
INSERT INTO highlights (
    id, paper_id, page, rect_json, color, text, note, created_at
) VALUES (
    'highlight-old-1',
    'paper-old-1',
    2,
    '{"boundingRect":{"x1":1,"y1":2,"x2":3,"y2":4},"rects":[],"pageNumber":2}',
    'yellow',
    'Legacy highlighted retrieval passage',
    'Legacy note',
    1001
);
