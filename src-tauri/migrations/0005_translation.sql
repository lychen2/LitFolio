-- 0005 · paper translation (title + abstract) into a user-chosen target language
ALTER TABLE papers ADD COLUMN title_translated TEXT;
ALTER TABLE papers ADD COLUMN abstract_translated TEXT;
ALTER TABLE papers ADD COLUMN translate_target_lang TEXT;
ALTER TABLE papers ADD COLUMN translated_at INTEGER;
