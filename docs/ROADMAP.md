# LitFolio Roadmap

> Feature backlog with design requirements, implementation plans, and success criteria.
> Ordered by priority tier. Items marked with `[AI]` depend on LLM integration.

---

## P0 — Immediate Value / Low Effort

---

### F-11: Automatic BibTeX Generation

**Goal:** Every imported paper gets a machine-readable BibTeX entry that can be copied or exported in one click.

**Motivation:** Researchers writing LaTeX papers need BibTeX entries. Today they manually craft them or switch to Zotero. This is a table-stakes feature that eliminates a common reason to leave LitFolio.

#### Design Requirements

1. On paper import (DOI / arXiv / PDF), auto-generate a BibTeX entry from the existing metadata fields (`title`, `authors`, `year`, `venue`, `doi`, `arxiv_id`).
2. Store the generated BibTeX in a new `bibtex` TEXT column on the `papers` table.
3. Expose a copy-to-clipboard button in the paper detail drawer (Library page) and in the Reader header.
4. BibTeX key format: `firstAuthorLastName + year + firstSignificantWord` (e.g., `vaswani2017attention`).
5. Handle edge cases: missing venue (omit `journal`), missing DOI (omit `doi`), missing authors (use `unknown`).

#### Implementation

- **Migration** `0011_bibtex.sql`: `ALTER TABLE papers ADD COLUMN bibtex TEXT;`
- **Rust** `src-tauri/src/bibtex.rs`: Pure function `generate_bibtex(paper: &Paper) -> String` — no external dependencies, just string formatting. Call it inside `import_doi`, `import_arxiv`, `import_bibtex`, `import_pdf_files` after paper creation.
- **Backfill command** `bibtex_backfill`: Iterates all papers with `bibtex IS NULL`, generates entries. Run once on app startup if column was just added.
- **Frontend**: Add a "Copy BibTeX" button icon (lucide `ClipboardCopy`) next to the paper title in both Library drawer and Reader. Use `navigator.clipboard.writeText()`.

#### Success Criteria

- Every paper in the library has a non-null `bibtex` field after import.
- Copy-to-clipboard produces a valid BibTeX entry parseable by `bibtex` / `biber`.
- Zero new dependencies; pure string formatting in Rust.

---

### F-21: Obsidian / Markdown Export

**Goal:** Export paper notes, highlights, and terms as structured Markdown files compatible with Obsidian, Logseq, and generic Markdown workflows.

**Motivation:** Many researchers use Obsidian as their second brain. LitFolio's notes are locked inside SQLite. Exporting to Markdown bridges LitFolio into the broader PKM ecosystem without requiring Obsidian-specific APIs.

#### Design Requirements

1. Configurable export directory (e.g., `~/ObsidianVault/LitFolio/`).
2. One `.md` file per paper. Filename: `{firstAuthor}_{year}_{firstWord}.md`.
3. YAML frontmatter with: `title`, `authors`, `year`, `venue`, `doi`, `arxiv_id`, `tags`, `folders`, `read_status`, `bibtex`.
4. Sections: `## Notes` (free text), `## Highlights` (each with page, color, text, note), `## Terms` (term + definition + evidence).
5. Bidirectional links: `[[term]]` syntax for Obsidian graph integration.
6. Incremental export: only re-export papers whose notes/highlights changed since last export. Track `last_exported_at` per paper.
7. Trigger: manual button in Settings, or automatic on note/highlight save (debounced, 5s).

#### Implementation

- **Migration** `0012_export.sql`: `ALTER TABLE papers ADD COLUMN last_exported_at INTEGER;`
- **Rust** `src-tauri/src/export/markdown.rs`:
  - `export_paper_md(pool, paper_id, export_dir) -> Result<PathBuf>` — queries paper + notes + highlights + terms, writes `.md` file.
  - `export_all_md(pool, export_dir, incremental: bool) -> Result<ExportSummary>` — iterates papers, returns counts.
- **Tauri commands**: `export_markdown_dir` (get/set), `export_markdown_all`, `export_markdown_paper`.
- **Frontend**: Settings section "Export" with directory picker + "Export Now" button. Optional toggle for auto-export on save.

#### Success Criteria

- Exported `.md` files open cleanly in Obsidian with frontmatter parsed and `[[links]]` resolved.
- 500-paper library exports in < 10 seconds.
- Incremental export touches only changed files.

---

### F-24: Command Palette (Cmd+K)

**Goal:** A keyboard-driven command palette for fast navigation, search, and action execution across all of LitFolio.

**Motivation:** Power users (the primary audience) navigate by keyboard. A command palette eliminates the need to remember which page holds which feature, and makes every action discoverable.

