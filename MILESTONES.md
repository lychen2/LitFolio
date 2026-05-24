# Milestones

This file tracks per-milestone completion state for the Litera build.
Plan: `../../.omc/plans/litera-desktop-plan.md`

| ID | Title | Status | Notes |
|----|-------|--------|-------|
| M0 | Project skeleton | ✅ done | Tauri 2 + React + TS scaffold, build clean |
| M1 | SQLite data layer | ✅ done | sqlx + migrations + Paper CRUD |
| M2 | Ingest pipeline | ✅ done | DOI / arXiv / BibTeX / PDF / Semantic Scholar |
| —  | Topic discovery | ✅ bonus | Latest important + classic top-20 via S2 bulk |
| M4 | LLM adapter + summarization | ✅ done | OpenAI-compatible client, TL;DR, 4-part Quick Read |
| M3 | Three-pane reader | next | PDF.js + Markdown editor + linkage |
| M5 | AI workflows | partial | TL;DR + Quick Read done; structured extract + tagging cluster pending |
| M6 | RAG + search | pending | tantivy + sqlite-vec + hybrid retrieval |
| M7 | Views & organization | pending | list/card/table/kanban + tags/folders |
| M8 | Export & reliability | pending | ZIP export + auto-backup + crash logs |
| M9 | Graph view (v2) | future | citations/references graph |

## Verification log

### M0 — Project skeleton ✅
- `pnpm typecheck` clean · `pnpm build` 1.18s · `cargo build` ok

### M1 — SQLite data layer ✅
- 3/3 unit tests passing
- Schema: papers (+FTS5) / tags / folders / highlights / ai_jobs + joins
- Library root bootstrap `~/Litera-Library/`

### M2 — Ingest pipeline ✅
- **M2.1** DOI via CrossRef · arXiv via Atom · BibTeX parser
- **M2.2** PDF batch import via `lopdf` (title/author/DOI scrape + SHA-256 + sidecar `meta.json`)
- **M2.3** Semantic Scholar search with token-bucket rate limit (80/5min)

### Topic discovery 🌟 (bonus feature)
- Two-column UI: **Latest important** (last N years, cite-sorted) · **Classics** (all-time top-cited)
- "Add all 20" bulk action
- Backend: `ingest/topic.rs` runs two `paper/search/bulk` calls in parallel

### M4 — LLM adapter + summarization ✅
- OpenAI-compatible chat client (works with OpenAI / DeepSeek / Moonshot / SiliconFlow / Ollama / Together / Azure)
- Settings page: profile CRUD, active-profile selector, presets, key reveal toggle, "Test" button (replies "pong")
- Per-paper actions in Library:
  - **TL;DR**: 1-sentence + 3-5 key findings → persisted to paper
  - **Quick read**: 4-section deep-read drawer:
    1. 解决什么问题 (research_question)
    2. 提出了什么方法 (method)
    3. 和别人有什么不同 (comparison) — new field added via migration 0002
    4. 局限与未解决的问题 (limitations)
- Cached results auto-display next time the drawer opens
- Schema migration 0002: `ALTER TABLE papers ADD COLUMN comparison TEXT`

### Test totals
`cargo test --lib` — **26/26 passing** including:
- New: `ai::client::endpoint_joins_correctly`, `ai::client::truncate_works`
- New: `ai::profile::roundtrip_persists_profile`, `upsert_overwrites_same_name`, `active_falls_back_to_first`
- New: `ai::summarize::tldr_parses_clean_json`, `tldr_parses_fenced_json`, `quickread_parses_four_fields`, `parses_prose_wrapped_json`
- New: `storage::papers::update_quick_read_persists_all_four`
- New: `ingest::topic::default_request_sane`

`pnpm typecheck` clean · `pnpm build` 1.18s (1638 modules, 257 kB JS / 78 kB gzip)

## Notes

### Cargo mirror
crates.io direct connection works; all Chinese mirrors are SSL-flapping right
now. `.cargo/config.toml` currently has no `replace-with`. SJTUG worked once
but has since started flapping too.

### Next iteration entry points
- **M3**: PDF.js in the reader middle pane + Tiptap MD editor on the right
  with PDF↔note linkage (selection → blockquote with backlink).
- **M5 finish**: AI tagging via embedding cluster (DBSCAN/k-means) +
  structured field extraction (currently the prompt only fills problem/method
  via Quick Read; expand to dataset/key_findings_json).
- **M6**: tantivy full-text + sqlite-vec vector index for the Ask page (RAG).
- **Topic + LLM**: wire the "summarize this hit" button on the Topic page
  to call `paper_tldr` after `add_from_search`.
