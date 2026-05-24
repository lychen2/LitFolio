# Notemd-Inspired Litera Batch 1 — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add translate workflow, per-task model routing, and batch processing with live progress to Litera so users can manage 50+ papers in a single sweep.

**Architecture:** Backend (Rust/Tauri) gets schema migration 0005 for translate columns, `TaskAssignments` extension to `LlmConfig`, a new `ai/translate.rs` module, and 8 new IPC commands (1 single-translate + 7 batch). Batch commands emit `batch-progress` and `batch-done` Tauri events that a sticky `BatchFooter` component listens to. Settings gets a "Task routing" card; Library gets row checkboxes + a `SelectionBar` toolbar.

**Tech Stack:** Rust + sqlx + Tauri 2 + serde + tokio-util `CancellationToken`. Frontend React 18 + TanStack Query + Tauri `@tauri-apps/api/event` + Tailwind.

**Reference design:** `docs/plans/2026-05-24-notemd-inspired-batch1-design.md`

---

## Pre-flight

- Working directory: `/home/zonazcy/Projects/litera-desktop`
- Cargo working from `src-tauri/` (existing `.cargo/config.toml` configured)
- Baseline: 29/29 `cargo test --lib` passing, `pnpm typecheck` + `pnpm build` clean
- Each task ends with a commit — Task 0 initializes git if missing

---

### Task 0: Initialize git (if missing) and snapshot current state

**Files:**
- Run: shell commands only

**Step 1:** From repo root check git state.

```bash
cd /home/zonazcy/Projects/litera-desktop
[ -d .git ] && echo HAS_GIT || git init
```

**Step 2:** Stage everything, create initial baseline commit.

```bash
git add -A
git -c user.email=litera@local -c user.name=litera commit -m "chore: baseline before notemd-batch1"
```

**Step 3:** Verify.

```bash
git log --oneline -1   # should print the baseline commit
```

---

### Task 1: Migration 0005 — translation columns

**Files:**
- Create: `src-tauri/migrations/0005_translation.sql`

**Step 1: Write the migration.**

```sql
-- 0005 · paper translation (title + abstract) into a user-chosen target language
ALTER TABLE papers ADD COLUMN title_translated TEXT;
ALTER TABLE papers ADD COLUMN abstract_translated TEXT;
ALTER TABLE papers ADD COLUMN translate_target_lang TEXT;
ALTER TABLE papers ADD COLUMN translated_at INTEGER;
```

**Step 2: Run migrations test, expect it to still pass (additive).**

```bash
cd src-tauri && cargo test --lib storage::db::tests::migrations_apply_to_memory_db -- --nocapture
```

Expected: PASS.

**Step 3: Commit.**

```bash
git add src-tauri/migrations/0005_translation.sql
git -c user.email=litera@local -c user.name=litera commit -m "feat(storage): add 0005 migration for translation columns"
```

---

### Task 2: Extend `Paper` model with translation fields

**Files:**
- Modify: `src-tauri/src/storage/models.rs`
- Modify: `src-tauri/src/storage/papers.rs` (row mapper, `insert`, sample builder)
- Modify: `src-tauri/src/ingest/paper_draft.rs` (into_paper)

**Step 1: Add fields to `Paper`.**

In `models.rs`, inside the `Paper` struct (after `comparison`), add:

```rust
pub title_translated: Option<String>,
pub abstract_translated: Option<String>,
pub translate_target_lang: Option<String>,
pub translated_at: Option<i64>,
```

**Step 2: Extend `row_to_paper` in `papers.rs`.**

After the `comparison` field, append:

```rust
        title_translated: row.try_get("title_translated").ok(),
        abstract_translated: row.try_get("abstract_translated").ok(),
        translate_target_lang: row.try_get("translate_target_lang").ok(),
        translated_at: row.try_get("translated_at").ok(),
```

**Step 3: Update `PaperRepo::insert` to NOT bind these (DB defaults to NULL) — no change required since the existing INSERT statement omits them.** Verify by re-reading the insert query.

**Step 4: Update `into_paper` in `paper_draft.rs`.** Append after `comparison: None,`:

```rust
            title_translated: None,
            abstract_translated: None,
            translate_target_lang: None,
            translated_at: None,
```

**Step 5: Update test sample builder in `papers.rs::tests::sample` to include the four new None fields.** Append after `comparison: None,`:

```rust
            title_translated: None,
            abstract_translated: None,
            translate_target_lang: None,
            translated_at: None,
```

**Step 6: Compile & test.**

```bash
cargo check --message-format=short
cargo test --lib storage::papers::tests
```

Expected: 0 errors. All 4 existing storage tests pass.

**Step 7: Commit.**

```bash
git add -A
git -c user.email=litera@local -c user.name=litera commit -m "feat(storage): extend Paper model with translation fields"
```

---

### Task 3: `TaskAssignments` + `TaskKind` + `active_profile_for_task` (TDD)

**Files:**
- Modify: `src-tauri/src/ai/profile.rs`

**Step 1: Write failing tests first.**

Append to the `tests` module in `profile.rs`:

```rust
    #[test]
    fn task_assignment_resolves_to_assigned_profile() {
        let mut cfg = LlmConfig::default();
        cfg.upsert(sample_profile("cheap"));
        cfg.upsert(sample_profile("strong"));
        cfg.active = Some("cheap".into());
        cfg.task_assignments.quick_read = Some("strong".into());
        let p = active_profile_for_task(&cfg, TaskKind::QuickRead).unwrap();
        assert_eq!(p.name, "strong");
        let p = active_profile_for_task(&cfg, TaskKind::Tldr).unwrap();
        assert_eq!(p.name, "cheap"); // falls back to active
    }

    #[test]
    fn task_assignment_falls_back_to_first_when_no_active() {
        let mut cfg = LlmConfig::default();
        cfg.upsert(sample_profile("only"));
        let p = active_profile_for_task(&cfg, TaskKind::Translate).unwrap();
        assert_eq!(p.name, "only");
    }

    #[test]
    fn task_assignment_errors_when_profile_missing() {
        let mut cfg = LlmConfig::default();
        cfg.upsert(sample_profile("a"));
        cfg.task_assignments.translate = Some("nonexistent".into());
        assert!(active_profile_for_task(&cfg, TaskKind::Translate).is_err());
    }
```

