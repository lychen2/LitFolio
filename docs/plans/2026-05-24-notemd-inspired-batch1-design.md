# Notemd-Inspired Litera Upgrade — Batch 1 Design

**Date:** 2026-05-24
**Owner:** litera-desktop
**Status:** Approved (user sign-off in brainstorming session)
**Approach:** Plan A · Phased delivery, two batches. This document covers **Batch 1** only; Batch 2 (custom prompt editor + wiki-link concept network) gets its own design after Batch 1 ships.

---

## 1 · Why

Two user asks merged into one delivery:

1. *"参考 obsidian-notemd 的设计理念优化项目"* — bring over the parts of Notemd that fit a literature library: per-task model routing, batch processing with live progress, custom prompts, and concept wiki-linking.
2. *"加一个用设定好的 AI 模型快速翻译标题和摘要的按钮"* — translate flow is a first-class feature, not a one-off prompt.

Constraints:
- The library already has TL;DR + Quick Read on single papers. Throughput is the bottleneck now — clicking "TL;DR" 100 times is unacceptable.
- Per-task routing matters because users want to send TL;DR to a cheap model (Haiku / deepseek-chat) and Quick Read to a heavy one (Opus / gpt-4o), not pay heavy-model prices for one-sentence summaries.
- Network is flaky from this region; one failed call shouldn't poison a 50-paper batch.

## 2 · Scope (Batch 1)

In:
- **Translate workflow**: title + abstract → target language, persisted alongside the originals.
- **Per-task model routing**: each AI task can target a specific profile, with fallback to the global active.
- **Batch processing**: multi-select in Library → run TL;DR / Quick Read / Translate / Add tag / Set status / Delete across the selection.
- **Live progress footer**: persistent bottom strip across the app, listens to Tauri events from the batch runner, supports cancel.

Out (Batch 2):
- Custom system-prompt editor per task with `{TITLE}` / `{ABSTRACT}` / `{LANG}` placeholders.
- Wiki-link concept extraction + `concepts` table + cross-paper concept page.

## 3 · Architecture

```
backend (Rust)                                   frontend (React + TS)
───────────────                                  ──────────────────────
ai/profile.rs       + TaskAssignments,           pages/SettingsPage    + Task routing section
                      TaskKind enum,             pages/LibraryPage     + selection state,
                      active_profile_for_task                            row checkboxes,
ai/translate.rs     new (translate_paper_text)                           Translate button
storage/papers.rs   + update_translation        components/BatchFooter  new sticky-bottom strip
storage/db migr 0005  4 new columns              components/SelectionBar new toolbar
commands            + paper_translate            components/Shell        mount BatchFooter once
                    + 5 batch_* commands         lib/api.ts              + 6 typed wrappers
                    + batch_cancel
AppState            + cancel: Arc<Mutex<Option<CancellationToken>>>
```

### 3.1 Data flow — single Translate

```
UI row hover → Translate button → invoke("paper_translate", {id, target_lang})
  ↳ backend: load profile_for_task(Translate)
  ↳ chat_complete with translation system prompt → parse JSON → {title, abstract}
  ↳ repo.update_translation(id, title_tx, abstract_tx, lang, now)
  ↳ return result; UI react-query invalidate "papers" + "paper:{id}"
```

### 3.2 Data flow — batch

```
SelectionBar → invoke("batch_tldr", { ids })
  ↳ backend creates CancellationToken, stores in AppState.cancel
  ↳ for each id in ids:
       if token.is_cancelled(): break
       emit "batch-progress" { done, total, current_id, current_title, phase: "start" }
       run summarize_paper_text → repo.update_tldr
       emit "batch-progress" { done++, total, current_id, current_title, phase: "ok"|"fail", error?: msg }
  ↳ emit "batch-done" { kind: "tldr", ok, failed, errors[] }
  ↳ return BatchSummary

Frontend BatchFooter uses tauri listen("batch-progress") + listen("batch-done"):
  ↳ progress bar fill = done/total
  ↳ caption = current_title
  ↳ X click → invoke("batch_cancel"); footer fades after batch-done
```

