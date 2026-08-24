-- 0040 · Revision-safe per-paper note saves.
--
-- The note projection stays at notes/<paper-id>.md (LibraryPaths::note_file);
-- this table carries the compare-and-swap metadata so note saves are
-- revision-safe and transactional. note_id is deterministic (note-<paper-id>);
-- revision starts at 1.

CREATE TABLE IF NOT EXISTS note_revisions (
    note_id      TEXT PRIMARY KEY NOT NULL,
    paper_id     TEXT NOT NULL UNIQUE REFERENCES papers(id) ON DELETE CASCADE,
    revision     INTEGER NOT NULL CHECK (revision >= 1),
    content_hash TEXT NOT NULL,
    saved_at     INTEGER NOT NULL
);