**Step 2: Run, expect fails (undefined symbols).**

```bash
cargo test --lib ai::profile::tests
```

Expected: FAIL — `TaskKind`, `TaskAssignments`, `active_profile_for_task` not found.

**Step 3: Implement the new types + function.**

Add to `profile.rs`:

```rust
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct TaskAssignments {
    #[serde(default)] pub tldr: Option<String>,
    #[serde(default)] pub quick_read: Option<String>,
    #[serde(default)] pub translate: Option<String>,
    #[serde(default)] pub tag: Option<String>,
    #[serde(default)] pub link: Option<String>,
}

#[derive(Debug, Clone, Copy)]
pub enum TaskKind { Tldr, QuickRead, Translate, Tag, Link }

pub fn active_profile_for_task<'a>(cfg: &'a LlmConfig, task: TaskKind) -> Result<&'a LlmProfile> {
    let assigned: Option<&str> = match task {
        TaskKind::Tldr      => cfg.task_assignments.tldr.as_deref(),
        TaskKind::QuickRead => cfg.task_assignments.quick_read.as_deref(),
        TaskKind::Translate => cfg.task_assignments.translate.as_deref(),
        TaskKind::Tag       => cfg.task_assignments.tag.as_deref(),
        TaskKind::Link      => cfg.task_assignments.link.as_deref(),
    };
    if let Some(name) = assigned {
        return cfg.profiles.iter().find(|p| p.name == name)
            .ok_or_else(|| anyhow!("profile `{name}` not in config"));
    }
    active_profile(cfg)
}
```

Modify the `LlmConfig` struct (add field with `#[serde(default)]`):

```rust
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct LlmConfig {
    #[serde(default)] pub profiles: Vec<LlmProfile>,
    #[serde(default)] pub active: Option<String>,
    #[serde(default)] pub task_assignments: TaskAssignments,
}
```

**Step 4: Re-export from `ai/mod.rs`.**

Update the `pub use profile::{...}` line to include `TaskAssignments, TaskKind, active_profile_for_task`.

**Step 5: Run tests, expect PASS.**

```bash
cargo test --lib ai::profile::tests
```

Expected: 6+ tests pass (3 new + 3 existing).

**Step 6: Confirm existing config files still load (serde default).**

The existing `roundtrip_persists_profile` test still passes proves backward compat.

**Step 7: Commit.**

```bash
git add -A
git -c user.email=litera@local -c user.name=litera commit -m "feat(ai): per-task model routing via TaskAssignments"
```

---

### Task 4: Route existing TL;DR and Quick Read through `active_profile_for_task`

**Files:**
- Modify: `src-tauri/src/commands/mod.rs` (functions `paper_tldr`, `paper_quick_read`)

**Step 1: Find the two call sites of `active_profile(&cfg)` and change them.**

In `paper_tldr`, replace:

```rust
let prof = active_profile(&cfg).map_err(|e| e.to_string())?.clone();
```

with:

```rust
let prof = active_profile_for_task(&cfg, TaskKind::Tldr).map_err(|e| e.to_string())?.clone();
```

Same change in `paper_quick_read` with `TaskKind::QuickRead`.

**Step 2: Add to imports at top of `commands/mod.rs`:**

```rust
use crate::ai::{
    active_profile, active_profile_for_task, chat_complete, load_config, quick_read_paper_text,
    save_config, summarize_paper_text, ChatMessage, LlmConfig, LlmProfile, QuickReadResult,
    TaskAssignments, TaskKind, TldrResult,
};
```

(keep `active_profile` import — `llm_test` still uses it indirectly via direct profile)

**Step 3: Compile.**

```bash
cargo check --message-format=short
```

Expected: 0 errors.

**Step 4: Commit.**

```bash
git add -A
git -c user.email=litera@local -c user.name=litera commit -m "refactor(commands): route TL;DR + Quick Read through TaskAssignments"
```

---

### Task 5: `ai/translate.rs` module (TDD on JSON parser only — network not mocked)

**Files:**
- Create: `src-tauri/src/ai/translate.rs`
- Modify: `src-tauri/src/ai/mod.rs` (declare + re-export)

**Step 1: Create the module.**

```rust
//! Title + abstract translation workflow.

use anyhow::Result;
use serde::{Deserialize, Serialize};

use super::client::{chat_complete, ChatMessage};
use super::profile::LlmProfile;
use super::summarize::parse_json_lenient as parse_json;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TranslationResult {
    pub title: String,
    pub abstract_text: String,
    pub target_lang: String,
    pub model: String,
    pub prompt_tokens: u32,
    pub completion_tokens: u32,
}

const SYSTEM_PROMPT: &str = "You are a precise scientific translator. \
Translate the supplied paper title and abstract to the requested language. \
Preserve technical terms (model names, algorithm names, mathematical symbols, \
units, dataset names) verbatim. Do not paraphrase or summarize. \
Return ONLY JSON in this exact shape: {\"title\": \"...\", \"abstract\": \"...\"}.";

pub async fn translate_paper_text(
    client: &reqwest::Client,
    profile: &LlmProfile,
    title: &str,
    abstract_text: Option<&str>,
    target_lang: &str,
) -> Result<TranslationResult> {
    let user_content = format!(
        "Target language: {target_lang}\n\nTitle:\n{title}\n\nAbstract:\n{}",
        abstract_text.unwrap_or("(no abstract supplied)"),
    );
    let resp = chat_complete(
        client, profile,
        &[
            ChatMessage { role: "system".into(), content: SYSTEM_PROMPT.into() },
            ChatMessage { role: "user".into(), content: user_content },
        ],
    ).await?;
    let v = parse_json(&resp.content);
    let title_tx = v.get("title").and_then(|x| x.as_str()).unwrap_or("").trim().to_string();
    let abstract_tx = v.get("abstract").and_then(|x| x.as_str()).unwrap_or("").trim().to_string();
    Ok(TranslationResult {
        title: title_tx,
        abstract_text: abstract_tx,
        target_lang: target_lang.to_string(),
        model: resp.model,
        prompt_tokens: resp.prompt_tokens,
        completion_tokens: resp.completion_tokens,
    })
}
```

