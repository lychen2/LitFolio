CREATE TABLE IF NOT EXISTS pdf_notes (
  id TEXT PRIMARY KEY NOT NULL,
  paper_id TEXT NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
  legacy_highlight_id TEXT UNIQUE REFERENCES highlights(id) ON DELETE SET NULL,
  page INTEGER NOT NULL CHECK (page >= 1),
  x REAL NOT NULL CHECK (x >= 0 AND x <= 100000),
  y REAL NOT NULL CHECK (y >= 0 AND y <= 100000),
  width REAL NOT NULL CHECK (width > 0 AND width <= 100000 AND x + width <= 100000),
  height REAL NOT NULL CHECK (height > 0 AND height <= 100000 AND y + height <= 100000),
  content TEXT NOT NULL DEFAULT '',
  color TEXT NOT NULL CHECK (length(color) = 7 AND substr(color, 1, 1) = '#'),
  font_size REAL NOT NULL CHECK (font_size >= 8 AND font_size <= 28),
  opacity REAL NOT NULL CHECK (opacity >= 0.1 AND opacity <= 1),
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_pdf_notes_paper_page
  ON pdf_notes(paper_id, page, created_at);
CREATE INDEX IF NOT EXISTS idx_pdf_notes_updated_at
  ON pdf_notes(updated_at DESC);

CREATE VIRTUAL TABLE IF NOT EXISTS pdf_notes_fts USING fts5(
  id UNINDEXED,
  paper_id UNINDEXED,
  content,
  tokenize = 'unicode61'
);

CREATE TRIGGER IF NOT EXISTS pdf_notes_ai AFTER INSERT ON pdf_notes BEGIN
  INSERT INTO pdf_notes_fts(id, paper_id, content)
  VALUES (new.id, new.paper_id, new.content);
END;

CREATE TRIGGER IF NOT EXISTS pdf_notes_ad AFTER DELETE ON pdf_notes BEGIN
  DELETE FROM pdf_notes_fts WHERE id = old.id;
END;

CREATE TRIGGER IF NOT EXISTS pdf_notes_au AFTER UPDATE ON pdf_notes BEGIN
  DELETE FROM pdf_notes_fts WHERE id = old.id;
  INSERT INTO pdf_notes_fts(id, paper_id, content)
  VALUES (new.id, new.paper_id, new.content);
END;
