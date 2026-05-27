CREATE TABLE IF NOT EXISTS paper_citations (
    paper_id TEXT NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
    cited_paper_id TEXT NOT NULL,
    cited_title TEXT NOT NULL,
    cited_authors TEXT,
    cited_year INTEGER,
    cited_venue TEXT,
    cited_doi TEXT,
    direction TEXT NOT NULL,
    fetched_at INTEGER NOT NULL,
    UNIQUE(paper_id, cited_paper_id, direction)
);

CREATE INDEX IF NOT EXISTS idx_paper_citations_paper ON paper_citations(paper_id);
CREATE INDEX IF NOT EXISTS idx_paper_citations_direction ON paper_citations(paper_id, direction);
