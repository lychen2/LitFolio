-- 0014 · Extend FTS to cover highlights and terms for unified search.

-- Rebuild papers_fts with additional columns.
DROP TRIGGER IF EXISTS papers_ai;
DROP TRIGGER IF EXISTS papers_ad;
DROP TRIGGER IF EXISTS papers_au;
DROP TABLE IF EXISTS papers_fts;

CREATE VIRTUAL TABLE papers_fts USING fts5(
    title, authors, abstract, tldr, key_findings, research_question, method, limitations,
    tokenize='unicode61'
);

-- Reseed from current papers.
INSERT INTO papers_fts(rowid, title, authors, abstract, tldr, key_findings, research_question, method, limitations)
SELECT rowid, title, COALESCE(authors_json, ''), COALESCE(abstract, ''),
       COALESCE(tldr, ''), COALESCE(key_findings_json, ''),
       COALESCE(research_question, ''), COALESCE(method, ''),
       COALESCE(limitations, '')
FROM papers;

-- Triggers for papers_fts.
CREATE TRIGGER papers_ai AFTER INSERT ON papers BEGIN
    INSERT INTO papers_fts(rowid, title, authors, abstract, tldr, key_findings, research_question, method, limitations)
    VALUES (new.rowid, new.title, COALESCE(new.authors_json, ''),
            COALESCE(new.abstract, ''), COALESCE(new.tldr, ''),
            COALESCE(new.key_findings_json, ''),
            COALESCE(new.research_question, ''), COALESCE(new.method, ''),
            COALESCE(new.limitations, ''));
END;

CREATE TRIGGER papers_ad AFTER DELETE ON papers BEGIN
    DELETE FROM papers_fts WHERE rowid = old.rowid;
END;

CREATE TRIGGER papers_au AFTER UPDATE ON papers BEGIN
    DELETE FROM papers_fts WHERE rowid = old.rowid;
    INSERT INTO papers_fts(rowid, title, authors, abstract, tldr, key_findings, research_question, method, limitations)
    VALUES (new.rowid, new.title, COALESCE(new.authors_json, ''),
            COALESCE(new.abstract, ''), COALESCE(new.tldr, ''),
            COALESCE(new.key_findings_json, ''),
            COALESCE(new.research_question, ''), COALESCE(new.method, ''),
            COALESCE(new.limitations, ''));
END;

-- Highlights FTS table.
CREATE VIRTUAL TABLE highlights_fts USING fts5(
    text, note, paper_id,
    tokenize='unicode61'
);

INSERT INTO highlights_fts(rowid, text, note, paper_id)
SELECT rowid, COALESCE(text, ''), COALESCE(note, ''), COALESCE(paper_id, '')
FROM highlights;

CREATE TRIGGER highlights_ai AFTER INSERT ON highlights BEGIN
    INSERT INTO highlights_fts(rowid, text, note, paper_id)
    VALUES (new.rowid, COALESCE(new.text, ''), COALESCE(new.note, ''), COALESCE(new.paper_id, ''));
END;

CREATE TRIGGER highlights_ad AFTER DELETE ON highlights BEGIN
    DELETE FROM highlights_fts WHERE rowid = old.rowid;
END;

CREATE TRIGGER highlights_au AFTER UPDATE ON highlights BEGIN
    DELETE FROM highlights_fts WHERE rowid = old.rowid;
    INSERT INTO highlights_fts(rowid, text, note, paper_id)
    VALUES (new.rowid, COALESCE(new.text, ''), COALESCE(new.note, ''), COALESCE(new.paper_id, ''));
END;

-- Terms FTS table.
CREATE VIRTUAL TABLE terms_fts USING fts5(
    term, definition, evidence, paper_id,
    tokenize='unicode61'
);

INSERT INTO terms_fts(rowid, term, definition, evidence, paper_id)
SELECT rowid, COALESCE(term, ''), COALESCE(local_definition, ''),
       COALESCE(local_evidence, ''), COALESCE(paper_id, '')
FROM paper_terms;

CREATE TRIGGER terms_ai AFTER INSERT ON paper_terms BEGIN
    INSERT INTO terms_fts(rowid, term, definition, evidence, paper_id)
    VALUES (new.rowid, COALESCE(new.term, ''), COALESCE(new.local_definition, ''),
            COALESCE(new.local_evidence, ''), COALESCE(new.paper_id, ''));
END;

CREATE TRIGGER terms_ad AFTER DELETE ON paper_terms BEGIN
    DELETE FROM terms_fts WHERE rowid = old.rowid;
END;

CREATE TRIGGER terms_au AFTER UPDATE ON paper_terms BEGIN
    DELETE FROM terms_fts WHERE rowid = old.rowid;
    INSERT INTO terms_fts(rowid, term, definition, evidence, paper_id)
    VALUES (new.rowid, COALESCE(new.term, ''), COALESCE(new.local_definition, ''),
            COALESCE(new.local_evidence, ''), COALESCE(new.paper_id, ''));
END;
