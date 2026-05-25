-- Litera schema · 0006 · RSS / Atom feed subscriptions
-- Lightweight subscription layer: feeds are URLs the user wants to watch for new
-- papers; feed_items are the cached entries we've pulled. Marking an item "seen"
-- is local-only — we never write to the upstream feed.

CREATE TABLE IF NOT EXISTS feeds (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    url             TEXT NOT NULL UNIQUE,
    title           TEXT NOT NULL DEFAULT '',
    description     TEXT,
    -- Conditional-GET caching so a refresh that returns 304 is a no-op.
    etag            TEXT,
    last_modified   TEXT,
    last_fetched_at INTEGER,
    last_error      TEXT,
    created_at      INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_feeds_created_at ON feeds(created_at DESC);

CREATE TABLE IF NOT EXISTS feed_items (
    id           TEXT PRIMARY KEY NOT NULL,           -- ulid, our internal id
    feed_id      INTEGER NOT NULL REFERENCES feeds(id) ON DELETE CASCADE,
    entry_id     TEXT NOT NULL,                       -- upstream guid/id/link, for dedupe
    title        TEXT NOT NULL,
    link         TEXT,
    summary      TEXT,
    authors_json TEXT NOT NULL DEFAULT '[]',
    published_at INTEGER,                              -- entry's pubDate / published
    fetched_at   INTEGER NOT NULL,
    seen         INTEGER NOT NULL DEFAULT 0,           -- bool 0/1
    imported_paper_id TEXT REFERENCES papers(id) ON DELETE SET NULL,
    UNIQUE (feed_id, entry_id)
);

CREATE INDEX IF NOT EXISTS idx_feed_items_feed ON feed_items(feed_id, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_feed_items_seen ON feed_items(seen);