#### Design Requirements

1. Trigger: `Cmd+K` (macOS) / `Ctrl+K` (Windows/Linux).
2. Modes:
   - **Navigation**: type page name (`library`, `reader`, `graph`, `settings`) → jump.
   - **Search**: type paper title/author → open in reader or highlight in library.
   - **Commands**: type action (`export bibtex`, `generate terms`, `ai discover`) → execute.
3. Fuzzy matching on labels; results grouped by category (Navigation / Papers / Actions).
4. Recent items pinned at top (last 5 commands, last 3 opened papers).
5. Escape or clicking outside closes the palette.
6. No new route — overlay modal rendered at Shell level.

#### Implementation

- **Library**: Use `cmdk` (3KB, zero dependencies beyond React) or build a lightweight version with `useMemo` fuzzy filter.
- **Frontend** `src/components/CommandPalette.tsx`:
  - Controlled by a Zustand store (`useCommandStore`: `open`, `toggle`, `close`).
  - `useEffect` on `keydown` at `window` level to capture `Cmd+K`.
  - Command registry: static array of `{ id, label, category, action, keywords }`. Actions are callbacks.
  - Paper items: merge from `papersRecent(20)` query.
- **Integration**: Import in `Shell.tsx`, render at root level.

#### Success Criteria

- Palette appears within 50ms of keystroke.
- Fuzzy matching handles typos (e.g., `grpah` → `graph`).
- All page routes and top 10 actions are reachable from the palette.

---

## P1 — Core Experience Enhancement

---

### F-06: Multi-Paper Comparison [AI]

**Goal:** Select 3-5 papers and generate a structured comparison matrix covering methods, datasets, metrics, and conclusions.

**Motivation:** After reading several papers on the same topic, researchers need to synthesize differences. Currently they do this manually in a spreadsheet. AI can produce a first draft in seconds.

#### Design Requirements

1. Entry point: multi-select papers in Library (checkbox mode), then "Compare" action in batch toolbar.
2. AI generates a table with columns: Paper | Problem | Method | Dataset | Key Metric | Limitation | Conclusion.
3. Output is editable — user can correct AI mistakes inline.
4. Persisted as a `comparison` record linked to the selected paper IDs.
5. Re-generable: "Regenerate" button re-runs the AI with updated paper content.

#### Implementation

- **Migration** `0013_comparisons.sql`:
  ```sql
  CREATE TABLE paper_comparisons (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      paper_ids TEXT NOT NULL,          -- JSON array of paper IDs
      content TEXT NOT NULL,            -- Markdown table
      model TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
  );
  ```
- **Rust** `src-tauri/src/ai/compare.rs`:
  - `compare_papers(pool, paper_ids: &[String]) -> Result<ComparisonResult>`.
  - System prompt: structured comparison table format, cite specific numbers, flag disagreements.
  - Input: for each paper, send TL;DR + Quick Read fields (already cached in DB).
- **Tauri commands**: `paper_compare`, `paper_comparisons_list`, `paper_comparison_delete`.
- **Frontend** `src/pages/ComparePage.tsx` (new route `/compare`):
  - Table rendered with `@tanstack/react-table` or plain `<table>` with inline editing.
  - Accessible from batch toolbar "Compare Selected" button.

#### Success Criteria

- Comparison completes in < 30 seconds for 5 papers.
- Table cells reference specific sections/figures from the source papers.
- Editable output persists across sessions.

---

### F-15: Unified Full-Text Search

**Goal:** A single search box that searches across paper titles, abstracts, TL;DRs, highlights, notes, terms, and PDF full text.

**Motiation:** `papers_search` today only hits title/tldr/authors via FTS5. Researchers often remember a phrase from a highlight or the PDF body but can't find which paper it was in.

#### Design Requirements

1. Extend the existing `papers_fts` FTS5 table to index additional fields: `tldr`, `key_findings`, `abstract_text`, `research_question`, `method`, `limitations`.
2. New table `highlights_fts` for highlight text and notes.
3. New table `terms_fts` for term names and definitions.
4. Unified search API: returns results grouped by source (Papers / Highlights / Terms) with relevance ranking.
5. Result items show the matching snippet with highlighted match terms.
6. Search latency < 200ms for 1000-paper library.

#### Implementation

- **Migration** `0014_fts_extend.sql`:
  - Rebuild `papers_fts` to include more columns.
  - Create `highlights_fts` (content = highlight text + note, linked to paper_id).
  - Create `terms_fts` (content = term + definition + evidence, linked to paper_id).
  - Triggers to keep all FTS tables in sync.
- **Rust**: Modify `papers_search` command to query all three FTS tables, merge and rank results.
- **Frontend**: Extend the search bar in Shell or Command Palette to show categorized results.

