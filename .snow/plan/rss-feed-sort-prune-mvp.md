# RSS 订阅排序与轻量清理 MVP

## Context

用户反馈：RSS 刷新后，如果新文章与已有文章的 `published_at` 相同，后刷新出来的新文章可能排在同日期旧文献后面；同时担心订阅增多后 `feed_items` 是否会无限增长。

目标是做最小 MVP，不做大重构：只改后端 RSS item 查询排序和入库后的轻量清理，尽量几行级别、低风险、可回滚。

## Analysis

- **Affected files**:
  - `src-tauri/src/storage/feeds/items.rs`: RSS item 插入、列表排序、元数据 backfill 排序都在这里；当前列表只按 `COALESCE(published_at, fetched_at) DESC` 排序，没有 `seen` 置顶、`fetched_at` 或 `id` tie-breaker，也没有自动清理。
  - `src-tauri/src/storage/feeds/tests.rs`: 已有 RSS repo roundtrip 测试；适合加最小排序/清理回归测试。
- **New files**: 无。
- **Dependencies**: 无新增依赖；不改 schema，不新增迁移。
- **Complexity**: simple。
- **Risk areas**:
  - 清理逻辑不能误删未读、已入库绑定项或论文库数据。
  - 排序改动会影响用户看到的 RSS 列表顺序；应符合“未读置顶 + 同发布时间后刷新优先”。
  - 不应改 frontend API/IPC 合同，避免扩大 PR。

## Current root cause

`item_list_sql()` 当前排序：

```sql
ORDER BY COALESCE(published_at, fetched_at) DESC LIMIT ? OFFSET ?
```

当多个条目 `published_at` 相同时，SQLite 对同 key 的相对顺序不稳定/不符合“新刷新出来优先”。此外，代码中没有看到 feed item pruning/cleanup，`feed_items` 会随订阅和刷新增长，除非用户删订阅。

## Phases

### Phase 1: 最小排序修复

- **Goal**: 让 RSS 列表显示“未读置顶；同发布时间时后获取/后插入的排前面”。
- **Files**:
  - `src-tauri/src/storage/feeds/items.rs`
- **Steps**:
  - [ ] 修改 `item_list_sql()` 的 `ORDER BY` 为：`seen ASC, COALESCE(published_at, fetched_at) DESC, fetched_at DESC, id DESC`。
  - [ ] 给 `list_unchecked_items()` 的排序加 `fetched_at DESC, id DESC` tie-breaker，保持后台 metadata backfill 优先处理较新的条目。
- **Done when**:
  - RSS 列表默认未读在已读前面。
  - 同 `published_at` 的条目按后刷新/后插入优先。
  - 不改 IPC 参数、返回类型或前端代码。

### Phase 2: 轻量清理 MVP

- **Goal**: 避免每个订阅源无限堆积已读、未入库的旧 RSS 缓存。
- **Files**:
  - `src-tauri/src/storage/feeds/items.rs`
- **Steps**:
  - [ ] 增加一个小常量，例如 `FEED_ITEMS_KEEP_PER_FEED: i64 = 1000`。
  - [ ] 在 `upsert_items()` 插入后调用 `prune_old_seen_items(feed_id)`。
  - [ ] 清理 SQL 只删除：同 feed 下、`seen = 1`、`imported_paper_id IS NULL`、且不在最新 N 条保留集内的 item。
- **Done when**:
  - 未读条目不会被清理。
  - 已绑定入库论文的 feed item 不会被清理。
  - 只清理 RSS 缓存行，不触碰 `papers`、notes、PDF、候选箱等用户数据。

### Phase 3: 回归测试与验证

- **Goal**: 用最少测试覆盖排序和清理行为。
- **Files**:
  - `src-tauri/src/storage/feeds/tests.rs`
- **Steps**:
  - [ ] 增加排序测试：同 `published_at` 下更新 `fetched_at` 后，较新的条目排前面；未读条目排在已读前面。
  - [ ] 增加或扩展清理测试：旧的已读未入库条目会被删，未读/已入库条目保留。
  - [ ] 运行 `cargo test feeds` 或等价的 targeted Rust test。
- **Done when**:
  - RSS storage tests 通过。
  - 没有 TypeScript/IPC 变更需要同步。

## Risks & Mitigations

| Risk                    | Impact                         | Mitigation                                                  |
| ----------------------- | ------------------------------ | ----------------------------------------------------------- |
| 清理误删未读 RSS item   | 用户错过新文献                 | SQL 限制 `seen = 1`，测试覆盖未读保留                       |
| 清理误删已入库关联 item | RSS 与 paper 的导入状态丢失    | SQL 限制 `imported_paper_id IS NULL`，测试覆盖已入库保留    |
| 排序变化不符合用户习惯  | 已读新文章可能被未读旧文章压后 | 用户明确接受“所有未读置顶”的方案；这是 MVP 行为             |
| PR 被认为范围过大       | 返工                           | 不改 UI、不改 IPC、不加依赖、不加迁移，只改 storage + tests |

## Rollback Strategy

- Revert `src-tauri/src/storage/feeds/items.rs` 中的 `ORDER BY`、清理常量/函数/调用。
- Revert `src-tauri/src/storage/feeds/tests.rs` 新增测试。
- 不涉及数据库迁移或数据结构变更，回滚不会需要 schema 修复。

## Acceptance Criteria

- [x] RSS 列表未读条目置顶。
- [x] 同一 `published_at` 时，后刷新/后写入的条目优先显示。
- [x] RSS item 缓存有轻量清理：每个 feed 保留最新 N 条，同时保留所有未读和已入库关联项。
- [x] 无前端 API/IPC 合同变化。
- [x] targeted Rust tests 通过，或说明无法运行的原因。

## Completion Summary

**Status**: Completed
**Phases**: 3 / 3

### Results

- `src-tauri/src/storage/feeds/items.rs` 最小修改 RSS item 排序：`seen ASC, COALESCE(published_at, fetched_at) DESC, fetched_at DESC, id DESC`。
- `list_unchecked_items()` 增加 `fetched_at DESC, id DESC` tie-breaker。
- `upsert_items()` 后增加轻量 pruning：每个 feed 保留最新 1000 条，同时永远保留未读 item 和已绑定 `imported_paper_id` 的 item。
- `src-tauri/src/storage/feeds/tests.rs` 新增排序与清理回归测试。

### Deviations

- 未新增迁移、未改前端、未改 IPC，符合 MVP 范围。

### Verification

- [x] `cargo fmt -- src/storage/feeds/items.rs src/storage/feeds/tests.rs`
- [x] `cargo test storage::feeds` — 4/4 passed；存在既有 warning：`chat_complete` dead_code。

### Follow-up

- 如订阅量继续增长，可后续把 keep 数量做成设置项；当前 MVP 固定每 feed 保留 1000 条最新 RSS 缓存。