**Step 2: Expose `parse_json` from `summarize.rs`.**

In `summarize.rs`, rename `fn parse_json` to `pub(crate) fn parse_json_lenient` (or add `pub(crate) use parse_json as parse_json_lenient;`). Easiest: change the existing function signature line from `fn parse_json` to `pub(crate) fn parse_json_lenient` and update the two internal call sites.

**Step 3: Update `ai/mod.rs`.**

```rust
mod profile;
mod client;
mod summarize;
mod translate;

pub use profile::{LlmProfile, LlmConfig, TaskAssignments, TaskKind,
                  load_config, save_config, active_profile, active_profile_for_task};
pub use client::{ChatMessage, ChatResponse, chat_complete};
pub use summarize::{summarize_paper_text, quick_read_paper_text, TldrResult, QuickReadResult};
pub use translate::{translate_paper_text, TranslationResult};
```

**Step 4: Compile.**

```bash
cargo check --message-format=short
```

Expected: 0 errors.

**Step 5: Commit.**

```bash
git add -A
git -c user.email=litera@local -c user.name=litera commit -m "feat(ai): add translate_paper_text module"
```

---

### Task 6: `PaperRepo::update_translation` (TDD)

**Files:**
- Modify: `src-tauri/src/storage/papers.rs`

**Step 1: Write failing test first.** Append to the `tests` module:

```rust
    #[tokio::test]
    async fn update_translation_roundtrip() {
        let (pool, dir) = temp_pool().await;
        let repo = PaperRepo::new(&pool);
        repo.insert(&sample("T")).await.unwrap();
        repo.update_translation("T", "标题", "摘要内容", "Chinese").await.unwrap();
        let p = repo.get("T").await.unwrap().unwrap();
        assert_eq!(p.title_translated.as_deref(), Some("标题"));
        assert_eq!(p.abstract_translated.as_deref(), Some("摘要内容"));
        assert_eq!(p.translate_target_lang.as_deref(), Some("Chinese"));
        assert!(p.translated_at.is_some());
        std::fs::remove_dir_all(&dir).ok();
    }
```

**Step 2: Run, expect FAIL (method missing).**

```bash
cargo test --lib storage::papers::tests::update_translation_roundtrip
```

**Step 3: Implement.** Add to `impl PaperRepo<'_>` (after `update_quick_read`):

```rust
    pub async fn update_translation(
        &self, id: &str, title_tx: &str, abstract_tx: &str, lang: &str,
    ) -> Result<()> {
        let now = Utc::now().timestamp();
        sqlx::query(
            "UPDATE papers SET title_translated = ?1, abstract_translated = ?2,
                                translate_target_lang = ?3, translated_at = ?4,
                                updated_at = ?4 WHERE id = ?5",
        )
        .bind(title_tx).bind(abstract_tx).bind(lang).bind(now).bind(id)
        .execute(self.pool).await?;
        Ok(())
    }
```

**Step 4: Run, expect PASS.**

```bash
cargo test --lib storage::papers::tests
```

Expected: all storage tests green.

**Step 5: Commit.**

```bash
git add -A
git -c user.email=litera@local -c user.name=litera commit -m "feat(storage): add update_translation"
```

---

### Task 7: `paper_translate` IPC command

**Files:**
- Modify: `src-tauri/src/commands/mod.rs`
- Modify: `src-tauri/src/lib.rs` (register handler)

**Step 1: Add command at end of `commands/mod.rs`.**

```rust
#[tauri::command]
pub async fn paper_translate(
    state: State<'_, Arc<AppState>>,
    id: String,
    target_lang: Option<String>,
) -> Result<crate::ai::TranslationResult, String> {
    let cfg = load_config(&state.paths).map_err(|e| e.to_string())?;
    let prof = active_profile_for_task(&cfg, TaskKind::Translate).map_err(|e| e.to_string())?.clone();
    let repo = PaperRepo::new(&state.pool);
    let paper = repo.get(&id).await.map_err(|e| e.to_string())?
        .ok_or_else(|| "paper not found".to_string())?;
    let lang = target_lang.unwrap_or_else(|| "Chinese".to_string());
    let result = crate::ai::translate_paper_text(
        &state.http, &prof, &paper.title, paper.abstract_text.as_deref(), &lang,
    )
    .await.map_err(|e| e.to_string())?;
    repo.update_translation(&id, &result.title, &result.abstract_text, &result.target_lang)
        .await.map_err(|e| e.to_string())?;
    Ok(result)
}
```

**Step 2: Register handler.** In `src-tauri/src/lib.rs`, inside the `invoke_handler!` macro, add `commands::paper_translate,` near the other paper_* commands.

**Step 3: Compile.**

```bash
cargo check --message-format=short
```

Expected: 0 errors.

**Step 4: Commit.**

```bash
git add -A
git -c user.email=litera@local -c user.name=litera commit -m "feat(commands): add paper_translate"
```