#### Success Criteria

- Searching for a phrase from any highlight or note returns the correct paper.
- Search latency < 200ms on a 1000-paper library.
- Results show matching snippets, not just paper titles.

---

### F-01: Structured Note Cards (Paper Canvas)

**Goal:** Replace the single free-text note per paper with a structured card system: Problem, Method, Key Numbers, Limitations, My Thoughts. AI outputs auto-fill the card.

**Motivation:** Researchers fill in the same mental template for every paper. Making this explicit improves both reading discipline and retrieval ("show me all papers where I noted a limitation about sample size").

#### Design Requirements

1. Each paper has a set of note sections (configurable, defaults: Problem, Method, Key Numbers, Limitations, Thoughts).
2. Sections are independently editable, collapsible, and reorderable.
3. AI features (TL;DR, Quick Read) auto-populate corresponding sections on first run.
4. User edits are never overwritten by re-running AI — AI fills empty sections only, or appends with timestamp.
5. Sections are searchable via FTS (see F-15).

#### Implementation

- **Migration** `0015_note_sections.sql`:
  ```sql
  CREATE TABLE paper_note_sections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      paper_id TEXT NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
      section_key TEXT NOT NULL,       -- 'problem', 'method', 'numbers', 'limits', 'thoughts'
      content TEXT NOT NULL DEFAULT '',
      source TEXT NOT NULL DEFAULT 'user',  -- 'user' | 'ai:tldr' | 'ai:quick_read'
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      UNIQUE(paper_id, section_key)
  );
  ```
- **Rust**: New commands `note_sections_get`, `note_sections_save`, `note_sections_reorder`. Modify `paper_tldr` and `paper_quick_read` to also write into sections.
- **Frontend**: Replace the single `<textarea>` in Reader notes tab with a section-based card component. Each card has a header (section name), content area, and source badge (user/AI).

#### Success Criteria

- Quick Read output appears in structured sections, not a flat block.
- User can add custom sections (e.g., "My Experiment Ideas").
- Section content is indexed by FTS.

---

## P2 — Discovery & Ecosystem

---

### F-18: Similar Paper Recommendations

**Goal:** Given a paper in the library, find similar papers from the broader academic corpus using external APIs.

**Motivation:** After reading a paper, "what else should I read?" is the next natural question. Topic Search requires the user to formulate a query; this is automatic.

#### Design Requirements

1. Entry point: "Find Similar" button in paper detail drawer and Reader header.
2. Use Semantic Scholar Recommendations API (`/paper/{id}/recommendations`) or OpenAlex `related_works`.
3. Filter out papers already in the library.
4. Display results as cards (title, authors, year, abstract snippet, relevance score).
5. "Add to Library" button on each result card.
6. Cache results for 7 days to avoid redundant API calls.

#### Implementation

- **Rust** `src-tauri/src/discovery/similar.rs`:
  - `find_similar(paper: &Paper) -> Result<Vec<Recommendation>>` — calls Semantic Scholar API using DOI or title match.
  - Cache table `recommendation_cache` (paper_id, results_json, fetched_at).
- **Tauri command**: `paper_similar`.
- **Frontend**: New "Similar" tab in paper detail drawer, or a slide-over panel.

#### Success Criteria

- Recommendations returned in < 5 seconds.
- At least 5 relevant results per paper (when DOI exists).
- Already-in-library papers are filtered out.

---

### F-23: BibTeX / RIS Batch Export

**Goal:** Select multiple papers and export their citations as `.bib` or `.ris` files.

**Motivation:** Writing a paper requires a bibliography file. Today users must manually assemble it. One-click batch export eliminates this friction.

#### Design Requirements

1. Entry point: multi-select papers in Library → "Export Citations" in batch toolbar.
2. Format options: BibTeX (`.bib`), RIS (`.ris`), or plain text formatted per citation style (APA, IEEE, GB/T 7714).
3. Output: download as file or copy to clipboard.
4. Filename: `litera-export-{date}.{ext}`.
5. Each entry uses the auto-generated BibTeX (F-11) as the source of truth.

#### Implementation

- **Rust** `src-tauri/src/export/citations.rs`:
  - `export_bibtex(papers: &[Paper]) -> String` — concatenates `paper.bibtex` fields.
  - `export_ris(papers: &[Paper]) -> String` — converts metadata to RIS format.
  - `format_citation(paper: &Paper, style: CitationStyle) -> String` — formats per style guide.
- **Tauri command**: `export_citations` (returns string, frontend triggers download).
- **Frontend**: Batch toolbar action with format picker dropdown.

#### Success Criteria

