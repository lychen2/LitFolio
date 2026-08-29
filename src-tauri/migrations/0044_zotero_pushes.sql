-- Tracks which papers have been pushed to Zotero, so re-pushes can warn.
CREATE TABLE zotero_pushes (
    paper_id TEXT PRIMARY KEY,
    pushed_at INTEGER NOT NULL
);