---

### Task 8: `AppState.cancel` + `BatchSummary` types

**Files:**
- Modify: `src-tauri/src/lib.rs` (AppState + bootstrap)
- Modify: `src-tauri/Cargo.toml` (add `tokio-util`)
- Modify: `src-tauri/src/commands/mod.rs` (add BatchSummary types)

**Step 1: Add `tokio-util` to deps.** In `[dependencies]` of `Cargo.toml`:

```toml
tokio-util = { version = "0.7", default-features = false }
```

**Step 2: Extend `AppState`.** In `lib.rs`:

```rust
use std::sync::Mutex;
use tokio_util::sync::CancellationToken;

pub struct AppState {
    pub pool: Pool,
    pub paths: LibraryPaths,
    pub http: reqwest::Client,
    pub batch_cancel: Mutex<Option<CancellationToken>>,
}
```

And in `bootstrap_state`:

```rust
Ok(Arc::new(AppState { pool, paths, http, batch_cancel: Mutex::new(None) }))
```

**Step 3: Add helper module-level functions in `commands/mod.rs`.**

```rust
use tokio_util::sync::CancellationToken;

#[derive(serde::Serialize)]
pub struct BatchError {
    pub paper_id: String,
    pub title: String,
    pub message: String,
}

#[derive(serde::Serialize)]
pub struct BatchSummary {
    pub kind: String,
    pub total: usize,
    pub ok: usize,
    pub failed: usize,
    pub cancelled: bool,
    pub errors: Vec<BatchError>,
}

fn install_cancel_token(state: &AppState) -> Result<CancellationToken, String> {
    let mut guard = state.batch_cancel.lock().map_err(|e| e.to_string())?;
    if let Some(existing) = guard.as_ref() {
        if !existing.is_cancelled() {
            return Err("a batch is already running; cancel it first".into());
        }
    }
    let tok = CancellationToken::new();
    *guard = Some(tok.clone());
    Ok(tok)
}

fn clear_cancel_token(state: &AppState) {
    if let Ok(mut g) = state.batch_cancel.lock() { *g = None; }
}
```

**Step 4: Compile.**

```bash
cargo check --message-format=short
```

Expected: pull deps (may take 1-2 min), 0 errors.

**Step 5: Commit.**

```bash
git add -A
git -c user.email=litera@local -c user.name=litera commit -m "feat(state): add batch_cancel + BatchSummary primitives"
```

---

### Task 9: Three synchronous batch commands (attach_tag, set_status, delete)

**Files:**
- Modify: `src-tauri/src/commands/mod.rs`
- Modify: `src-tauri/src/lib.rs` (register handlers)

**Step 1: Append commands.**

```rust
#[tauri::command]
pub async fn batch_attach_tag(
    state: State<'_, Arc<AppState>>,
    ids: Vec<String>, tag_id: i64,
) -> Result<usize, String> {
    let repo = TagRepo::new(&state.pool);
    let mut ok = 0;
    for id in ids {
        if repo.attach(&id, tag_id).await.is_ok() { ok += 1; }
    }
    Ok(ok)
}

#[tauri::command]
pub async fn batch_set_status(
    state: State<'_, Arc<AppState>>,
    ids: Vec<String>, status: String,
) -> Result<usize, String> {
    let s = match status.as_str() {
        "reading" => ReadStatus::Reading,
        "read" => ReadStatus::Read,
        "must" => ReadStatus::Must,
        _ => ReadStatus::Unread,
    };
    let repo = PaperRepo::new(&state.pool);
    let mut ok = 0;
    for id in ids {
        if repo.set_read_status(&id, s).await.is_ok() { ok += 1; }
    }
    Ok(ok)
}

#[tauri::command]
pub async fn batch_delete(
    state: State<'_, Arc<AppState>>,
    ids: Vec<String>,
) -> Result<usize, String> {
    let repo = PaperRepo::new(&state.pool);
    let mut ok = 0;
    for id in ids {
        if repo.delete(&id).await.is_ok() { ok += 1; }
    }
    Ok(ok)
}
```

**Step 2: Register the three new handlers in `lib.rs`.**

**Step 3: Compile.**

```bash
cargo check --message-format=short
```

**Step 4: Commit.**

```bash
git add -A
git -c user.email=litera@local -c user.name=litera commit -m "feat(commands): batch_attach_tag + batch_set_status + batch_delete"
```

---

### Task 10: `batch_tldr` (TDD via a shared helper that loops + emits)

**Files:**
- Modify: `src-tauri/src/commands/mod.rs`
- Modify: `src-tauri/src/lib.rs`

**Step 1: Add helper closure pattern.** Append to `commands/mod.rs`:

```rust
use tauri::{AppHandle, Emitter};

async fn run_ai_batch<F, Fut>(
    app: AppHandle,
    state: State<'_, Arc<AppState>>,
    kind: &'static str,
    ids: Vec<String>,
    mut op: F,
) -> Result<BatchSummary, String>
where
    F: FnMut(Paper) -> Fut,
    Fut: std::future::Future<Output = anyhow::Result<()>>,
{
    let token = install_cancel_token(&state)?;
    let total = ids.len();
    let mut ok = 0usize;
    let mut errors = Vec::<BatchError>::new();
    let repo = PaperRepo::new(&state.pool);

    for id in ids {
        if token.is_cancelled() { break; }
        let paper = match repo.get(&id).await.map_err(|e| e.to_string())? {
            Some(p) => p,
            None => {
                errors.push(BatchError { paper_id: id, title: "(missing)".into(),
                                           message: "paper not found".into() });
                continue;
            }
        };
        let _ = app.emit("batch-progress", serde_json::json!({
            "kind": kind, "done": ok + errors.len(), "total": total,
            "current_id": paper.id, "current_title": paper.title, "phase": "start",
        }));
        match op(paper.clone()).await {
            Ok(()) => {
                ok += 1;
                let _ = app.emit("batch-progress", serde_json::json!({
                    "kind": kind, "done": ok + errors.len(), "total": total,
                    "current_id": paper.id, "current_title": paper.title, "phase": "ok",
                }));
            }
            Err(e) => {
                let msg = e.to_string();
                errors.push(BatchError { paper_id: paper.id.clone(),
                                           title: paper.title.clone(), message: msg.clone() });
                let _ = app.emit("batch-progress", serde_json::json!({
                    "kind": kind, "done": ok + errors.len(), "total": total,
                    "current_id": paper.id, "current_title": paper.title,
                    "phase": "fail", "error": msg,
                }));
            }
        }
    }
    let cancelled = token.is_cancelled();
    clear_cancel_token(&state);
    let summary = BatchSummary {
        kind: kind.to_string(), total, ok, failed: errors.len(), cancelled, errors,
    };
    let _ = app.emit("batch-done", &summary);
    Ok(summary)
}
```

**Step 2: Implement `batch_tldr`.**

```rust
#[tauri::command]
pub async fn batch_tldr(
    app: AppHandle,
    state: State<'_, Arc<AppState>>,
    ids: Vec<String>,
) -> Result<BatchSummary, String> {
    let cfg = load_config(&state.paths).map_err(|e| e.to_string())?;
    let prof = active_profile_for_task(&cfg, TaskKind::Tldr).map_err(|e| e.to_string())?.clone();
    let http = state.http.clone();
    let pool = state.pool.clone();
    run_ai_batch(app, state, "tldr", ids, move |paper| {
        let http = http.clone(); let prof = prof.clone(); let pool = pool.clone();
        async move {
            let r = summarize_paper_text(
                &http, &prof, &paper.title, &paper.authors, paper.venue.as_deref(),
                paper.year, paper.abstract_text.as_deref(), None,
            ).await?;
            PaperRepo::new(&pool)
                .update_tldr(&paper.id, &r.tldr, &r.key_findings).await?;
            Ok(())
        }
    }).await
}
```

**Step 3: Register in `lib.rs`.** Add `commands::batch_tldr,`.

**Step 4: Compile.**

```bash
cargo check --message-format=short
```

Expected: 0 errors.

**Step 5: Commit.**

```bash
git add -A
git -c user.email=litera@local -c user.name=litera commit -m "feat(commands): batch_tldr with progress events"
```

---

### Task 11: `batch_quick_read` + `batch_translate`

**Files:**
- Modify: `src-tauri/src/commands/mod.rs`
- Modify: `src-tauri/src/lib.rs`

**Step 1: Add `batch_quick_read`.** (parallel pattern to `batch_tldr`)

```rust
#[tauri::command]
pub async fn batch_quick_read(
    app: AppHandle, state: State<'_, Arc<AppState>>, ids: Vec<String>,
) -> Result<BatchSummary, String> {
    let cfg = load_config(&state.paths).map_err(|e| e.to_string())?;
    let prof = active_profile_for_task(&cfg, TaskKind::QuickRead).map_err(|e| e.to_string())?.clone();
    let http = state.http.clone();
    let pool = state.pool.clone();
    run_ai_batch(app, state, "quick_read", ids, move |paper| {
        let http = http.clone(); let prof = prof.clone(); let pool = pool.clone();
        async move {
            let r = quick_read_paper_text(
                &http, &prof, &paper.title, &paper.authors, paper.venue.as_deref(),
                paper.year, paper.abstract_text.as_deref(), None,
            ).await?;
            PaperRepo::new(&pool).update_quick_read(
                &paper.id, &r.problem, &r.method, &r.comparison, &r.limitations,
            ).await?;
            Ok(())
        }
    }).await
}

#[tauri::command]
pub async fn batch_translate(
    app: AppHandle, state: State<'_, Arc<AppState>>,
    ids: Vec<String>, target_lang: Option<String>,
) -> Result<BatchSummary, String> {
    let cfg = load_config(&state.paths).map_err(|e| e.to_string())?;
    let prof = active_profile_for_task(&cfg, TaskKind::Translate).map_err(|e| e.to_string())?.clone();
    let lang = target_lang.unwrap_or_else(|| "Chinese".to_string());
    let http = state.http.clone();
    let pool = state.pool.clone();
    run_ai_batch(app, state, "translate", ids, move |paper| {
        let http = http.clone(); let prof = prof.clone();
        let pool = pool.clone(); let lang = lang.clone();
        async move {
            let r = crate::ai::translate_paper_text(
                &http, &prof, &paper.title, paper.abstract_text.as_deref(), &lang,
            ).await?;
            PaperRepo::new(&pool)
                .update_translation(&paper.id, &r.title, &r.abstract_text, &r.target_lang).await?;
            Ok(())
        }
    }).await
}
```

**Step 2: Register both in `lib.rs`.**

**Step 3: Compile + commit.**

```bash
cargo check --message-format=short
git add -A
git -c user.email=litera@local -c user.name=litera commit -m "feat(commands): batch_quick_read + batch_translate"
```

---

### Task 12: `batch_cancel`

**Files:**
- Modify: `src-tauri/src/commands/mod.rs`
- Modify: `src-tauri/src/lib.rs`

**Step 1: Append.**

```rust
#[tauri::command]
pub fn batch_cancel(state: State<'_, Arc<AppState>>) -> Result<bool, String> {
    let mut g = state.batch_cancel.lock().map_err(|e| e.to_string())?;
    if let Some(t) = g.as_ref() {
        t.cancel();
        return Ok(true);
    }
    *g = None;
    Ok(false)
}
```

**Step 2: Register in `lib.rs`. Compile + run all tests.**