- Exported `.bib` file parses without errors in `bibtex` / `biber`.
- RIS file imports cleanly into Zotero / Mendeley.
- GB/T 7714 format matches the Chinese national standard.

---

### F-19: Citation Network Visualization

**Goal:** Show a paper's citation graph — who it cites and who cites it — pulled from Semantic Scholar.

**Motivation:** Knowledge Graph (existing) shows user-defined relationships. Citation Network shows the academic community's view of relationships. Together they give a complete picture.

#### Design Requirements

1. Entry point: "Citations" button in paper detail or Graph page.
2. Fetch from Semantic Scholar: `references` (papers this cites) and `citations` (papers citing this).
3. Display as a tree: center paper → cited papers (left) / citing papers (right), max 2 levels deep.
4. Papers already in the library are highlighted (green border).
5. Click a node to see abstract; "Add to Library" button if not already imported.
6. Cache fetched citation data in a `paper_citations` table.

#### Implementation

- **Migration** `0016_citations.sql`:
  ```sql
  CREATE TABLE paper_citations (
      paper_id TEXT NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
      cited_paper_id TEXT NOT NULL,       -- Semantic Scholar paper ID
      cited_title TEXT NOT NULL,
      cited_authors TEXT,                 -- JSON array
      cited_year INTEGER,
      cited_venue TEXT,
      cited_doi TEXT,
      direction TEXT NOT NULL,            -- 'references' | 'citations'
      fetched_at INTEGER NOT NULL,
      UNIQUE(paper_id, cited_paper_id, direction)
  );
  ```
- **Rust** `src-tauri/src/discovery/citations.rs`:
  - `fetch_citations(paper: &Paper) -> Result<CitationGraph>` — calls Semantic Scholar `/paper/{id}` with `fields=references,citations`.
- **Frontend**: New view mode in Graph page "Citation Tree", or a dedicated panel.

#### Success Criteria

- Citation tree loads in < 5 seconds.
- In-library papers are visually distinguished.
- Cached data avoids redundant API calls.

---

## P3 — Reading Workflow Polish

---

### F-02: Side-by-Side Paper Comparison

**Goal:** Open two papers in split view — PDF on left, PDF on right — with synchronized zoom/scroll options.

**Motivation:** Comparing methodology sections, figures, or results tables across two papers is a common task. Currently requires two windows or constant tab switching.

#### Design Requirements

1. Entry point: right-click a paper → "Open in Split View" or drag a paper to the side of the reader.
2. Two independent PDF viewers sharing the same window width (50/50 split, resizable divider).
3. Each side has its own toolbar, highlights, and notes.
4. Optional sync mode: link scroll positions (useful for comparing same-structure papers).

#### Implementation

- **Frontend**: Modify `ReaderPage.tsx` to support a `splitPaperId` query param or state. When set, render two `PdfViewer` instances side by side.
- No new backend required — reuse existing `paper_read_pdf_bytes` and highlight commands.

#### Success Criteria

- Two PDFs render independently without interfering.
- Resizing the divider is smooth (no re-render of PDFs).
- Memory usage stays under 2x a single reader.

---

### F-03: Annotation Color Semantics

**Goal:** Assign semantic meanings to highlight colors so they can be filtered, aggregated, and used as AI input.

**Motivation:** Researchers use different colors intuitively (yellow = important, pink = disagree, blue = method). Making this explicit enables "show me all my disagreements" or "summarize only my method highlights."

#### Design Requirements

1. Configurable color-label mapping in Settings (defaults: yellow=Key Finding, purple=Method, blue=To Verify, red=Disagree, green=Citable).
2. Highlight creation UI shows the label alongside the color swatch.
3. New filter in Reader sidebar: filter highlights by color/label.
4. AI features can be scoped: "Summarize only my Key Finding highlights."
5. Export (F-21) groups highlights by label.

#### Implementation

- **Migration** `0017_highlight_labels.sql`: `ALTER TABLE highlights ADD COLUMN label TEXT;`
- **Frontend**: Color picker becomes a labeled color picker. Sidebar gets a filter row. Settings page gets a color-label config section.
- **AI integration**: Modify highlight summarize prompt to accept an optional label filter.

#### Success Criteria

- Users can assign and see labels on all highlights.
- Filtering by label in the Reader sidebar works instantly.
- AI summarize respects label filters.

---

### F-04: Reading Queue with Priorities

**Goal:** A dedicated reading queue with drag-and-drop ordering, target dates, and progress tracking.

**Motivation:** `read_status: must` is too coarse. Researchers have 20+ papers they intend to read, but need to prioritize by deadline or relevance.

#### Design Requirements

