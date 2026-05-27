CREATE TABLE IF NOT EXISTS concepts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    source TEXT NOT NULL DEFAULT 'ai',
    created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS concept_relations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_concept_id INTEGER NOT NULL REFERENCES concepts(id) ON DELETE CASCADE,
    target_concept_id INTEGER NOT NULL REFERENCES concepts(id) ON DELETE CASCADE,
    relation TEXT NOT NULL,
    evidence_paper_id TEXT REFERENCES papers(id) ON DELETE SET NULL,
    snippet TEXT,
    created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS paper_concepts (
    paper_id TEXT NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
    concept_id INTEGER NOT NULL REFERENCES concepts(id) ON DELETE CASCADE,
    relevance REAL NOT NULL DEFAULT 1.0,
    PRIMARY KEY (paper_id, concept_id)
);

CREATE INDEX IF NOT EXISTS idx_concept_relations_source ON concept_relations(source_concept_id);
CREATE INDEX IF NOT EXISTS idx_concept_relations_target ON concept_relations(target_concept_id);
CREATE INDEX IF NOT EXISTS idx_paper_concepts_paper ON paper_concepts(paper_id);
CREATE INDEX IF NOT EXISTS idx_paper_concepts_concept ON paper_concepts(concept_id);
