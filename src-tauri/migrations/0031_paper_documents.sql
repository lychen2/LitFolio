-- 0031 · Store extracted paper Markdown and index it for RAG retrieval.

CREATE TABLE IF NOT EXISTS paper_documents (
    paper_id   TEXT PRIMARY KEY NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
    markdown   TEXT NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE VIRTUAL TABLE IF NOT EXISTS paper_documents_fts USING fts5(
    paper_id UNINDEXED,
    markdown,
    tokenize='unicode61'
);

INSERT INTO paper_documents_fts(rowid, paper_id, markdown)
SELECT rowid, paper_id, COALESCE(markdown, '')
FROM paper_documents
WHERE rowid NOT IN (SELECT rowid FROM paper_documents_fts);

CREATE TRIGGER IF NOT EXISTS paper_documents_ai AFTER INSERT ON paper_documents BEGIN
    INSERT INTO paper_documents_fts(rowid, paper_id, markdown)
    VALUES (new.rowid, new.paper_id, COALESCE(new.markdown, ''));
END;

CREATE TRIGGER IF NOT EXISTS paper_documents_ad AFTER DELETE ON paper_documents BEGIN
    DELETE FROM paper_documents_fts WHERE rowid = old.rowid;
END;

CREATE TRIGGER IF NOT EXISTS paper_documents_au AFTER UPDATE ON paper_documents BEGIN
    DELETE FROM paper_documents_fts WHERE rowid = old.rowid;
    INSERT INTO paper_documents_fts(rowid, paper_id, markdown)
    VALUES (new.rowid, new.paper_id, COALESCE(new.markdown, ''));
END;
