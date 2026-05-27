CREATE TABLE IF NOT EXISTS paper_note_sections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    paper_id TEXT NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
    section_key TEXT NOT NULL,       -- 'problem', 'method', 'numbers', 'limits', 'thoughts'
    content TEXT NOT NULL DEFAULT '',
    source TEXT NOT NULL DEFAULT 'user',  -- 'user' | 'ai:tldr' | 'ai:quick_read'
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    UNIQUE(paper_id, section_key)
);
