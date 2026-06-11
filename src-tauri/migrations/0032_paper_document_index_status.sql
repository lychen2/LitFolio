-- 0032 · Track PDF body indexing status for Ask degradation visibility.

ALTER TABLE paper_documents ADD COLUMN index_status TEXT NOT NULL DEFAULT 'indexed';
ALTER TABLE paper_documents ADD COLUMN index_error TEXT;
ALTER TABLE paper_documents ADD COLUMN indexed_at INTEGER;

UPDATE paper_documents
SET indexed_at = COALESCE(indexed_at, updated_at),
    index_status = COALESCE(NULLIF(index_status, ''), 'indexed');