### 3.3 Cancellation

`AppState.cancel: Arc<Mutex<Option<CancellationToken>>>`
- batch start: lock, replace prior token if any with `Some(token.clone())`, release lock; spawn loop.
- on loop iter: check `token.is_cancelled()`.
- `batch_cancel` command: lock; if Some(t) call `t.cancel()`, set None.
- batch end (clean or cancelled): lock, set None.

Only one batch runs at a time. If user clicks a second batch while one is in flight: backend returns `Err("a batch is already running; cancel first")`. Frontend shows toast.

## 4 · Per-task Model Routing

### 4.1 Config schema

```rust
// ai/profile.rs (additive, backward compatible)
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct TaskAssignments {
    pub tldr: Option<String>,
    pub quick_read: Option<String>,
    pub translate: Option<String>,
    pub tag: Option<String>,       // reserved for Batch 2
    pub link: Option<String>,      // reserved for Batch 2
}

pub struct LlmConfig {
    pub profiles: Vec<LlmProfile>,
    pub active: Option<String>,
    #[serde(default)]
    pub task_assignments: TaskAssignments,
}

pub enum TaskKind { Tldr, QuickRead, Translate, Tag, Link }

pub fn active_profile_for_task<'a>(cfg: &'a LlmConfig, task: TaskKind) -> Result<&'a LlmProfile> {
    let assigned: Option<&str> = match task {
        TaskKind::Tldr      => cfg.task_assignments.tldr.as_deref(),
        TaskKind::QuickRead => cfg.task_assignments.quick_read.as_deref(),
        TaskKind::Translate => cfg.task_assignments.translate.as_deref(),
        TaskKind::Tag       => cfg.task_assignments.tag.as_deref(),
        TaskKind::Link      => cfg.task_assignments.link.as_deref(),
    };
    let name = assigned
        .or(cfg.active.as_deref())
        .or_else(|| cfg.profiles.first().map(|p| p.name.as_str()))
        .ok_or_else(|| anyhow!("no LLM profile configured; add one in Settings"))?;
    cfg.profiles.iter().find(|p| p.name == name)
        .ok_or_else(|| anyhow!("profile `{name}` not in config"))
}
```

Replace existing `active_profile(cfg)` calls in `paper_tldr` and `paper_quick_read` to use `active_profile_for_task(cfg, ...)`.

### 4.2 Settings UI

Below the existing profile list, a new card "Task routing":

```
Task          Model profile
TL;DR         [ Use active ▼ ]
Quick Read    [ Use active ▼ ]
Translate     [ Use active ▼ ]
Tag           [ Use active ▼ ]   (in use after Batch 2)
Link          [ Use active ▼ ]   (in use after Batch 2)
```

Each dropdown lists profile names + a leading "Use active profile" sentinel that maps to `None`.

## 5 · Translate Workflow

### 5.1 Migration 0005

```sql
ALTER TABLE papers ADD COLUMN title_translated TEXT;
ALTER TABLE papers ADD COLUMN abstract_translated TEXT;
ALTER TABLE papers ADD COLUMN translate_target_lang TEXT;
ALTER TABLE papers ADD COLUMN translated_at INTEGER;
```

Existing FTS5 triggers (0004) do not index these — out of scope for v1. Translation is for reading, not searching.

### 5.2 New module `ai/translate.rs`

```rust
pub struct TranslationResult {
    pub title: String,
    pub abstract_text: String,
    pub target_lang: String,
    pub model: String,
    pub prompt_tokens: u32,
    pub completion_tokens: u32,
}

const SYSTEM_PROMPT: &str = "\
You are a precise scientific translator. Translate the supplied paper title and \
abstract to {LANG}. Preserve technical terms (model names, algorithm names, \
mathematical symbols, units, dataset names) verbatim. Do not paraphrase or \
summarize. Return JSON only: {\"title\": \"...\", \"abstract\": \"...\"}.";

pub async fn translate_paper_text(
    client, profile, title, abstract, target_lang,
) -> Result<TranslationResult>
```