1. New page or section: `/library` tab "Queue" showing papers in priority order.
2. Drag-and-drop reordering. Target read date (optional). Notes on why queued.
3. Papers auto-move to "Reading" when opened in Reader.
4. Overdue papers (past target date) are highlighted.
5. Queue is independent of folders/tags — a paper can be in any folder and still in the queue.

#### Implementation

- **Migration** `0018_reading_queue.sql`:
  ```sql
  CREATE TABLE reading_queue (
      paper_id TEXT NOT NULL REFERENCES papers(id) ON DELETE CASCADE PRIMARY KEY,
      priority INTEGER NOT NULL DEFAULT 0,
      target_date INTEGER,
      note TEXT,
      added_at INTEGER NOT NULL
  );
  ```
- **Tauri commands**: `queue_list`, `queue_add`, `queue_remove`, `queue_reorder`, `queue_update`.
- **Frontend**: New tab or sidebar section in Library. Drag handle on each item.

#### Success Criteria

- Reordering persists across sessions.
- Opening a queued paper auto-updates its status.
- Queue is accessible from the Library page without navigating away.

---

### F-05: Figure & Table Jump Links

**Goal:** Detect "Figure N" / "Table N" references in PDF text and make them clickable, jumping to the referenced figure/table.

**Motiation:** In long papers, "see Figure 5" requires manual scrolling. Auto-linking saves minutes per paper.

#### Design Requirements

1. During PDF text layer rendering, regex-match patterns: `Figure \d+`, `Fig. \d+`, `Table \d+`, `Eq. \d+`.
2. Each match becomes a clickable span. On click, scroll the PDF to the page where the referenced figure/table caption appears.
3. Requires a mapping of figure numbers to page numbers (build from caption text during PDF load).

#### Implementation

- **Frontend-only** (no backend changes):
  - During PDF.js text layer rendering, post-process spans to detect references.
  - Build a caption index: scan all pages for `Figure \d+:` / `Table \d+:` patterns, record page numbers.
  - On click, call `scrollPageIntoView(pageNumber)`.

#### Success Criteria

- "Figure 3" in body text is visually distinct (underline + hover color).
- Clicking it scrolls to the page containing "Figure 3:" caption.
- Works for all standard reference formats (Figure, Fig., Table, Eq.).

---

### F-07: Literature Review Draft Generation [AI]

**Goal:** Given a folder or tag group of papers, generate a structured literature review draft.

**Motiation:** After collecting 20-50 papers for a thesis chapter, the first draft of the lit review is the hardest. AI can produce an organized starting point.

#### Design Requirements

1. Entry point: folder context menu → "Generate Review" or batch toolbar action.
2. AI groups papers by theme, generates sections: Introduction, Theme 1, Theme 2, ..., Research Gaps, Conclusion.
3. Each section summarizes the relevant papers, cites them by `[Author, Year]`, and notes methodological trends.
4. Output is Markdown, editable, saveable as a note file.
5. Re-generable with different groupings (by method, by year, by application domain).

#### Implementation

- **Rust** `src-tauri/src/ai/lit_review.rs`:
  - `generate_review(pool, paper_ids: &[String], grouping: GroupingStrategy) -> Result<String>`.
  - System prompt: academic writing style, structured sections, inline citations.
  - Input: TL;DR + Quick Read + abstract for each paper.
- **Tauri command**: `generate_lit_review`.
- **Frontend**: New page or modal showing the generated Markdown with edit/save/export buttons.

#### Success Criteria

- Generated review has coherent section structure.
- Each paper is cited at least once.
- Output is 2000-5000 words for 20 papers.

---

### F-09: Cross-Paper Concept Graph [AI]

**Goal:** Build a graph of methodological concepts and their relationships (replaces, extends, requires) extracted from paper full texts.

**Motiation:** Current concept nodes come from `paper_terms` overlap. A richer concept graph shows how methods evolve: "Transformer replaces RNN", "LoRA extends fine-tuning".

#### Design Requirements

1. AI extracts methodological concepts from paper bodies (not just terms).
2. Concepts have typed relationships: `replaces`, `extends`, `requires`, `enables`, `competes_with`.
3. Concepts appear as nodes in the Knowledge Graph, connected to papers and to each other.
4. Concept nodes are reusable across papers (normalized names).
5. User can edit/delete AI-extracted concepts.

#### Implementation

