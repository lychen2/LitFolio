# LitFolio v0.3.x 代码审查与重构计划

> 2026-05-28 由代码审查 5 专项 agent 并发扫描生成，覆盖前端(78 文件 14.8k LOC) + 后端(72 文件 17.4k LOC)。

---

## 已完成 (Batch A — 快速胜利包)

| # | 修复 | 文件 | 严重度 |
|---|------|------|--------|
| 1 | PDF 路径 canonicalize 防越界 — `paper_open_pdf` / `paper_read_pdf_bytes` / `paper_save_with_pdf` / `paper_attach_pdf` 均接入 `ensure_inside_root` | `storage/paths.rs` + `commands/mod.rs` | 安全 HIGH |
| 2 | `escape_fts` 不再删除 `-`/`.`/`:`，BERT-base / R3.0 / IEEE 802.11 保真 | `storage/papers.rs` | 后端 MED |
| 3 | CommandPalette snippet 高亮改 React 节点渲染，消除 `dangerouslySetInnerHTML` | `components/CommandPalette.tsx` | 前端 MED |
| 4 | LibraryPage `invalidateQueries` 加 `refetchType: "active"`，翻译 1 篇不再重 fetch 500 条 | `pages/LibraryPage.tsx` | 前端 MED |
| 5 | CrossRef User-Agent 改为项目地址，不再是 `litfolio@example.com` | `ingest/doi.rs` | 安全 LOW |

已验证：TypeScript typecheck pass，cargo check pass，10 个相关单测全绿。

---

## 未完成 — 按优先级排列

### P0 安全加固 (建议 1.5 人日)

| # | 问题 | 文件 | CWE |
|---|------|------|-----|
| S1 | **LLM API key 明文 JSON 存储** — `litera.config.json` 可被恶意进程 / WebDAV 同步读取 | `ai/profile.rs:149-156` | CWE-256/312 |
| S2 | **WebDAV 密码明文 + http:// Basic auth 可嗅探** | `library_sync/webdav.rs:141-146` | CWE-256/319 |
| S3 | **`download_pdf` 无 response size cap / content-type 校验** — 4 GB 响应 OOM | `commands/mod.rs:845-868` | CWE-400 |
| S4 | **reqwest Client 无 redirect 策略 / 无 host 白名单** — 可 SSRF 到内网 169.254.169.254 | `lib.rs:88-92` | CWE-918 |
| S5 | **`import_pdf_files` 不校验 `source_pdf_path` 是否来自合法 dialog** — XSS 可读任意文件 | `commands/mod.rs:412-422` | CWE-22 |
| S6 | **Tauri capabilities 过宽** — `fs:default` + `shell:allow-open`，XSS 可枚举宿主文件 | `capabilities/default.json` | - |

**修复方案：**
- S1+S2：引入 `keyring` crate 存入 OS keychain，JSON 只留引用名
- S3：`resp.bytes()` 改流式 `resp.chunk()` + 200 MB hard cap
- S4：两个 reqwest Client — arXiv/CrossRef/S2 用固定 allowlist，RSS 用 redirect ≤3 + https-only
- S5：`paper_save_with_pdf` / `paper_attach_pdf` 加 dialog token TTL 白名单
- S6：`fs:default` → `fs:allow-read-file` + scope 限 library root，去掉 `shell:allow-open`

---

### P1 后端架构重构 (建议 2 人日)

| # | 问题 | 当前 LOC | 目标 |
|---|------|---------|------|
| A1 | **commands/mod.rs god-file** — 126/158 个 `#[tauri::command]` 挤一个文件 | 2492 | 拆为 ~15 文件，每文件 ≤250 |
| A2 | **commands/reader_terms.rs** — 7 套职责混一起 | 881 | 拆为 `candidates.rs` / `abbrev.rs` / `explain.rs` / `evidence.rs` |
| A3 | **3 套重复 FTS 检索** — `storage/search.rs` + `ai/library_qa.rs` + `ingest/topic_survey_retrieval.rs` | 各 ~165/~405/~363 | 抽 `shared/retrieval.rs` |
| A4 | **LLM JSON 容错散落 3+ 处** — `reader_terms.rs` / `topic_survey.rs` / `topic_survey_annotate.rs` | - | 抽 `ai/json_utils.rs` (~50 行) |
| A5 | **Prompt 模板硬编码在命令层** | `reader_terms.rs:596-599` | 移到 `ai/prompts/*.md` + `include_str!` |
| A6 | **`batch_cancel` 用 `std::sync::Mutex` 在 async 路径** | `lib.rs:27` | 改 `tokio::sync::Mutex` |

**拆分模式参考（已建立）：** `commands/llm.rs` 已成功抽出，invoker path 在 lib.rs 用 `commands::llm::llm_*`。

---

### P1 前端架构重构 (建议 1.5 人日)