JSON parsing reuses the tolerant `parse_json` helper from `ai/summarize.rs` (handles bare JSON, code-fenced JSON, and prose-wrapped JSON).

### 5.3 Storage update

```rust
impl PaperRepo<'_> {
    pub async fn update_translation(
        &self, id: &str, title_tx: &str, abstract_tx: &str, lang: &str,
    ) -> Result<()> {
        sqlx::query(
            "UPDATE papers SET title_translated = ?1, abstract_translated = ?2,
                                translate_target_lang = ?3, translated_at = ?4,
                                updated_at = ?4 WHERE id = ?5",
        )
        .bind(title_tx).bind(abstract_tx).bind(lang).bind(now).bind(id)
        .execute(self.pool).await?;
        Ok(())
    }
}
```

### 5.4 Frontend integration

- Library row: insert a globe icon button in the right action stack (between TL;DR and Quick read). Click → `api.paperTranslate(id, "Chinese")`.
- After success: row shows `[译] {title_translated}` above the original title, abstract collapses below.
- Toggle: clicking the globe icon a second time hides the translation (not regenerated).
- Default target language: **"Chinese"**. Configurable later via a Settings dropdown (out of scope here).

## 6 · Batch Processing

### 6.1 New commands

```rust
#[tauri::command]
pub async fn paper_translate(state, id, target_lang) -> Result<TranslationResult, String>

#[tauri::command]
pub async fn batch_tldr(app: AppHandle, state, ids: Vec<String>) -> Result<BatchSummary, String>

#[tauri::command]
pub async fn batch_quick_read(app, state, ids) -> Result<BatchSummary, String>

#[tauri::command]
pub async fn batch_translate(app, state, ids, target_lang: Option<String>) -> Result<BatchSummary, String>

#[tauri::command]
pub async fn batch_attach_tag(state, ids: Vec<String>, tag_id: i64) -> Result<usize, String>

#[tauri::command]
pub async fn batch_set_status(state, ids, status: String) -> Result<usize, String>

#[tauri::command]
pub async fn batch_delete(state, ids) -> Result<usize, String>

#[tauri::command]
pub fn batch_cancel(state) -> Result<bool, String>
```

`batch_attach_tag` / `batch_set_status` / `batch_delete` are synchronous DB ops, no events needed.
`batch_tldr` / `batch_quick_read` / `batch_translate` are AI ops that emit events.

### 6.2 BatchSummary shape

```rust
#[derive(serde::Serialize)]
pub struct BatchSummary {
    pub kind: &'static str,
    pub total: usize,
    pub ok: usize,
    pub failed: usize,
    pub cancelled: bool,
    pub errors: Vec<BatchError>,
}
#[derive(serde::Serialize)]
pub struct BatchError {
    pub paper_id: String,
    pub title: String,
    pub message: String,
}
```

### 6.3 Event payloads

```ts
// 'batch-progress'
type Phase = "start" | "ok" | "fail";
type Progress = { kind: string; done: number; total: number;
                  current_id: string; current_title: string;
                  phase: Phase; error?: string };

// 'batch-done'
type Done = BatchSummary;
```

### 6.4 Frontend selection state

`LibraryPage` adds `const [selected, setSelected] = useState<Set<string>>(new Set())`. Each row left side: `<input type="checkbox" checked={selected.has(p.id)} onChange={toggle(p.id)} />`. Checkbox visible permanently (small) — Notemd's pattern: "visible state reduces miscicks".