- **Migration** `0019_concepts.sql`:
  ```sql
  CREATE TABLE concepts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      description TEXT,
      source TEXT NOT NULL DEFAULT 'ai',
      created_at INTEGER NOT NULL
  );
  CREATE TABLE concept_relations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_concept_id INTEGER NOT NULL REFERENCES concepts(id),
      target_concept_id INTEGER NOT NULL REFERENCES concepts(id),
      relation TEXT NOT NULL,
      evidence_paper_id TEXT REFERENCES papers(id),
      snippet TEXT,
      created_at INTEGER NOT NULL
  );
  CREATE TABLE paper_concepts (
      paper_id TEXT NOT NULL REFERENCES papers(id),
      concept_id INTEGER NOT NULL REFERENCES concepts(id),
      relevance REAL NOT NULL DEFAULT 1.0,
      PRIMARY KEY (paper_id, concept_id)
  );
  ```
- **Rust** `src-tauri/src/ai/concept_extract.rs`:
  - `extract_concepts(pool, paper_ids: &[String]) -> Result<Vec<ExtractedConcept>>`.
- **Frontend**: Extend Graph page to show concept-to-concept edges with different styling.

#### Success Criteria

- At least 3 meaningful concept relations extracted per 10 papers.
- Concept names are normalized (no duplicates for the same method).
- Graph page renders concept-to-concept edges distinctly from paper-to-paper edges.

---

### F-10: Deep QA (Multi-Turn Conversation) [AI]

**Goal:** Extend Library Ask into a multi-turn conversation with follow-up questions, refinements, and cross-paper drilling.

**Motiation:** Single-turn RAG answers the first question but not "why did they use that method?" or "how does this compare to the other paper?" — which require context from the previous answer.

#### Design Requirements

1. Ask page becomes a chat interface with message history.
2. Follow-up questions use the conversation context for disambiguation.
3. Each answer still cites sources with `[N]` references.
4. "Drill into paper X" action narrows the RAG context to a single paper's full text.
5. Conversation history is persisted per session (not across app restarts by default).

#### Implementation

- **Rust**: Modify `library_ask` to accept an optional `conversation_history: Vec<Message>` parameter. Include prior Q&A in the LLM prompt.
- **Frontend**: Replace the single-result Ask page with a chat-style UI (message bubbles, input bar at bottom).

#### Success Criteria

- Follow-up questions resolve pronouns and references ("it" → the paper just discussed).
- Answer quality does not degrade over 5+ turns.
- Each turn still provides source citations.

---

### F-12: Smart Collections (Saved Filters)

**Goal:** Create virtual folders based on filter rules that auto-update as papers are added or modified.

**Motivation:** Researchers work on multiple projects simultaneously. "All 2024+ transformer papers I haven't read" is a useful view that can't be expressed with static folders.

#### Design Requirements

1. Create a smart collection with a rule: combination of tags, folders, read_status, year range, custom fields.
2. Smart collections appear in the sidebar alongside regular folders.
3. Papers matching the rule are shown dynamically — no manual assignment.
4. Rules are editable. Deleting a smart collection does not delete papers.
5. Rule UI: visual filter builder (dropdowns for field/operator/value, AND/OR combinators).

#### Implementation

- **Migration** `0020_smart_collections.sql`:
  ```sql
  CREATE TABLE smart_collections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      rules TEXT NOT NULL,              -- JSON rule tree
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
  );
  ```
- **Rust**: New command `smart_collection_query` that translates rules to SQL WHERE clauses.
- **Frontend**: New sidebar section "Smart Collections" with create/edit dialog.

#### Success Criteria

- Smart collection updates instantly when a paper's tags/status changes.
- Rule builder supports at least: tags, folders, read_status, year, title contains.
- 10+ smart collections don't noticeably slow down the sidebar.

---

### F-13: Custom Metadata Fields

**Goal:** Add arbitrary key-value metadata to any paper: project, priority, deadline, experiment batch, etc.

**Motivation:** Different researchers organize differently. Hard-coding fields (like "project") is inflexible. Custom fields let users define their own taxonomy.

#### Design Requirements

1. Per-paper custom fields: `key: value` pairs (e.g., `project: thesis-ch3`, `priority: high`).
2. Field definitions are global — once you create a "project" field, it appears on all papers (optional).
3. Custom fields are filterable and sortable.
4. Field types: text, number, date, select (dropdown with predefined options).
5. Custom fields appear in the paper detail drawer and in export (F-21).

#### Implementation

- **Migration** `0021_custom_fields.sql`:
  ```sql
  CREATE TABLE custom_field_defs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      field_type TEXT NOT NULL,         -- 'text', 'number', 'date', 'select'
      options TEXT,                     -- JSON array for 'select' type
      created_at INTEGER NOT NULL
  );
  CREATE TABLE paper_custom_fields (
      paper_id TEXT NOT NULL REFERENCES papers(id),
      field_id INTEGER NOT NULL REFERENCES custom_field_defs(id),
      value TEXT NOT NULL,
      PRIMARY KEY (paper_id, field_id)
  );
  ```
