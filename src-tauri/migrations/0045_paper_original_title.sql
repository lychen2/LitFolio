-- Display titles in existing rows can be translations or custom labels.
-- Recover originals only from catalog entries with source provenance.
ALTER TABLE papers ADD COLUMN original_title TEXT;
