-- 0003 · keep papers_fts in sync with papers via triggers,
--          and pre-fill for any rows inserted before this migration.

INSERT INTO papers_fts(rowid, title, authors, abstract, tldr, notes)
SELECT rowid, title, COALESCE(authors_json, ''), COALESCE(abstract, ''),
       COALESCE(tldr, ''), ''
FROM papers
WHERE rowid NOT IN (SELECT rowid FROM papers_fts);

CREATE TRIGGER IF NOT EXISTS papers_ai AFTER INSERT ON papers BEGIN
    INSERT INTO papers_fts(rowid, title, authors, abstract, tldr, notes)
    VALUES (new.rowid,
            new.title,
            COALESCE(new.authors_json, ''),
            COALESCE(new.abstract, ''),
            COALESCE(new.tldr, ''),
            '');
END;

CREATE TRIGGER IF NOT EXISTS papers_ad AFTER DELETE ON papers BEGIN
    DELETE FROM papers_fts WHERE rowid = old.rowid;
END;

CREATE TRIGGER IF NOT EXISTS papers_au AFTER UPDATE ON papers BEGIN
    DELETE FROM papers_fts WHERE rowid = old.rowid;
    INSERT INTO papers_fts(rowid, title, authors, abstract, tldr, notes)
    VALUES (new.rowid,
            new.title,
            COALESCE(new.authors_json, ''),
            COALESCE(new.abstract, ''),
            COALESCE(new.tldr, ''),
            '');
END;