- **Tauri commands**: `custom_field_defs_list`, `custom_field_def_create`, `paper_custom_fields_get`, `paper_custom_field_set`.
- **Frontend**: Settings section for field definitions. Paper drawer shows custom fields section with inline editing.

#### Success Criteria

- Users can create, edit, and delete custom field definitions.
- Custom field values persist and are searchable.
- Export includes custom fields in frontmatter.

---

### F-14: Paper Deduplication

**Goal:** Detect and merge duplicate papers during import and in the existing library.

**Motiation:** Importing from multiple sources (DOI, arXiv, PDF) creates duplicates. Manual dedup is tedious and error-prone.

#### Design Requirements

1. On import: check DOI match, arXiv ID match, and title similarity (Levenshtein distance < 0.15 normalized).
2. If duplicate detected: show a merge dialog — keep the record with more metadata, merge highlights/notes from both.
3. Library-wide scan: "Find Duplicates" button in Settings scans all papers and lists suspected pairs.
4. User can merge or dismiss each pair.

#### Implementation

- **Rust** `src-tauri/src/storage/dedup.rs`:
  - `find_duplicate(paper: &Paper, pool) -> Option<Paper>` — checks DOI, arXiv ID, title similarity.
  - `merge_papers(pool, keep_id, merge_id) -> Result<()>` — transfers highlights, notes, tags, folders, terms, links from merge_id to keep_id, then deletes merge_id.
- **Tauri command**: `paper_find_duplicates`, `paper_merge`.
- **Frontend**: Import flow shows duplicate warning. Settings has a "Find Duplicates" tool.

#### Success Criteria

- Duplicate detection catches same-DOI and same-arXiv-ID papers 100% of the time.
- Title similarity catches common variations (>90% recall on test set).
- Merge preserves all highlights, notes, and metadata from both records.

---

### F-16: Batch Import Optimization

**Goal:** Improve bulk PDF import with folder drag-and-drop, filename heuristic parsing, and progress tracking.

**Motivation:** Migrating from Zotero/Mendeley means importing hundreds of PDFs. Current `import_pdf_files` works but lacks UX for large batches.

#### Design Requirements

1. Drag-and-drop a folder onto the Import page → recursively find all `.pdf` files.
2. Filename heuristic: parse `{Author}_{Year}_{Title}.pdf` patterns to pre-fill metadata.
3. Real-time progress bar with counts: "Processing 23/150... (3 failed)".
4. Failed files listed with reasons (corrupted PDF, no text layer, etc.).
5. Parallel processing: 4 PDFs concurrently (configurable).

#### Implementation

- **Rust**: Modify `import_pdf_files` to accept a directory path (Tauri `fs` plugin). Walk directory recursively. Add heuristic metadata extraction from filename.
- **Frontend**: Import page gets a "Import Folder" button alongside "Import PDF Files". Progress shown via event stream (similar to `topic-survey-progress`).

#### Success Criteria

- 100 PDFs imported in < 5 minutes (including metadata extraction).
- Filename heuristic correctly parses >70% of common naming conventions.
- Failed files are clearly reported with actionable reasons.

---

### F-17: Citation Style Formatting

**Goal:** Format paper citations in standard academic styles (APA, IEEE, GB/T 7714, Chicago) for direct use in manuscripts.

**Motiation:** After finding a paper, researchers need to paste a formatted citation into their document. Today they switch to Google Scholar for this.

#### Design Requirements

1. Per-paper "Copy Citation" button with style picker (APA 7th, IEEE, GB/T 7714-2015, Chicago 17th).
2. Batch: select multiple papers → "Copy Citations" as a formatted reference list.
3. Citation string generated from the paper's metadata fields.
4. Styles are template-driven — users can add custom styles.

#### Implementation

- **Rust** `src-tauri/src/export/citation_styles.rs`:
  - `format_citation(paper: &Paper, style: &str) -> String` — template-based formatting.
  - Templates stored as string constants for each style.
- **Frontend**: Dropdown menu on "Copy Citation" button. Batch toolbar action.

#### Success Criteria

- Generated APA citations match the official APA 7th edition format.
- GB/T 7714 citations match the Chinese national standard.
- Batch export produces a properly numbered reference list.

---

### F-20: Topic Alert (Periodic Monitoring)

**Goal:** Set up recurring topic searches that notify when new relevant papers appear.

**Motivation:** RSS subscribes to sources; Topic Alert subscribes to topics. Complementary discovery mechanisms.

#### Design Requirements

