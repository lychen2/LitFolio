-- 0004 · rebuild papers_fts as a regular (non-contentless) FTS5 table
--          so the triggers in 0003 can do DELETE FROM papers_fts.

-- Drop the contentless table and its triggers (re-created below).
DROP TRIGGER IF EXISTS papers_ai;
DROP TRIGGER IF EXISTS papers_ad;
DROP TRIGGER IF EXISTS papers_au;
DROP TABLE IF EXISTS papers_fts;

CREATE VIRTUAL TABLE papers_fts USING fts5(
    title, authors, abstract, tldr, notes,
    tokenize='unicode61'
);

-- Reseed from current papers
INSERT INTO papers_fts(rowid, title, authors, abstract, tldr, notes)
SELECT rowid, title, COALESCE(authors_json, ''), COALESCE(abstract, ''),
       COALESCE(tldr, ''), ''
FROM papers;

CREATE TRIGGER papers_ai AFTER INSERT ON papers BEGIN
    INSERT INTO papers_fts(rowid, title, authors, abstract, tldr, notes)
    VALUES (new.rowid, new.title, COALESCE(new.authors_json, ''),
            COALESCE(new.abstract, ''), COALESCE(new.tldr, ''), '');
END;

CREATE TRIGGER papers_ad AFTER DELETE ON papers BEGIN
    DELETE FROM papers_fts WHERE rowid = old.rowid;
END;

CREATE TRIGGER papers_au AFTER UPDATE ON papers BEGIN
    DELETE FROM papers_fts WHERE rowid = old.rowid;
    INSERT INTO papers_fts(rowid, title, authors, abstract, tldr, notes)
    VALUES (new.rowid, new.title, COALESCE(new.authors_json, ''),
            COALESCE(new.abstract, ''), COALESCE(new.tldr, ''), '');
END;
