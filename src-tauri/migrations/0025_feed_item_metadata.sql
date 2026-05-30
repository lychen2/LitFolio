-- Cache DOI/arXiv-resolved metadata for RSS items so old feed entries can be
-- backfilled once and reused by the import flow.

ALTER TABLE feed_items ADD COLUMN metadata_json TEXT;
ALTER TABLE feed_items ADD COLUMN metadata_source TEXT;
ALTER TABLE feed_items ADD COLUMN metadata_checked_at INTEGER;

CREATE INDEX IF NOT EXISTS idx_feed_items_metadata_checked
ON feed_items(metadata_checked_at);