1. Create an alert: topic query + frequency (daily / weekly / on app launch).
2. On trigger: run `topic_discover` with the stored query, compare results against existing library, surface only new papers.
3. Notification badge on the nav item + a list of new papers in the Topic page.
4. Alerts are listed and manageable in Settings.
5. Auto-import option: new papers from alerts can be auto-added to a designated folder.

#### Implementation

- **Migration** `0022_topic_alerts.sql`:
  ```sql
  CREATE TABLE topic_alerts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      query TEXT NOT NULL,
      frequency TEXT NOT NULL,          -- 'daily', 'weekly', 'on_launch'
      target_folder_id INTEGER,
      auto_import INTEGER NOT NULL DEFAULT 0,
      last_run_at INTEGER,
      created_at INTEGER NOT NULL
  );
  CREATE TABLE topic_alert_results (
      alert_id INTEGER NOT NULL REFERENCES topic_alerts(id),
      paper_doi TEXT,
      paper_arxiv_id TEXT,
      title TEXT NOT NULL,
      seen INTEGER NOT NULL DEFAULT 0,
      added_at INTEGER NOT NULL
  );
  ```
- **Rust**: `run_alerts(pool, http)` — iterates active alerts, runs discovery, stores new results.
- **Frontend**: Settings section for alerts. Notification badge on Topic nav.

#### Success Criteria

- Alerts run at the configured frequency without blocking the UI.
- New papers are correctly identified (not already in library).
- Auto-import creates paper records with proper metadata.

---

### F-25: Virtual Scrolling + Embedding Cache

**Goal:** Keep the UI fast with 1000+ papers and avoid redundant embedding API calls for RAG.

**Motivation:** Performance degrades with large libraries. React renders all paper cards; RAG re-embeds the same papers every question.

#### Design Requirements

1. **Virtual scrolling**: Paper lists (Library, folder views) use virtualized rendering — only visible items are in the DOM.
2. **Embedding cache**: Store paper embeddings in a `paper_embeddings` table. Reuse cached embeddings for RAG queries. Invalidate on paper content change.
3. Target: library with 2000 papers scrolls at 60fps; RAG query skips re-embedding for unchanged papers.

#### Implementation

- **Frontend**: Install `@tanstack/react-virtual`. Replace `<div>` list containers with `useVirtualizer` in LibraryPage and folder views.
- **Migration** `0023_embeddings.sql`:
  ```sql
  CREATE TABLE paper_embeddings (
      paper_id TEXT NOT NULL REFERENCES papers(id),
      model TEXT NOT NULL,
      embedding BLOB NOT NULL,
      content_hash TEXT NOT NULL,       -- hash of the text that was embedded
      created_at INTEGER NOT NULL,
      PRIMARY KEY (paper_id, model)
  );
  ```
- **Rust**: Modify `library_ask` to check `paper_embeddings` before calling the embedding API. Store new embeddings after generation.

#### Success Criteria

- Library page with 2000 papers renders in < 100ms (initial paint).
- Second RAG query on the same papers skips embedding (visible in logs as "cache hit").
- No user-visible behavior change — just faster.

---

## Summary Table

| ID | Feature | Priority | Effort | Depends On |
|----|---------|----------|--------|------------|
| F-11 | Auto BibTeX | P0 | S | — |
| F-21 | Obsidian Markdown Export | P0 | M | — |
| F-24 | Command Palette | P0 | M | — |
| F-06 | Multi-Paper Compare [AI] | P1 | M | — |
| F-15 | Unified Full-Text Search | P1 | M | — |
| F-01 | Structured Note Cards | P1 | L | — |
| F-18 | Similar Paper Recommendations | P2 | M | — |
| F-23 | BibTeX/RIS Batch Export | P2 | S | F-11 |
| F-19 | Citation Network | P2 | L | — |
| F-02 | Side-by-Side Comparison | P3 | M | — |
| F-03 | Annotation Color Semantics | P3 | S | — |
| F-04 | Reading Queue | P3 | M | — |
| F-05 | Figure/Table Jump Links | P3 | M | — |
| F-07 | Literature Review Draft [AI] | P3 | M | — |
| F-09 | Cross-Paper Concept Graph [AI] | P3 | L | — |
| F-10 | Deep QA Multi-Turn [AI] | P3 | L | — |
| F-12 | Smart Collections | P3 | M | — |
| F-13 | Custom Metadata Fields | P3 | M | — |
| F-14 | Paper Deduplication | P3 | M | — |
| F-16 | Batch Import Optimization | P3 | M | — |
| F-17 | Citation Style Formatting | P3 | S | F-11 |
| F-20 | Topic Alert | P3 | M | — |
| F-25 | Virtual Scrolling + Embedding Cache | P3 | M | — |

> S = 1-2 days, M = 3-5 days, L = 1-2 weeks