```bash
cargo check --message-format=short
cargo test --lib
```

Expected: 32+ tests pass (29 prior + 3 new from Task 3 + 1 new from Task 6).

**Step 3: Commit.**

```bash
git add -A
git -c user.email=litera@local -c user.name=litera commit -m "feat(commands): batch_cancel"
```

---

### Task 13: Frontend api.ts wrappers + types

**Files:**
- Modify: `src/lib/api.ts`

**Step 1: Extend `Paper` interface.** Add fields:

```ts
  title_translated: string | null;
  abstract_translated: string | null;
  translate_target_lang: string | null;
  translated_at: number | null;
```

**Step 2: Add types.**

```ts
export interface TranslationResult {
  title: string;
  abstract_text: string;
  target_lang: string;
  model: string;
  prompt_tokens: number;
  completion_tokens: number;
}

export interface BatchError {
  paper_id: string;
  title: string;
  message: string;
}

export interface BatchSummary {
  kind: string;
  total: number;
  ok: number;
  failed: number;
  cancelled: boolean;
  errors: BatchError[];
}

export interface TaskAssignments {
  tldr: string | null;
  quick_read: string | null;
  translate: string | null;
  tag: string | null;
  link: string | null;
}
```

Extend `LlmConfig`:

```ts
export interface LlmConfig {
  profiles: LlmProfile[];
  active: string | null;
  task_assignments: TaskAssignments;
}
```

**Step 3: Add API methods to the `api` object.**

```ts
  paperTranslate: (id: string, targetLang?: string) =>
    invoke<TranslationResult>("paper_translate", { id, targetLang: targetLang ?? "Chinese" }),
  batchTldr: (ids: string[]) => invoke<BatchSummary>("batch_tldr", { ids }),
  batchQuickRead: (ids: string[]) => invoke<BatchSummary>("batch_quick_read", { ids }),
  batchTranslate: (ids: string[], targetLang?: string) =>
    invoke<BatchSummary>("batch_translate", { ids, targetLang: targetLang ?? "Chinese" }),
  batchAttachTag: (ids: string[], tagId: number) =>
    invoke<number>("batch_attach_tag", { ids, tagId }),
  batchSetStatus: (ids: string[], status: ReadStatus) =>
    invoke<number>("batch_set_status", { ids, status }),
  batchDelete: (ids: string[]) => invoke<number>("batch_delete", { ids }),
  batchCancel: () => invoke<boolean>("batch_cancel"),
```

**Step 4: Verify typecheck.**

```bash
cd /home/zonazcy/Projects/litera-desktop && pnpm typecheck
```

Expected: 0 errors.

**Step 5: Commit.**

```bash
git add -A
git -c user.email=litera@local -c user.name=litera commit -m "feat(api): typed wrappers for translate + batch + task routing"
```

---

### Task 14: SettingsPage — "Task routing" section

**Files:**
- Modify: `src/pages/SettingsPage.tsx`

