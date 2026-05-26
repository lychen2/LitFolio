-- 0007 · persist per-highlight translation output for reader sidebar
ALTER TABLE highlights ADD COLUMN translation_text TEXT;
ALTER TABLE highlights ADD COLUMN translation_target_lang TEXT;
ALTER TABLE highlights ADD COLUMN translation_model TEXT;
ALTER TABLE highlights ADD COLUMN translated_at INTEGER;
