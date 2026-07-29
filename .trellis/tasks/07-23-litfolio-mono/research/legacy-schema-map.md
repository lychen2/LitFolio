# Legacy Schema Map (`0001`-`0035`)

## Rules

- Shipped migration files are immutable.
- Ownership below describes conversion targets, not edits to historical SQL.
- Mixed rows/tables require a converter and report; they are not moved by ad hoc SQL in feature-extraction tasks.
- Stable paper and annotation identifiers are preserved wherever the target model permits.

## Migration Ownership

| Migration | Current data | Target owner / action |
| --- | --- | --- |
| `0001_init` | papers, tags/folders, highlights, `ai_jobs`, paper FTS | Core; split legacy margin-note highlight rows into `pdf_notes` during conversion |
| `0002_quick_read` | Quick Read comparison field on papers | Core AI Reading compatibility; do not confuse with comparison records |
| `0003_fts_sync` | paper FTS triggers | Core baseline recreation |
| `0004_fts_rebuild` | paper FTS rebuild | Core baseline recreation |
| `0005_translation` | translated title/abstract fields | Core AI Reading |
| `0006_feeds` | feeds and feed items | `discovery-feeds` sidecar |
| `0007_highlight_translation` | highlight translation fields | Core AI Reading/annotations |
| `0008_highlight_summary` | highlight summary fields | Core AI Reading/annotations |
| `0009_paper_terms` | terminology rows | Core AI Reading |
| `0010_paper_links` | typed links between papers | `knowledge-graph` sidecar |
| `0011_bibtex` | paper BibTeX field | Core library |
| `0012_export` | paper export timestamp | Core basic export compatibility |
| `0013_comparisons` | comparison records | `research-workbench` sidecar |
| `0014_fts_extend` | papers/highlights/terms FTS and triggers | Core baseline, adjusted for dedicated `pdf_notes` search |
| `0015_note_sections` | structured note cards | Export to legacy-note archive; remove from default core UI |
| `0016_recommendations` | recommendation cache | discovery plugin ownership |
| `0017_citations` | paper citation cache | `knowledge-graph` sidecar |
| `0018_highlight_labels` | highlight label including margin-note discriminator | Core highlight labels; `reader-margin-note` is conversion input only |
| `0019_reading_queue` | queue rows | `library-plus` sidecar |
| `0020_smart_collections` | smart collection definitions | `library-plus` sidecar |
| `0021_custom_fields` | custom field definitions/values | `library-plus` sidecar |
| `0022_topic_alerts` | alerts and results | `discovery-feeds` sidecar |
| `0023_embeddings` | paper embeddings; vectors also exist on disk | `library-ask` sidecar and plugin-scoped files |
| `0024_concepts` | concepts, relations, paper joins | `knowledge-graph` sidecar |
| `0025_feed_item_metadata` | enriched feed metadata fields | `discovery-feeds` sidecar |
| `0026_highlight_explanation` | highlight explanation fields | Core AI Reading/annotations |
| `0027_candidate_inbox` | candidate papers | `discovery-feeds` sidecar |
| `0028_candidate_normalized_title` | candidate dedupe key/index | `discovery-feeds` sidecar |
| `0029_research_projects` | projects and project-paper joins | `research-workbench` sidecar |
| `0030_evidence_board` | project evidence items | `research-workbench` sidecar |
| `0031_paper_documents` | document metadata and document FTS | Core Reader/search |
| `0032_paper_document_index_status` | indexing status/error/timestamp | Core Reader/search |
| `0033_jobs` | generic jobs for core and optional workflows | Split by declared owner; core jobs remain in core, plugin jobs move with plugin |
| `0034_ask_sessions` | Ask sessions, optionally project-linked | `library-ask`; preserve project references as stable external IDs without cross-DB FK |
| `0035_paper_supplements` | supplement file metadata | `library-plus` sidecar; document conversion actions may call granted `document-services` capability |

## File-System Data

Current `LibraryPaths` defines:

- `library.db`;
- `papers/<paper-id>/` including PDF and document Markdown caches;
- `notes/<paper-id>.md`;
- `vectors/`;
- `attachments/`;
- `backups/`;
- `logs/`;
- `litera.config.json`.

Target additions include `plugins/<plugin-id>/data.db`, plugin-scoped file directories, and `archives/legacy-notes/`. Existing paths are not repurposed destructively during conversion.

## Conversion Report Minimum

The report records:

- source schema/migration version and target core/plugin data versions;
- backup path and integrity check;
- per-table source, converted, archived, skipped-empty, and failed counts;
- per-file preserved/copied/checksummed counts;
- defaulted fields for legacy `pdf_notes` style;
- unresolved references and owning plugin availability;
- stage marker, completion status, and rollback result.

## Fixture Matrix

At minimum, fixtures cover:

- a clean database at each migration boundary `0001`-`0035`;
- mixed ordinary highlights and margin-note pseudo-highlights;
- Markdown notes plus user and AI note sections, including empty defaults;
- plugin data with and without the owning plugin included;
- Ask sessions that reference projects;
- file paths, vector data, and supplements;
- interrupted conversion before sidecar creation, before verification, and before atomic switch;
- rerun after success and rerun after restored failure.
