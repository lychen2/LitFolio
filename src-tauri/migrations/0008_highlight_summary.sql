-- 0008 · persist one-sentence summary for long reader highlights
ALTER TABLE highlights ADD COLUMN summary_text TEXT;
ALTER TABLE highlights ADD COLUMN summary_model TEXT;
ALTER TABLE highlights ADD COLUMN summarized_at INTEGER;
