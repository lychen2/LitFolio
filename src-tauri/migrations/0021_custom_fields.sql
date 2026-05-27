CREATE TABLE IF NOT EXISTS custom_field_defs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    field_type TEXT NOT NULL,
    options TEXT,
    created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS paper_custom_fields (
    paper_id TEXT NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
    field_id INTEGER NOT NULL REFERENCES custom_field_defs(id) ON DELETE CASCADE,
    value TEXT NOT NULL,
    PRIMARY KEY (paper_id, field_id)
);