**Step 1: Add the section above the LLM profiles list (or below, designer's call). Inside the main render block, after the profiles `<ul>`, insert:**

```tsx
<div className="mt-8">
  <h2 className="text-litera-text font-medium mb-2 flex items-center gap-2">
    <Compass className="h-4 w-4 text-litera-accent" /> Task routing
  </h2>
  <p className="text-xs text-litera-mute mb-3">
    Pick which profile each AI task uses. "Use active" falls back to the global active profile above.
  </p>
  <div className="litera-panel p-4 grid grid-cols-[140px_1fr] gap-x-3 gap-y-2 text-sm">
    {(["tldr","quick_read","translate","tag","link"] as const).map((k) => (
      <Fragment key={k}>
        <label className="text-litera-mute self-center">{TASK_LABELS[k]}</label>
        <select
          value={draft.task_assignments?.[k] ?? ""}
          onChange={(e) => setDraft((d) => ({
            ...d,
            task_assignments: { ...(d.task_assignments ?? EMPTY_TA), [k]: e.target.value || null },
          }))}
          className="litera-input bg-litera-paper"
        >
          <option value="">Use active</option>
          {draft.profiles.map((p) => (
            <option key={p.name} value={p.name}>{p.name}</option>
          ))}
        </select>
      </Fragment>
    ))}
  </div>
</div>
```

**Step 2: Add the supporting constants near top of file:**

```tsx
import { Fragment } from "react";
import { Compass } from "lucide-react";

const TASK_LABELS = {
  tldr: "TL;DR",
  quick_read: "Quick Read",
  translate: "Translate",
  tag: "Tag (Batch 2)",
  link: "Link (Batch 2)",
} as const;

const EMPTY_TA = { tldr: null, quick_read: null, translate: null, tag: null, link: null };
```

**Step 3: Ensure `draft.task_assignments` is initialized.** In the existing `useEffect((d) => { if (data) setDraft(data); }, [data])` ensure default. Update the `useState` initializer:

```tsx
const [draft, setDraft] = useState<LlmConfig>({ profiles: [], active: null, task_assignments: EMPTY_TA });
```

**Step 4: Typecheck.**

```bash
pnpm typecheck
```

Expected: 0 errors.

**Step 5: Commit.**

```bash
git add -A
git -c user.email=litera@local -c user.name=litera commit -m "feat(settings): task routing UI"
```

---

### Task 15: Library row Translate button + show translated content

**Files:**
- Modify: `src/pages/LibraryPage.tsx`

**Step 1: Add Translate button to the action stack.** Inside `PaperRow`, next to the existing `TL;DR` and `Quick read` buttons, add a globe button:

```tsx
const translate = useMutation({
  mutationFn: () => api.paperTranslate(p.id, "Chinese"),
  onSuccess: () => qc.invalidateQueries({ queryKey: ["papers"] }),
});
// ...
<button onClick={() => translate.mutate()} disabled={translate.isPending}
  className="litera-btn text-xs disabled:opacity-50 whitespace-nowrap"
  title="Translate title and abstract to Chinese">
  {translate.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Globe className="h-3.5 w-3.5" />}
  Translate
</button>
```

(import `Globe` from lucide-react)

**Step 2: Render translated content under the title when present.** In the row body, after the metadata line:

```tsx
{p.title_translated && (
  <div className="text-sm text-litera-accent2 mt-1 leading-snug">{p.title_translated}</div>
)}
{p.abstract_translated && (
  <details className="text-xs text-litera-text/80 mt-1.5">
    <summary className="cursor-pointer text-litera-mute hover:text-litera-text">译文摘要</summary>
    <p className="mt-1 leading-relaxed">{p.abstract_translated}</p>
  </details>
)}
```

**Step 3: Typecheck + build.**

```bash
pnpm typecheck && pnpm build
```

Expected: 0 errors.

**Step 4: Commit.**

```bash
git add -A
git -c user.email=litera@local -c user.name=litera commit -m "feat(library): row Translate button + translated display"
```

---

### Task 16: Library multi-select + SelectionBar

**Files:**
- Modify: `src/pages/LibraryPage.tsx`
- Create: `src/components/SelectionBar.tsx`

**Step 1: Create `SelectionBar`.**

```tsx
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Sparkles, BookOpen, Globe, Tag as TagIcon, Trash2, X, Loader2 } from "lucide-react";
import { api, type ReadStatus } from "@/lib/api";

interface Props {
  selected: Set<string>;
  total: number;
  onClear: () => void;
  onSelectAll: () => void;
}

export function SelectionBar({ selected, total, onClear, onSelectAll }: Props) {
  const qc = useQueryClient();
  const ids = [...selected];
  const tldr = useMutation({ mutationFn: () => api.batchTldr(ids),
    onSettled: () => qc.invalidateQueries({ queryKey: ["papers"] }) });
  const quickR = useMutation({ mutationFn: () => api.batchQuickRead(ids),
    onSettled: () => qc.invalidateQueries({ queryKey: ["papers"] }) });
  const transl = useMutation({ mutationFn: () => api.batchTranslate(ids, "Chinese"),
    onSettled: () => qc.invalidateQueries({ queryKey: ["papers"] }) });
  const del = useMutation({ mutationFn: () => api.batchDelete(ids),
    onSuccess: () => { onClear(); qc.invalidateQueries({ queryKey: ["papers"] }); } });

  return (
    <div className="sticky top-0 z-20 bg-litera-paper border-b border-litera-line px-6 py-2.5 flex items-center gap-3">
      <span className="text-sm text-litera-text">{selected.size} selected</span>
      <button className="text-xs text-litera-mute hover:text-litera-text" onClick={onSelectAll}>Select all {total}</button>
      <button className="text-xs text-litera-mute hover:text-litera-text" onClick={onClear}>Clear</button>
      <div className="flex-1" />
      <BatchBtn icon={<Sparkles className="h-3.5 w-3.5" />} label="TL;DR" pending={tldr.isPending} onClick={() => tldr.mutate()} />
      <BatchBtn icon={<BookOpen className="h-3.5 w-3.5" />} label="Quick Read" pending={quickR.isPending} onClick={() => quickR.mutate()} />
      <BatchBtn icon={<Globe className="h-3.5 w-3.5" />} label="Translate" pending={transl.isPending} onClick={() => transl.mutate()} />
      <BatchBtn icon={<Trash2 className="h-3.5 w-3.5" />} label="Delete" pending={del.isPending}
        onClick={() => { if (confirm(`Delete ${ids.length} papers?`)) del.mutate(); }} danger />
      <button onClick={onClear} className="text-litera-mute hover:text-litera-text p-1">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

function BatchBtn({ icon, label, pending, onClick, danger }: {
  icon: React.ReactNode; label: string; pending: boolean; onClick: () => void; danger?: boolean;
}) {
  return (
    <button onClick={onClick} disabled={pending}
      className={"litera-btn text-xs disabled:opacity-50 " + (danger ? "text-red-400/80 hover:text-red-400" : "")}>
      {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : icon}
      {label}
    </button>
  );
}
```

**Step 2: Wire into `LibraryPage`.** Add at top:

```tsx
const [selected, setSelected] = useState<Set<string>>(new Set());
```

Between header and list:

```tsx
{selected.size > 0 && (
  <SelectionBar
    selected={selected}
    total={papers?.length ?? 0}
    onClear={() => setSelected(new Set())}
    onSelectAll={() => setSelected(new Set((papers ?? []).map((p) => p.id)))}
  />
)}
```

Pass `selected` + `setSelected` into `PaperRow`. In the row, insert a checkbox before the status toggle:

```tsx
<input
  type="checkbox"
  checked={selected.has(p.id)}
  onChange={() => {
    const n = new Set(selected);
    n.has(p.id) ? n.delete(p.id) : n.add(p.id);
    setSelected(n);
  }}
  className="mt-1 shrink-0 accent-litera-accent"
/>
```

**Step 3: Typecheck + build.**

```bash
pnpm typecheck && pnpm build
```

**Step 4: Commit.**

```bash
git add -A
git -c user.email=litera@local -c user.name=litera commit -m "feat(library): multi-select + SelectionBar with batch ops"
```

---

### Task 17: BatchFooter — sticky bottom progress bar

**Files:**
- Create: `src/components/BatchFooter.tsx`
- Modify: `src/components/Shell.tsx` (mount it)

**Step 1: Create `BatchFooter`.**

```tsx
import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { X, AlertTriangle, ChevronDown } from "lucide-react";
import { api, type BatchSummary } from "@/lib/api";

type Phase = "start" | "ok" | "fail";
interface Progress {
  kind: string; done: number; total: number;
  current_id: string; current_title: string;
  phase: Phase; error?: string;
}

export function BatchFooter() {
  const [running, setRunning] = useState(false);
  const [p, setP] = useState<Progress | null>(null);
  const [done, setDone] = useState<BatchSummary | null>(null);
  const [showErrors, setShowErrors] = useState(false);

  useEffect(() => {
    let u1: (() => void) | undefined;
    let u2: (() => void) | undefined;
    (async () => {
      u1 = await listen<Progress>("batch-progress", (e) => {
        setRunning(true); setP(e.payload); setDone(null);
      });
      u2 = await listen<BatchSummary>("batch-done", (e) => {
        setDone(e.payload);
        setTimeout(() => {
          setRunning(false); setP(null); setShowErrors(false);
        }, e.payload.errors.length ? 6000 : 2500);
      });
    })();
    return () => { u1?.(); u2?.(); };
  }, []);

  if (!running && !done) return null;
  const total = done?.total ?? p?.total ?? 0;
  const ok = done?.ok ?? p?.done ?? 0;
  const failed = done?.failed ?? 0;
  const pct = total ? Math.round((ok / total) * 100) : 0;
  const finished = !!done;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-litera-line bg-litera-paper/95 backdrop-blur">
      {showErrors && done && done.errors.length > 0 && (
        <ul className="max-h-48 overflow-auto px-6 py-2 text-xs text-red-400/90 space-y-1 border-b border-litera-line">
          {done.errors.map((e, i) => (
            <li key={i}><span className="text-litera-mute">{e.title}</span>: {e.message}</li>
          ))}
        </ul>
      )}
      <div className="h-9 px-6 flex items-center gap-3 text-xs">
        <span className="text-litera-text/80 capitalize">{(done?.kind ?? p?.kind ?? "").replace("_", " ")}</span>
        <div className="flex-1 max-w-md h-1.5 bg-litera-line rounded overflow-hidden">
          <div className="h-full bg-litera-accent transition-all" style={{ width: `${pct}%` }} />
        </div>
        <span className="font-mono tabular-nums text-litera-mute">
          {ok}/{total}{failed ? ` · ${failed} failed` : ""}
        </span>
        {!finished && p?.current_title && (
          <span className="truncate max-w-xs text-litera-mute">{p.current_title}</span>
        )}
        {done && done.errors.length > 0 && (
          <button onClick={() => setShowErrors(!showErrors)} className="text-amber-400/90 hover:text-amber-400 flex items-center gap-1">
            <AlertTriangle className="h-3.5 w-3.5" /> {done.errors.length}
            <ChevronDown className="h-3 w-3" />
          </button>
        )}
        {!finished && (
          <button onClick={() => api.batchCancel()} className="text-litera-mute hover:text-red-400">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}
```

**Step 2: Mount in `Shell.tsx`.** At the bottom of the return JSX (after `<main>`), add:

```tsx
<BatchFooter />
```

Add the import.

**Step 3: Typecheck + build.**

```bash
pnpm typecheck && pnpm build
```

Expected: 0 errors. Build size ~+5 KB.

**Step 4: Commit.**

```bash
git add -A
git -c user.email=litera@local -c user.name=litera commit -m "feat(shell): persistent BatchFooter listening to Tauri events"
```

---

### Task 18: Final verification + MILESTONES + state save

**Files:**
- Modify: `MILESTONES.md`
- Run-only: full test sweep

**Step 1: Run full backend test suite.**

```bash
cd src-tauri && cargo test --lib --message-format=short 2>&1 | tail -30
```

Expected: 33+ passing (29 prior + 3 task_assignment + 1 update_translation), 0 failed.

**Step 2: Run frontend typecheck + build.**

```bash
cd .. && pnpm typecheck && pnpm build 2>&1 | tail -10
```

Expected: 0 errors, build succeeds.

**Step 3: Update MILESTONES.md.** Append a new section under verification log:

```md
### M7.2 — Translate + Per-task routing + Batch operations ✅
- ✅ Translate workflow: `paper_translate` + `batch_translate`, persisted to 4 new columns via 0005
- ✅ Per-task model routing: `TaskAssignments` with serde default, Settings UI dropdown per task
- ✅ Batch processing: TL;DR / Quick Read / Translate / Add tag / Set status / Delete on N selected
- ✅ BatchFooter sticky-bottom: progress bar + current title + cancel + error drawer
- ✅ Cancellation via tokio_util CancellationToken stored in AppState

`cargo test --lib` 33+/33+ passing · `pnpm typecheck` clean · `pnpm build` clean
```

**Step 4: Commit.**

```bash
git add -A
git -c user.email=litera@local -c user.name=litera commit -m "docs: MILESTONES update for batch1"
```

**Step 5: Sanity-check git log.**

```bash
git log --oneline | head -25
```

Expected: ~18 commits since baseline.

---

## Acceptance Checklist

- [ ] Migration 0005 applied, 4 translate columns present
- [ ] `TaskAssignments` round-trips through `litera.config.json`
- [ ] `paper_tldr` and `paper_quick_read` honour per-task routing
- [ ] `paper_translate` produces and persists Chinese title + abstract
- [ ] Library row Translate button works on a single paper
- [ ] Library multi-select + SelectionBar performs batch TL;DR / Quick Read / Translate / Delete
- [ ] BatchFooter shows progress, cancels mid-batch, displays errors
- [ ] Settings → Task routing dropdowns persist and route correctly
- [ ] `cargo test --lib` ≥ 33 passing
- [ ] `pnpm typecheck` + `pnpm build` clean
- [ ] Old config without `task_assignments` loads (serde default verified by existing roundtrip test)

---

*End of plan.*