When `selected.size > 0`, sticky `SelectionBar` appears at top: `{N} selected · Select all · Clear` + 6 action buttons. Each action button calls the matching `invoke(...)` then `setSelected(new Set())` on success.

### 6.5 BatchFooter

Mount once in `Shell`. Internal state: `{ kind, done, total, current_title, errors[], running: bool }`. On mount, set up `listen("batch-progress")` + `listen("batch-done")` (unlisten on unmount).

Layout: 36px high, sticky bottom, full width, fades in when `running`.

```
[████████░░░░░░░░░░] 8/20 · Translating "Attention Is All You Need…" · 1 failed   [✕]
```

X click → `invoke("batch_cancel")`. Errors badge clickable → expand a 200px-tall details panel above with the error list. Auto-dismiss footer 2s after `batch-done`.

## 7 · Error Handling

| Failure mode | Behaviour |
|---|---|
| Empty `ids` array | Return `BatchSummary { total: 0, ok: 0, ... }` immediately. No events emitted. |
| Profile not configured | Return `Err("Configure an LLM profile in Settings first")` before any work. Footer not shown. |
| Single-paper AI failure mid-batch | Recorded in `errors`, emit `batch-progress` with `phase: "fail"`, continue to next. |
| LLM returns malformed JSON | Wrapped as paper-level failure with message "Could not parse model output: <preview>". |
| Cancellation mid-batch | Stop loop after current paper; `BatchSummary.cancelled = true`; footer shows "Cancelled · 5/20". |
| Concurrent batch | New batch returns `Err("a batch is already running; cancel first")`. Frontend toast. |
| Tauri event emit failure | Logged via `tracing::warn!`; loop continues. Never propagate to user. |

## 8 · Testing Plan

| Layer | Tests |
|---|---|
| `active_profile_for_task` | Assigned wins · None falls back to active · None + no active falls back to first · empty config errors |
| `update_translation` | Round-trip persists all 4 fields · re-translate overwrites |
| `translate_paper_text` JSON parser | Reuses tested `parse_json`; add 1 test for translate-specific shape |
| Batch loop (mocked LLM via trait) | Reports ok+failed counts · stops on cancel · emits N events |
| Frontend `BatchFooter` | Visual states: idle / running / cancelling / done. Manual smoke test only (no Playwright yet). |

Existing 29 unit tests must remain green. Target: **35+ passing** after Batch 1.

## 9 · Acceptance Criteria

1. With `physics.optics` Browse → add 20 papers → select all in Library → click Translate → all 20 get Chinese title+abstract within ~60s on a typical OpenAI-compatible endpoint.
2. Mid-batch click ✕ — current paper completes, loop stops, footer shows "Cancelled · 7/20".
3. Settings → Task routing → set Translate to "deepseek-chat", TL;DR to "gpt-4o-mini" → both single and batch commands honour the assignment.
4. `cargo test --lib` ≥ 35 passing, `pnpm typecheck` clean, `pnpm build` clean.
5. Old `litera.config.json` without `task_assignments` field still loads (serde default).
6. Old DB without 4 new columns runs migration 0005 on next launch, all existing data intact.

## 10 · Out of Scope (Batch 2 follows)

- Custom prompt editor per task (placeholders `{TITLE}` / `{ABSTRACT}` / `{LANG}`).
- Wiki-link concept network: `concepts` table, LLM concept extraction, `[[link]]` insertion, Concepts page.
- Concurrent batch execution with staggered start (current: sequential).
- Translate target-language picker in Settings (current: hardcoded "Chinese").
- Batch operations on Topic page / Browse page (current: only Library page).

## 11 · Open questions (deferred)

- Should the batch footer survive page navigation? Current design: yes (mounted in `Shell`).
- Should batch ops appear in keyboard shortcuts (e.g. `Cmd+Shift+T` for TL;DR)? Defer.
- Should we record per-task token spend per profile, for cost tracking? Defer to a future Settings → Usage panel.

---

*End of Batch 1 design.*