| # | 问题 | 文件 | 目标 |
|---|------|------|------|
| F1 | **src/lib/api.ts 995 行** — 13+ 领域 IPC 混一个文件 | `lib/api.ts` | 拆为 `lib/api/{domain}.ts` + `lib/types/{domain}.ts` |
| F2 | **SettingsPage.tsx 797 行** — 5 个独立 tab 挤一个文件 | `pages/SettingsPage.tsx` | 拆为 `ExportPanel` / `DuplicatesPanel` / `CustomFieldsPanel` / `TopicAlertsPanel` / `AlertCard` |
| F3 | **PaperRow 227 行，5 mutation + 1 query** | `pages/LibraryPage.tsx:255-481` | 抽 `usePaperActions(p)` hook + `PaperActions` 组件 |
| F4 | **`src/features/` 全是空目录** — 架构声明不实 | `src/features/` | 删除空目录 或 填入真实逻辑 |
| F5 | **i18n 720 行扁平对象** — 无 key 校验、无缺失检测 | `i18n/{en,zh}.ts` | 按模块拆分 + CI missing-key diff 脚本 |
| F6 | **`t(... as any)` 出现 8 处** — TKey 类型不完整 | `pages/SettingsPage.tsx` | 把 `labelKey: string` 改成 `TKey` |
| F7 | **PaperDetailDrawer 大量硬编码中文** | `library/PaperDetailDrawer.tsx` | 补 `paper.detail.*` i18n key |
| F8 | **4 处重复 `errorMessage` / `extractIdentifier`** | `LibraryPage` / `SyncPanel` / `FeedsPage` / `ImportPage` | 统一到 `lib/error.ts` + `lib/identifier.ts` |
| F9 | **FeedsPage `refetchInterval: 30000` 不随页面切换停止** | `pages/FeedsPage.tsx` | 加 `refetchIntervalInBackground: false` |

---

### P2 性能优化 (建议 1.5 人日)

| # | 问题 | 文件 | 触发条件 |
|---|------|------|---------|
| P1 | **paper_links::graph_data N+1** — 每 paper 一次 SELECT，每 concept 一次 SELECT | `storage/paper_links.rs:270-389` | 打开图谱视图 |
| P2 | **dedup::scan_all_duplicates O(N²)** — 全表内存 Levenshtein 对比 | `storage/dedup.rs:104-148` | 1000+ papers 时 UI 卡死 |
| P3 | **PaperRow 每行 `useQuery(["paper-tags"])`** — N 个并发 IPC | `LibraryPage.tsx:293-296` | 初次加载 library |
| P4 | **Folder import 串行执行** — 每篇 3-5s，100 PDF 要 ~6 分钟 | `commands/mod.rs:571-664` | 导入 PDF 目录 |
| P5 | **`papersInFolder` 不支持 query** — 先取 500 条到前端再 filter | `LibraryPage.tsx:38-48` | folder 内搜索 |
| P6 | **双重 timeout** — reqwest 120s + `tokio::time::timeout` 120s 不可控 | `ai/client.rs:14,126` | LLM 长 prompt |

**修复方案：**
- P1：`WHERE id IN (...)` + `GROUP BY normalized_term HAVING COUNT >= 2`
- P2：先按 `length(title)` 分桶 + DOI/arxiv 直接 SQL GROUP BY
- P3：后端补 `papers_batch_tags(paper_ids)` 命令，前端用 Map 分发
- P4：`stream::iter(paths).map(…).buffer_unordered(4)` 并发导入
- P5：后端补 `papersInFolder(folderId, query, limit)`
- P6：reqwest Client 只设 connect timeout，response 用 per-task `tokio::timeout`

---

### P3 代码卫生 (建议 0.5 人日)

| # | 问题 | 文件 |
|---|------|------|
| H1 | `ai/mod.rs` 顶层 `#![allow(dead_code, unused_imports)]` 遮蔽真实死代码 | `ai/mod.rs:3` |
| H2 | `storage/papers.rs:131-134` 注释重复两遍 | `storage/papers.rs` |
| H3 | `FeedsPage.tsx:165` `const t = url.trim()` 覆盖了 `useT()` 的 `t` | `FeedsPage.tsx` |
| H4 | `ImportPage.tsx:40` `useState(source.prefill ? "arxiv_doi" : "arxiv_doi")` 两支同值 | `ImportPage.tsx` |
| H5 | `lib.rs:292` 启动 `.expect()` 改 `tracing::error!` + `std::process::exit(1)` | `lib.rs:292` |

---

## 时间估算

| 批次 | 内容 | 人日 |
|------|------|------|
| Batch A | 快速胜利包 | **已完成** |
| Batch B1 | 安全加固 P0 | 1.5 |
| Batch B2 | 后端架构拆分 P1 | 2.0 |
| Batch B3 | 前端架构拆分 P1 | 1.5 |
| Batch C1 | 性能优化 P2 | 1.5 |
| Batch C2 | 代码卫生 P3 | 0.5 |
| **总计** | | **~7.0** |

建议按 B1 → B2 → B3 → C1 → C2 顺序推进，每个 Batch 开一个独立 PR。
