ALTER TABLE candidate_papers ADD COLUMN normalized_title TEXT;

UPDATE candidate_papers
SET normalized_title = lower(trim(title))
WHERE normalized_title IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_candidate_normalized_title
    ON candidate_papers(normalized_title)
    WHERE normalized_title IS NOT NULL AND normalized_title != '';
