# Litera 12 个月产品与工程 TODO

本文档是 1 年规划，不是本周冲刺清单。每完成一个小项，立刻把 `[ ]` 改成 `[x]`，并在对应“验证记录”里写下日期、命令、结果、剩余问题。不要一次性勾掉整个季度。

当前日期: 2026-06-19

## 0. 规划边界

产品目标: 把 Litera 做成一个本地优先的论文工作台，覆盖导入、阅读、笔记、问答、综述、图谱、同步和发布。用户可以把论文放进本地库，在离线状态下读和管理，在配置模型后完成翻译、问答和综述。

技术底座:

- 前端: React、TypeScript、Vite、React Query、Tailwind 风格类、lucide-react 图标。
- 桌面壳: Tauri 2。
- 后端: Rust、sqlx、SQLite、reqwest。
- AI 入口: `src-tauri/src/ai/`。
- Tauri 命令: `src-tauri/src/commands/`。
- 存储层: `src-tauri/src/storage/`。
- 前端页面: `src/pages/`。
- 前端 API: `src/lib/api*.ts`。
- 测试入口: `cargo test`、`cargo clippy`、`pnpm test`、`pnpm typecheck`、`pnpm lint`。

工作规则:

- 先读代码，再改代码。
- 每个里程碑必须能被命令或人工检查验证。
- 不写假成功路径，不吞错误，不为了过测试加无意义 fallback。
- 不碰 release 版本号，除非任务明确是发布。
- 不提交 `todo.md`、`HANDOFF.md`、发布说明草稿和临时计划，除非用户明确要求。
- 长任务拆到 1 到 3 天能完成的小任务；每个小任务都写验证记录。

## 1. 用户分层

### 1.1 本科生和研究生

主要任务:

- 导入课程或课题论文。
- 快速读懂摘要、方法、实验和结论。
- 记录阅读卡片。
- 按文件夹、标签、阅读队列组织文献。

一年内要达到:

- 新用户 30 分钟内完成导入、阅读、笔记、导出引用四步。
- 没有配置模型时，核心文献管理功能仍可用。

### 1.2 做课题的研究人员

主要任务:

- 按主题检索论文。
- 问答自己的文献库。
- 生成 topic survey。
- 对比多篇论文的贡献、实验和局限。

一年内要达到:

- 用户能从一个研究问题进入搜索、筛选、短名单、阅读、综述草稿。
- AI 结果能追溯到论文、段落、笔记或高亮。

### 1.3 长期维护者

主要任务:

- 保持数据库迁移可升级。
- 保持 Tauri 命令、前端 API、mock 命令一致。
- 发布 signed updater artifact。
- 控制技术债，不让页面和命令无限膨胀。

一年内要达到:

- 每个新 Tauri 命令有前端 API、mock、parity 测试。
- 每个存储行为有单元测试或迁移测试。
- 发布流程只依赖 GitHub Actions，不做本地 release build。

## 2. 架构原则

### 2.1 模块边界

- `storage/` 只负责数据库和文件路径，不调用 AI。
- `ai/` 只负责 prompt、请求、解析和模型相关错误。
- `commands/` 负责把 AppState、storage、ai 组合成 Tauri command。
- `src/lib/api*.ts` 是前端唯一 Tauri API 封装层。
- 页面组件不直接写 `invoke("...")`。
- UI 组件不硬编码中英文文案，必须通过 i18n key。

### 2.2 数据原则

- 用户原始文件不被覆盖。
- 派生文件必须能重建，或者有明确版本和 hash。
- 缓存文件要带来源信息，例如源 Markdown hash、模型名、生成时间。
- 数据库迁移只向前走，不改已发布迁移。

### 2.3 AI 原则

- 打开页面不能自动产生模型费用。
- 用户点击生成类按钮才调用模型。
- AI 输出必须有来源、错误和重试路径。
- 模型超长、空输出、JSON 解析失败要暴露错误。

## 3. 12 个月路线图

### [x] M0: 当前基线冻结，2026-06

目标: 先把当前工作区的母语阅读改动整理成可审查状态。这个月不扩展新功能，先确认现有改动可理解、可测试、可回滚。

技术路径:

- 审查 `src-tauri/src/ai/translate.rs` 的 Markdown 分块和清理逻辑。
- 审查 `src-tauri/src/storage/paths.rs` 的译文缓存和元数据。
- 审查 `src-tauri/src/commands/reader_translate/mod.rs` 的 `paper_translated_markdown_get` 和 `paper_translate_markdown`。
- 审查 `src/pages/reader/TranslatedMarkdownPane.tsx` 的查询、生成、错误显示。
- 审查 `src/pages/ReaderPage.tsx` 的 PDF 和母语阅读切换。
- 删除或移动不应该入库的文档草稿，遵守 AGENTS.md 的 docs 规则。

验收:

- [x] `cargo clippy --lib --tests -- -D warnings` 通过。
- [x] `timeout 60 cargo test --lib` 通过。
- [x] `pnpm test src/pages/reader/TranslatedMarkdownPane.test.tsx src/i18n/dict.test.ts src/lib/tauriCommandParity.test.ts src/pages/pageSmoke.test.tsx` 通过。
- [x] `pnpm typecheck` 通过。
- [x] `pnpm lint` 通过。
- [x] `git diff --stat` 能说明每个改动文件的目的。

验证记录:

- 日期: 2026-06-18
- 命令: `git status --short && git diff --stat`; `git diff --name-status`; `timeout 60 cargo test translate --lib`（src-tauri，修复后复跑）；`cargo clippy --lib --tests -- -D warnings`（src-tauri）；`timeout 60 cargo test --lib`（src-tauri）；`pnpm test src/pages/reader/TranslatedMarkdownPane.test.tsx src/i18n/dict.test.ts src/lib/tauriCommandParity.test.ts src/pages/pageSmoke.test.tsx`; `pnpm typecheck`; `pnpm lint`
- 结果: 已确认当前工作区 15 个已跟踪改动和 4 个未跟踪文件；核心改动集中在母语阅读 Markdown 翻译、译文缓存、Reader 切换、API/mock/i18n；已修复审查发现的译文查询先校验 paper、`MarkdownTranslationResult` re-export 使用、PDF 文本刷新不再写入 stale null；`cargo test translate --lib` 26 passed；`cargo clippy --lib --tests -- -D warnings` 通过；`timeout 60 cargo test --lib` 266 passed；前端 M0 指定测试 4 files / 13 tests passed；`pnpm typecheck` 通过；`pnpm lint` 通过。
- 剩余问题: `HANDOFF.md` 和 `todo.md` 仍是按项目规则不应提交的工作文件；M0 代码门禁已通过，尚未做人工 Reader 冒烟。

### [ ] M1: 导入链路可靠性，2026-07

目标: 用户从 PDF、arXiv、DOI、BibTeX、RSS feed 导入论文时，失败原因能被看见，重复论文能被识别，导入结果能回到库里继续处理。

用户路径:

1. 在 Import 页选择 PDF 或输入 DOI。
2. 系统提取标题、作者、年份、DOI、arXiv ID。
3. 系统检测是否已有相同论文。
4. 用户确认导入或合并。
5. 导入结果出现在 Library。

技术路径:

- 阅读 `src/pages/ImportPage.tsx` 和 `src/pages/import/`。
- 阅读 `src-tauri/src/ingest/` 和 `src-tauri/src/commands/pdf/`。
- 把 DOI、arXiv、PDF metadata 的错误统一成前端能展示的错误类型。
- 对 `src-tauri/src/storage/dedup/` 增加用例: DOI 相同、arXiv ID 相同、标题近似、作者年份冲突。
- 在前端导入任务列表显示失败原因、重试按钮、跳转到已有论文按钮。

小任务:

- [x] 列出所有导入入口和命令名。
- [x] 给 PDF 导入失败增加用户可读错误。
- [x] 给 DOI 导入失败增加用户可读错误。
- [x] 给重复论文检测增加至少 6 个 Rust 测试。
- [x] 在导入页显示“已存在，打开已有论文”。
- [x] 给导入任务列表增加失败态测试。

验证:

- [x] `timeout 60 cargo test dedup --lib` 通过。
- [x] `timeout 60 cargo test import_pdf --lib` 通过。
- [x] `pnpm test src/pages/import` 通过。
- [ ] 手动导入 1 篇已有 DOI，能跳转已有论文。

验证记录:

- 日期: 2026-06-18
- 命令: `find src/pages/ImportPage.tsx src/pages/import src-tauri/src/commands/pdf src-tauri/src/ingest src-tauri/src/commands/**/*import*`; `search` 前端 api/import 调用和后端 #[tauri::command]`; `read` `src/lib/apiLibrary.ts`, `src-tauri/src/commands/imports.rs`, `src-tauri/src/commands/pdf/*`, `src-tauri/src/commands/mod.rs`; `pnpm test src/pages/import/importJobs.test.ts src/i18n/dict.test.ts`; `pnpm test src/pages/import/ArxivDoiWorkflow.test.ts src/pages/import/importJobs.test.ts src/i18n/dict.test.ts`; `timeout 60 cargo test dedup --lib`; `pnpm test src/pages/pageSmoke.test.tsx src/i18n/dict.test.ts src/lib/tauriCommandParity.test.ts`; `pnpm test src/pages/import/importJobs.test.ts`; `timeout 60 cargo test import_pdf --lib`; `pnpm test src/pages/import`; `pnpm exec playwright test e2e/app-smoke.spec.ts -g "opens an existing paper"`; `pnpm test src/pages/pageSmoke.test.tsx src/lib/tauriCommandParity.test.ts`
- 结果: 已列出导入入口和命令名；已完成 PDF/DOI 导入失败可读化；已在 `src-tauri/src/storage/dedup.rs` 增加 6 个重复检测测试并修复 dedup 查询误选不存在 `abstract_text` 列的问题；已在 `ArxivDoiTab` 接入 DOI 已存在查询，命中时不继续重复抓取元数据，并在 `IdentifierPanel` 显示“已存在，打开已有论文”操作跳转 `/reader/{id}`；已补充中英文 `import.existingDoi` / `import.openExisting` 文案和 `paper_find_by_doi` mock；已给 `ImportJobInbox` 增加失败态 SSR 测试，覆盖 failed job、failed step、progress failed count、错误文本、active count；已新增已有 DOI 跳转 e2e 用例；dedup 测试 10 passed；import_pdf Rust targeted 2 passed；import 前端目录测试 2 files / 25 tests passed；page smoke + command parity 2 files / 8 tests passed。
- 剩余问题: 手动/e2e DOI 跳转未完成：`pnpm exec playwright test e2e/app-smoke.spec.ts -g "opens an existing paper"` 被环境阻断，缺少 Playwright Chromium executable `/home/zonazcy/.cache/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-linux64/chrome-headless-shell`。需安装浏览器后复跑才能勾选手动验收。

### [ ] M2: 阅读器主体验，2026-08

目标: 阅读器成为用户每天使用的主界面。PDF、母语阅读、选段翻译、术语、笔记、高亮跳转不能互相打架。

用户路径:

1. 打开论文。
2. 阅读 PDF 或母语译文。
3. 选择文本翻译。
4. 保存高亮和笔记。
5. 从笔记或高亮回到 PDF 位置。

技术路径:

- 拆分 `src/pages/ReaderPage.tsx` 中的状态和布局逻辑。
- 为 `PdfPane` 的文本缓存写入和译文缓存失效增加前端测试。
- 为高亮跳转在 PDF 和母语阅读切换时的行为增加测试。
- 把阅读器错误态集中到 `ReaderMessageScreen` 或局部 error panel。
- 检查 `src/styles/reader.css`，避免 Markdown 译文和 PDF 高亮样式冲突。

小任务:

- [x] 梳理 Reader 状态图: loading、no PDF、PDF、native、split、help。
- [x] 给高亮跳转切回 PDF 写测试。
- [x] 给 PDF text cache invalidate 译文查询写测试。
- [x] 给母语阅读成功态补“重新翻译”交互测试。
- [x] 检查窄屏布局，按钮文字不能挤出容器。
- [ ] 记录 5 个真实 PDF 的阅读器表现。

验证:

- [x] `pnpm test src/pages/reader src/pages/pageSmoke.test.tsx` 通过。
- [x] `pnpm typecheck` 通过。
- [ ] 用 5 篇 PDF 手动检查: 普通论文、双栏论文、扫描件、长表格论文、公式多的论文。

验证记录:

- 日期: 2026-06-18
- 命令: `read src/pages/ReaderPage.tsx`, `read src/pages/reader/PdfPane.tsx`, `read src/pages/reader/TranslatedMarkdownPane.tsx`, `read src/pages/reader/ReaderWorkspacePane.tsx`, `read src/pages/reader/ReaderMessageScreen.tsx`; `pnpm test src/pages/reader/readerState.test.ts`; `pnpm test src/pages/reader/pdfTextCache.test.ts`; `pnpm test src/pages/reader/TranslatedMarkdownPane.test.tsx src/pages/reader/readerLayout.test.ts`; `pnpm test src/pages/reader src/pages/pageSmoke.test.tsx`; `pnpm typecheck`
- 结果: Reader 状态图已梳理；已新增 `readerState` 纯函数测试覆盖 native 切回 PDF、PDF ready 立即滚动、PDF 未 ready 时 pending jump；已新增 `pdfTextCache` 测试覆盖写入 PDF text 后 invalidate `paperTranslatedMarkdown` base query，以及空文本不写入不 invalidate；已在 `TranslatedMarkdownPane.test.tsx` 覆盖母语阅读成功态显示“重新翻译”；已将 compact header title class 抽为 `READER_COMPACT_TITLE_CLASS`，确认窄屏标题保留 `min-w-0 flex-1 truncate`，按钮保持 icon-only，不会被标题文字挤出容器；M2 reader/pageSmoke 自动验证 8 files / 21 tests passed；`pnpm typecheck` 通过。
- 剩余问题: M2 仍需 5 篇 PDF 人工检查；Playwright/人工 PDF 检查受本机浏览器环境限制。

### [ ] M3: AI 成本和可控性，2026-09

目标: 用户知道什么时候会调用模型，能控制模型、语言、最大长度和重试。失败时不保存半成品。

用户路径:

1. 用户在 Settings 配置模型。
2. 用户在 Reader 或 Ask 点击生成。
3. UI 显示本次任务会处理的范围。
4. 失败时显示原因和重试入口。

技术路径:

- 阅读 `src/pages/settings/ProfilesTab.tsx`、`TaskAssignments.tsx`、`src-tauri/src/ai/profile.rs`。
- 给每类 AI 任务定义输入规模估算: 字符数、chunk 数、预计请求数。
- 在前端生成按钮旁显示“将发送 N 段文本”。
- 把 `translate_markdown_text` 的 chunk 大小配置化，默认值保留在后端。
- 增加 AI request error 类型，不再只返回字符串。

小任务:

- [x] 列出所有 `TaskKind` 和调用入口。
- [x] 为全文翻译返回 chunk 数估算，不调用模型。
- [x] 在母语阅读空状态显示预计分段数。
- [x] 为模型 `finish_reason=length` 写单元测试。
- [x] Settings 里显示每个任务绑定的 profile。
- [x] 给 AI 错误增加前端展示测试。

验证:

- [x] `timeout 60 cargo test ai --lib` 通过。
- [x] `pnpm test src/pages/settings src/pages/reader` 通过。
- [ ] 手动断网或填错 endpoint，UI 显示具体错误。

验证记录:

- 日期: 2026-06-18
- 命令: `search TaskKind`, `search active_profile_for_task`, `read src-tauri/src/ai/profile.rs`, `read src/pages/settings/TaskAssignments.tsx`, `read src/pages/settings/ProfilesTab.tsx`, `read src-tauri/src/commands/summaries.rs`, `read src-tauri/src/commands/reader_translate/mod.rs`, `read src-tauri/src/commands/batch/ai.rs`; `timeout 60 cargo test estimate --lib`; `pnpm test src/pages/reader/TranslatedMarkdownPane.test.tsx src/i18n/dict.test.ts src/lib/tauriCommandParity.test.ts`; `timeout 60 cargo test markdown_translation_errors_on_length_finish_reason --lib`; `pnpm test src/pages/settings/TaskAssignments.test.tsx src/i18n/dict.test.ts`; `pnpm test src/pages/reader/TranslatedMarkdownPane.test.tsx`; `timeout 60 cargo test ai --lib`; `pnpm test src/pages/settings src/pages/reader`
- 结果: M3 自动化小任务已完成：TaskKind/入口清单、全文翻译 chunk 估算、母语阅读空状态分段数、finish_reason=length 截断错误测试、Settings 任务绑定 profile/model 展示、AI 错误 formatter 前端测试。`TaskAssignments` 现在显示 `profile / model`，并补齐 `lit_review` 任务绑定类型和中英文文案；`TranslatedMarkdownPane` 的错误 formatter 覆盖具体 endpoint 错误字符串。`timeout 60 cargo test ai --lib` 92 passed；`pnpm test src/pages/settings src/pages/reader` 8 files / 17 tests passed。
- 剩余问题: M3 仅剩人工验证：手动断网或填错 endpoint，UI 显示具体错误。

### [ ] M4: 文献库检索和筛选，2026-10

目标: 用户能在 1000 篇论文库里找到目标论文、未读论文、某个主题论文和某个作者论文。

用户路径:

1. 进入 Library。
2. 搜索关键词或作者。
3. 用文件夹、标签、年份、阅读状态筛选。
4. 保存智能集合。

技术路径:

- 阅读 `src/pages/LibraryPage.tsx`、`src/pages/library/`。
- 阅读 `src-tauri/src/storage/retrieval/`、`smart_collections/`、`papers/`。
- 检查 FTS token 处理和中英文混合搜索。
- 为 Library filter bar 写更多组合测试。
- 为 Smart Collection 查询生成 SQL 的路径补 Rust 测试。

小任务:

- [x] 建立 50 条本地测试论文 fixture。
- [x] 搜索标题、作者、摘要、笔记命中路径。
- [x] 筛选条件组合: 年份、标签、文件夹、阅读状态。
- [x] 智能集合规则 UI 增加非法规则提示。
- [x] 大列表滚动保持选择状态。
- [x] Library 空状态说明导入入口。

验证:

- [x] `timeout 60 cargo test retrieval --lib` 通过。
- [x] `timeout 60 cargo test smart_collections --lib` 通过。
- [x] `pnpm test src/pages/library` 通过。
- [ ] 手动导入 100 篇 fixture 后搜索不卡死。

验证记录:

- 日期: 2026-06-18
- 命令: `read src/pages/LibraryPage.tsx`, `find src/pages/library src-tauri/src/storage/retrieval src-tauri/src/storage/smart_collections src-tauri/src/storage/papers`, `read src-tauri/src/storage/retrieval.rs`, `read src-tauri/src/storage/retrieval/fts.rs`, `read src-tauri/src/storage/retrieval/unified.rs`, `read src-tauri/src/storage/papers/tests.rs`; `timeout 60 cargo test fifty_paper_fixture --lib`; `pnpm test src/pages/library/libraryFilters.test.ts src/pages/library/LibraryFilterBar.test.tsx src/i18n/dict.test.ts`; `pnpm test src/components/SmartCollectionEditor.test.tsx src/components/smartCollectionRules.test.ts src/i18n/dict.test.ts`; `pnpm test src/pages/library/librarySelection.test.ts src/pages/library/libraryFilters.test.ts`; `pnpm test src/pages/library/LibraryEmptyState.test.tsx src/pages/library/LibraryFilterBar.test.tsx`; `timeout 60 cargo test retrieval --lib`; `timeout 60 cargo test smart_collections --lib`; `pnpm test src/pages/library`; `pnpm typecheck`
- 结果: M4 自动化小任务和自动验收已完成：50 条 fixture、标题/作者/摘要/笔记检索、Library 组合过滤、智能集合非法规则 UI、大列表选择状态、Library 空状态导入入口说明。`timeout 60 cargo test retrieval --lib` 15 passed；`timeout 60 cargo test smart_collections --lib` 4 passed；`pnpm test src/pages/library` 6 files / 11 tests passed；`pnpm typecheck` 通过。
- 剩余问题: M4 仅剩人工性能检查：手动导入 100 篇 fixture 后搜索不卡死。

### [ ] M5: 笔记和引用工作流，2026-11

目标: 用户能从高亮生成阅读卡片，维护自己的笔记，导出引用和 Markdown 摘要。

用户路径:

1. 阅读时高亮关键句。
2. 在右侧写问题、方法、结论、局限。
3. 复制 BibTeX 或导出 Markdown。
4. 在项目写作页复用这些笔记。

技术路径:

- 阅读 `src/pages/reader/NotesPane.tsx`、`NoteSectionsPane.tsx`、`ProjectWritingPanel.tsx`。
- 阅读 `src-tauri/src/storage/notes.rs`、`note_sections.rs`、`export/`。
- 把笔记保存状态做成可见状态: saved、saving、failed。
- 给 Markdown 导出增加引用、笔记、高亮可选项。
- 检查 `src/lib/markdown.ts` 的渲染和转义。

小任务:

- [x] 笔记保存失败时显示重试。
- [x] 阅读卡片字段支持空值和恢复。
- [x] 导出 Markdown 时带 paper metadata。
- [x] 导出引用支持 BibTeX、RIS、APA、IEEE。
- [x] 项目写作页能引用阅读卡片。
- [x] 写作页渲染命令失败时显示错误。

验证:

- [x] `timeout 60 cargo test notes --lib` 通过。
- [x] `timeout 60 cargo test export --lib` 通过。
- [x] `pnpm test src/pages/reader src/components/ExportCitationsDialog*` 通过。
- [ ] 手动导出 3 篇论文的 Markdown 和 BibTeX。

验证记录:

- 日期: 2026-06-18
- 命令: `read src/pages/reader/NotesPane.tsx`, `read src/pages/reader/NoteSectionsPane.tsx`, `read src-tauri/src/commands/notes.rs`, `read src-tauri/src/export/markdown.rs`, `read src/components/ExportCitationsDialog.tsx`, `read src-tauri/src/export/citations.rs`, `read src-tauri/src/commands/project_writing.rs`, `read src-tauri/src/commands/project_writing_render.rs`, `read src/pages/projects/ProjectWritingPanel.tsx`; `pnpm test src/pages/reader/NotesPane.test.tsx`; `pnpm test src/pages/reader/noteSectionState.test.ts`; `timeout 60 cargo test renders_readable_paper_metadata_section --lib`; `pnpm test src/components/ExportCitationsDialog.test.ts`; `timeout 60 cargo test citations --lib`; `timeout 60 cargo test outline_reuses_reading_card_notes --lib`; `pnpm test src/pages/projects/ProjectWritingPanel.test.tsx`; `timeout 60 cargo test notes --lib`; `timeout 60 cargo test export --lib`; `pnpm test src/pages/reader src/components/ExportCitationsDialog.test.ts src/pages/projects/ProjectWritingPanel.test.tsx`
- 结果: M5 自动化小任务和自动验收已完成：笔记保存失败重试、阅读卡片空值/恢复、Markdown 导出 paper metadata、引用格式覆盖、项目写作页复用阅读卡片、写作页渲染命令错误展示。notes gate 4 passed；export gate 8 passed；reader/export/writing 前端 11 files / 22 tests passed。
- 剩余问题: M5 仅剩人工验证：手动导出 3 篇论文的 Markdown 和 BibTeX。

### [ ] M6: Ask 和库内问答，2026-12

目标: 用户向自己的文献库提问时，回答能引用具体论文和片段。回答不知道时要说不知道。

用户路径:

1. 打开 Ask。
2. 输入研究问题。
3. 系统检索相关论文和笔记。
4. 模型回答并列出来源。
5. 用户把结果保存成笔记或项目材料。

技术路径:

- 阅读 `src/pages/AskPage.tsx`、`src/pages/ask/`。
- 阅读 `src-tauri/src/commands/ask/`、`src-tauri/src/ai/library_qa/`。
- 检查检索上下文是否包含 document Markdown、笔记和高亮。
- 为来源引用结构增加类型，不只返回字符串。
- 为“没有足够证据”写 prompt 和解析测试。

小任务:

- [x] Ask 回答显示来源论文列表。
- [x] 来源能跳转到论文详情或 Reader。
- [x] 问答上下文显示命中的笔记和高亮数量。
- [x] 无证据回答必须明确说明缺少证据。
- [x] 保存 Ask 回答到项目笔记。
- [x] 多轮对话保留上一轮约束。

验证:

- [x] `timeout 60 cargo test library_qa --lib` 通过。
- [x] `timeout 60 cargo test ask --lib` 通过。
- [x] `pnpm test src/pages/ask src/pages/AskPage*` 通过。
- [ ] 用 20 篇同主题论文手动问 5 个问题，检查来源。

验证记录:

- 日期: 2026-06-18
- 命令: `read src/pages/AskPage.tsx`, `read src-tauri/src/ai/library_qa.rs`, `read src-tauri/src/commands/ask/library.rs`, `read src-tauri/src/commands/ask/notes.rs`; `pnpm test src/pages/ask/askSources.test.ts`; `pnpm test src/pages/ask/askContext.test.ts src/pages/ask/askSources.test.ts`; `pnpm typecheck`; `timeout 60 cargo test commands::ask --lib`; `timeout 60 cargo test library_qa --lib`; `timeout 60 cargo test ask --lib`; `pnpm test src/pages/ask src/pages/AskPage*`
- 结果: 已完成 Ask 来源列表跳转 Reader、上下文 hit 计数、无证据回答测试、保存 Ask 回答到项目笔记、保留多轮对话约束；`render_note_includes_question_answer_terms_and_sources` 覆盖问题、答案、模型、检索词和 source snippet 写入 Markdown；`history_summary_preserves_prior_constraints` 证明系统保留上一轮约束摘要；`library_qa` 10 passed；`ask` 14 passed；Ask 前端 2 files / 4 tests passed。
- 剩余问题: M6 仅剩手动 5 问来源检查。

### [ ] M7: Topic Survey 和发现流程，2027-01

目标: 用户从一个主题词开始，得到可检查的论文短名单、子方向和综述草稿。

用户路径:

1. 在 Topic 页输入主题。
2. 系统搜索论文并分子方向。
3. 用户筛选 must-read。
4. 系统生成 survey 结构。
5. 用户导出或放进项目。

技术路径:

- 阅读 `src/pages/TopicPage.tsx`、`src/pages/topic/`。
- 阅读 `src-tauri/src/ai/topic_survey.rs`、`topic_survey_annotate.rs`、`ingest/topic_survey_retrieval/`。
- 把 topic survey 的中间结果保存到本地，避免刷新丢失。
- 为每个子方向保留搜索词、入选论文和排除论文。
- 在 UI 中显示为什么某篇论文进了 must-read。

小任务:

- [x] Topic 搜索结果本地保存。
- [x] 子方向卡片显示检索词。
- [x] must-read 短名单支持手动增删。
- [x] Survey 结构可编辑。
- [x] 生成草稿前显示来源论文数量。
- [x] 导出 survey Markdown。

验证:

- [x] `timeout 60 cargo test topic_survey --lib` 通过。
- [x] `timeout 60 cargo test topic_survey_retrieval --lib` 通过。
- [x] `pnpm test src/pages/topic` 通过。
- [ ] 用一个真实主题完整跑一次，不要求联网部分在 CI 中执行。

验证记录:

- 日期: 2026-06-18; 2026-06-19
- 命令: `read src/pages/TopicPage.tsx`, `read src/pages/topic/TopicSurveyView.tsx`, `read src/pages/topic/TopicSearchView.tsx`, `read src/pages/topic/surveyStorage.ts`, `read src/pages/topic/SubareaCard.tsx`, `read src/pages/topic/MustReadShortlist.tsx`, `read src/pages/topic/SurveyPaperRow.tsx`; `pnpm test src/pages/topic/topicSearchStorage.test.ts`; `pnpm test src/pages/topic/SubareaCard.test.tsx`; `pnpm test src/pages/topic/topicSurveyState.test.ts src/pages/topic/SubareaCard.test.tsx`; `pnpm test src/pages/topic`; `pnpm test src/pages/topic/topicSurveyState.test.ts src/pages/topic/SubareaCard.test.tsx src/i18n/dict.test.ts`; `pnpm typecheck`
- 命令: `pnpm test src/pages/topic/topicSurveyState.test.ts src/pages/topic/surveyMarkdown.test.ts src/pages/topic/SubareaCard.test.tsx src/i18n/dict.test.ts`; `pnpm test src/pages/topic`; `pnpm typecheck`; `timeout 60 cargo test topic_survey --lib`; `timeout 60 cargo test topic_survey_retrieval --lib`
- 结果: 已完成 Topic 搜索结果本地保存、子方向检索词显示、must-read 手动增删、Survey 结构编辑、生成草稿前来源论文数量显示、Survey Markdown 下载导出。`updateSurveySubareaSummary` 可编辑 subarea summary 且保留 must-read 状态；`SubareaCard` 在传入 `onSummaryChange` 时显示 textarea；变更会写回 `saveCurrentSurvey`；`SurveyFooter` 和保存/导出动作栏显示去重后的来源论文数量；`renderTopicSurveyMarkdown` 导出包含来源数量、必读数量、关键学者、子方向、检索词和论文标识。topic targeted 4 files / 11 tests passed；topic 目录 5 files / 12 tests passed；typecheck 通过；topic_survey Rust 28 passed；topic_survey_retrieval Rust 11 passed。
- 剩余问题: M7 仅剩真实主题完整人工流程，不要求联网部分在 CI 中执行。

### [ ] M8: 图谱、比较和关系发现，2027-02

目标: 用户能看到论文之间的引用、相似、主题和概念关系，并从图谱回到论文。

用户路径:

1. 打开 Graph。
2. 选择网络图或 mindmap。
3. 点击节点查看论文或概念。
4. 创建或删除关系。
5. 比较两篇或多篇论文。

技术路径:

- 阅读 `src/pages/GraphPage.tsx`、`src/pages/graph/`、`src/pages/ComparePage.tsx`。
- 阅读 `src-tauri/src/storage/paper_links/`、`concepts/`、`commands/graph.rs`。
- 为图谱节点和边定义稳定类型。
- 确保图谱渲染在 100、500、1000 节点时有降级策略。
- 比较页复用 Library 和 Reader 的论文选择组件。

小任务:

- [x] 图谱节点类型统一: paper、concept、tag、folder。
- [x] 图谱边类型统一: citation、similar、manual、concept。
- [x] 点击节点打开详情抽屉。
- [x] 手动创建关系写入数据库。
- [x] 删除关系有确认。
- [x] Compare 页显示差异表: 问题、方法、数据、局限。

验证:

- [x] `timeout 60 cargo test paper_links --lib` 通过。
- [x] `timeout 60 cargo test concepts --lib` 通过。
- [x] `pnpm test src/pages/graph src/pages/ComparePage*` 通过。
- [ ] 手动加载 500 节点图谱，交互不冻结 5 秒以上。

验证记录:

- 日期: 2026-06-19
- 命令: `pnpm test src/lib/apiSchema.test.ts src/i18n/dict.test.ts`; `pnpm test src/pages/graph src/lib/apiSchema.test.ts src/i18n/dict.test.ts`; `timeout 60 cargo test paper_links --lib`; `timeout 60 cargo test concepts --lib`; `pnpm test src/pages/graph`; `pnpm test src/pages/graph src/pages/ComparePage* src/i18n/dict.test.ts`; `pnpm typecheck`
- 结果: 已统一 Graph API 前端节点 taxonomy 为 paper/concept/tag/folder，边 taxonomy 为 citation/similar/manual/concept；后端 GraphEdge 输出统一 `edge_type` 并保留 `relation` 原始关系；GraphSidebar 已能渲染选中节点详情抽屉；手动 `paper_links` 写入有 SQLite roundtrip 测试；删除真实 `link:<id>` 关系前有确认，派生概念边不显示删除入口；Compare 页从 Markdown summary table 提取并显示问题、方法、数据/场景、局限差异表。前端 graph/schema/i18n targeted 3 files / 16 tests passed；Graph 目录 2 files / 3 tests passed；Compare/Graph/i18n 4 files / 9 tests passed；TypeScript typecheck 通过；paper_links Rust 2 passed；concepts Rust 命令通过，当前匹配 0 tests。
- 剩余问题: M8 仅剩人工性能检查：手动加载 500 节点图谱，确认交互不冻结 5 秒以上。

### [ ] M9: 同步、备份和恢复，2027-03

目标: 用户能把本地库备份到本地目录或 WebDAV，恢复时不破坏现有库。

用户路径:

1. 在 Settings 配置同步目标。
2. 运行 push preview。
3. 确认上传。
4. 在另一台机器 pull preview。
5. 确认恢复，原库有备份。

技术路径:

- 阅读 `src/pages/settings/SyncPanel.tsx`、`src-tauri/src/library_sync/`。
- 检查 manifest 的 path、hash、size、version。
- 给 pull preview 的破坏性操作加明确确认。
- WebDAV 错误要显示 HTTP status 和路径摘要。
- 恢复前自动生成本地备份目录。

小任务:

- [x] SyncPanel 显示当前配置和最后一次结果。
- [x] push preview 显示新增、更新、删除、未变化。
- [x] pull preview 显示会替换哪些文件。
- [x] 恢复前创建备份。
- [x] WebDAV 认证失败显示可读错误。
- [x] 同步日志写入 app log。

验证:

- [x] `timeout 60 cargo test library_sync --lib` 通过。
- [x] `pnpm test src/pages/settings/SyncPanel*` 通过。
- [ ] 用临时目录完成一次 push 和 pull。
- [x] WebDAV 用 mock 或本地测试服务完成错误路径测试。

验证记录:

- 日期: 2026-06-19
- 命令: `read src/pages/settings/SyncPanel.tsx`, `read src/lib/syncApi.ts`, `read src-tauri/src/commands/sync.rs`, `read src-tauri/src/library_sync/local.rs`, `read src-tauri/src/library_sync/local/tests.rs`, `read src-tauri/src/library_sync/webdav/tests.rs`; `pnpm test src/pages/settings/SyncPanel* src/i18n/dict.test.ts`; `pnpm typecheck`; `timeout 60 cargo test library_sync --lib`
- 结果: 已完成 SyncPanel 当前配置摘要和最后一次结果显示；push/pull preview 已显示新增、覆盖、删除、不变和传输字节；pull preview 显示备份路径，`replace_library_root_stores_pre_pull_backup_on_success` 覆盖恢复前备份；WebDAV 401/403/500/404 和 manifest 错误路径有可读 HTTP status；同步命令层已写 tracing app log，记录 test/preview/push/pull 成功和失败的方向、远端、文件数、字节数、备份和错误。SyncPanel/i18n 2 files / 6 tests passed；typecheck 通过；library_sync Rust 29 passed。
- 剩余问题: M9 仅剩真实临时目录 push/pull 端到端检查，未启动本地 WebDAV 服务执行完整成功路径。

### [ ] M10: 性能和大库稳定性，2027-04

目标: 5000 篇论文的库能启动、搜索、滚动、打开 Reader。大库场景不要求所有 AI 功能即时完成，但 UI 不能无响应。

技术路径:

- 准备 500、1000、5000 篇论文的 SQLite fixture。
- 测量 Library 首屏、搜索、Reader 打开、Graph 打开。
- 检查 React Query key 是否导致重复请求。
- 检查大列表是否虚拟化。
- 后端重 IO 命令加 tracing span。

小任务:

- [x] 建立大库 fixture 生成脚本。
- [ ] Library 首屏耗时记录到文档。
- [x] 搜索耗时记录到文档。
- [ ] Reader 打开耗时记录到文档。
- [x] Graph 大节点降级策略。
- [x] 后端慢命令写入 tracing。

验收指标:

- [ ] 1000 篇库 Library 首屏小于 2 秒。
- [ ] 1000 篇库标题搜索小于 500 毫秒。
- [ ] 5000 篇库 Library 不崩溃。
- [ ] 5000 篇库打开 Reader 不超过 3 秒，不含 PDF 渲染时间。

验证:

- [x] `pnpm test` 通过。
- [x] `timeout 60 cargo test --lib` 通过。
- [x] 本地性能记录写入 `todo.md` 验证记录，不新建 docs 草稿。

验证记录:

- 日期: 2026-06-19
- 命令: `python3 scripts/generate-large-library-fixture.py --output /tmp/litera-m10-fixture-smoke.sqlite --count 25 --links 40 --terms-per-paper 2 --force`; `python3 scripts/generate-large-library-fixture.py --output /tmp/litera-m10-fixture-1000.sqlite --count 1000 --links 1200 --terms-per-paper 2 --force`; `python3 scripts/generate-large-library-fixture.py --output /tmp/litera-m10-fixture-5000.sqlite --count 5000 --links 6000 --terms-per-paper 2 --force`; Python/SQLite 本机测量 `library_recent_200`、`title_search_200`、`reader_paper_get`、`graph_data_sql_path`; `python3 -m py_compile scripts/generate-large-library-fixture.py`; `pnpm test src/pages/graph/graphPerformance.test.ts src/i18n/dict.test.ts`; `pnpm typecheck`; `rustfmt --edition 2021 --check src/commands/papers.rs src/commands/graph.rs`; `timeout 60 cargo test papers --lib`（首次冷编译超时，增量复跑通过）；`pnpm test`; `timeout 60 cargo test --lib`
- 结果: 已新增 `scripts/generate-large-library-fixture.py`，应用全部 SQLite 迁移后生成可指定规模的大库 fixture，覆盖 papers、FTS、tags、folders、reading_queue、paper_terms、paper_links；已生成 1000 篇和 5000 篇本地样本。1000 篇 SQLite 路径: `library_recent_200` avg 0.45 ms, `title_search_200` avg 1.46 ms, `reader_paper_get` avg 0.01 ms, `graph_data_sql_path` avg 2.06 ms。5000 篇 SQLite 路径: `library_recent_200` avg 0.45 ms, `title_search_200` avg 3.70 ms, `reader_paper_get` avg 0.01 ms, `graph_data_sql_path` avg 14.10 ms。Graph 已增加 500+ 节点 large 模式和 1000+ 节点/2500+ 边 dense 模式，显式提示仅保留选中节点标签并简化箭头；后端 `papers_count`、`papers_recent`、`papers_in_folder`、`paper_get`、`papers_search`、`graph_data` 已写入 tracing span 和完成/失败耗时日志。脚本语法检查通过；Graph/i18n 前端定向测试 2 files / 7 tests passed；`pnpm typecheck` 通过；`rustfmt --edition 2021 --check` 通过；`timeout 60 cargo test papers --lib` 增量复跑 16 passed；完整 `pnpm test` 47 files / 150 tests passed；`timeout 60 cargo test --lib` 286 passed。
- 剩余问题: 当前性能记录只覆盖本机 SQLite/后端查询路径，不包含真实 Tauri IPC、React 渲染、浏览器滚动或 PDF 渲染；Library 首屏、Reader 打开和 5000 篇不崩溃仍需真实应用/浏览器环境验证。

### [x] M11: 安全、隐私和数据边界，2027-05

目标: 本地文件、模型配置、同步凭据和外部请求都能解释清楚。用户知道哪些数据离开本机。

技术路径:

- 阅读 `src-tauri/src/secret.rs`、`syncSecurity.ts`、`http.rs`、`storage/paths.rs`。
- 检查所有外部 HTTP 请求入口。
- 确认 PDF 文件路径校验覆盖导入、读取、下载和同步。
- 模型 API key 不写入源码和日志。
- Settings 里解释每类 AI 请求会发送哪些内容。

小任务:

- [x] 列出外部网络请求入口。
- [x] 检查 SSRF 和本地地址拦截测试。
- [x] 检查外部 PDF 路径校验测试。
- [x] Settings 增加 AI 数据发送说明。
- [x] 日志脱敏 API key、token、签名密钥。
- [x] 同步凭据只走 secret 存储或用户配置文件。

验证:

- [x] `timeout 60 cargo test http --lib` 通过。
- [x] `timeout 60 cargo test paths --lib` 通过。
- [x] `pnpm test src/lib/syncSecurity.test.ts` 通过。
- [x] 手动搜索源码，不存在硬编码 key。

验证记录:

- 日期: 2026-06-20
- 命令: `read src-tauri/src/secret.rs`, `read src-tauri/src/ai/profile/persistence.rs`, `read src-tauri/src/library_sync/config.rs`, `read src-tauri/src/http.rs`, `read src-tauri/src/storage/paths.rs`, `read src/pages/settings/DataPrivacyPanel.tsx`, `read src/lib/syncSecurity.ts`; `rg -n "pub async fn (fetch_|search_|download_|refresh_|run_topic|topic|similar|citations|parse_)|async fn (fetch_|search_|download_)|\\.send\\(\\)" src-tauri/src/ingest src-tauri/src/discovery src-tauri/src/mineru.rs src-tauri/src/library_sync src-tauri/src/ai src-tauri/src/commands`; `pnpm test src/pages/settings/DataPrivacyPanel.test.tsx src/i18n/dict.test.ts src/lib/syncSecurity.test.ts`; `timeout 60 cargo test diagnostics --lib`; `timeout 60 cargo test http --lib`; `timeout 60 cargo test paths --lib`; `timeout 60 cargo test pdf_download_url_validation_rejects_internal_targets --lib`; `timeout 60 cargo test sync_config --lib`; `timeout 60 cargo test profile --lib`; `pnpm typecheck`; `rustfmt --edition 2021 --check src/diagnostics.rs`; production-source secret pattern search excluding `src/test/**`
- 结果: 外部网络入口已列出：OpenAI-compatible LLM chat/models、MinerU Agent/precise OCR、Semantic Scholar search/recommendations/citations/topic retrieval、CrossRef DOI/title/PDF metadata、arXiv metadata/category/PDF、RSS feed/landing pages、Sci-Hub DOI/PDF fallback、user-configured WebDAV sync、publisher PDF downloads。SSRF/本地地址拦截已有 `http.rs` redirect policy、PDF download URL/DNS 拦截和 WebDAV HTTPS/local-only 校验；外部 PDF 路径校验已有 `ensure_inside_root` 与 `validate_external_pdf` 覆盖 traversal、missing、inside-library、extension、magic header。Settings 隐私面板新增“AI 请求会发送的内容”，覆盖翻译、摘要/快读、问答、综述/主题、术语/关系发现；新增 SSR 测试。诊断日志新增统一脱敏，覆盖 `api_key`、`password`、`token`、`Authorization: Bearer`、`sk-*` 和私钥块/签名密钥，`append_line` 和 tracing log writer 都经过脱敏；新增 Rust 测试。同步和 LLM/MinerU 凭据继续优先写 OS keychain，失败时显式保留用户配置文件并告警；同步配置仍拒绝远端 HTTP。前端 M11 定向测试 3 files / 9 tests passed；diagnostics 3 passed；http 9 passed；paths 16 passed；PDF 下载内网拦截 1 passed；sync_config 1 passed；profile 12 passed；`pnpm typecheck` 通过；`rustfmt --edition 2021 --check src/diagnostics.rs` 通过。生产源码 secret 搜索未发现真实硬编码 key；命中项均为同文件测试块、诊断脱敏测试、WebDAV 配置测试或 Ollama 本地预设占位值。
- 剩余问题: 未做真实联网手动验证；M11 自动化和源码检查已完成。

### [ ] M12: 发布、文档和 1.0 候选，2027-06

目标: 发布流程可重复，用户手册覆盖主要工作流，1.0 候选版本能通过冒烟测试。

技术路径:

- 遵守项目发布规则: 版本号同时更新 `package.json`、`src-tauri/tauri.conf.json`、`src-tauri/Cargo.toml`、`src-tauri/Cargo.lock`。
- GitHub Actions 构建 signed updater artifacts。
- `docs/` 入库只保留 `docs/manual/manual.pdf` 和 `docs/manual/manual-en.pdf`。
- 手册源文件和截图草稿不提交，除非项目规则改变。
- 发布前跑完整检查。

小任务:

- [ ] 更新中英文手册 PDF。
- [x] 检查 docs 目录入库规则。
- [ ] 发布前完整跑 Rust 和前端检查。
- [x] 检查 updater `latest.json`。
- [ ] 写 GitHub Release body，不提交 release notes markdown。
- [ ] 在干净机器安装并打开 1.0 候选。

发布前命令:

```bash
timeout 60 cargo test --lib
cargo clippy --lib --tests -- -D warnings
pnpm test
pnpm typecheck
pnpm lint
```

验证记录:

- 日期: 2026-06-20
- 命令: `find docs -maxdepth 4 -type f -print | sort`; `git ls-files docs`; `git status --short -- docs`; `read .github/workflows/release.yml`; `read src-tauri/tauri.conf.json`; `rg -n "latest\\.json|TAURI_SIGNING|updater|release|tauri build|upload|artifact|publish|manual\\.pdf|manual-en\\.pdf" .github src-tauri package.json`
- 结果: `docs/` 工作区存在大量未跟踪手册源文件、截图、旧发布草稿和 superpowers 计划，但 `git ls-files docs` 仅跟踪 `docs/manual/manual.pdf` 与 `docs/manual/manual-en.pdf`，符合项目入库规则；`git status --short -- docs` 无已跟踪 docs 改动。Updater 配置已检查：`src-tauri/tauri.conf.json` 启用 `bundle.createUpdaterArtifacts=true`，updater endpoint 指向 `https://github.com/lychen2/LitFolio/releases/latest/download/latest.json`，release workflow 使用 `tauri-apps/tauri-action@v0.6.2` 并传入 `TAURI_SIGNING_PRIVATE_KEY` / `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`，会按 tag 构建 signed updater artifacts 并发布到 GitHub Release；preflight 校验四处版本号与 tag 一致。
- 剩余问题: 未更新手册 PDF；未执行完整发布前命令；未撰写真实 GitHub Release body；未在干净机器安装并打开 1.0 候选。

## 4. 跨月任务池

这些任务不固定到某个月。做任何功能时，如果碰到相关代码，就顺手补上，但不要打断当前月主线。

### [x] 测试债

- [x] 每个新增 Tauri 命令同步更新 `src/test/tauriMockCommands.ts`。
- [x] 每个新增 i18n key 同步更新中英文词典。
- [x] 每个新增数据库迁移加入迁移测试。
- [x] 每个新增 AI parser 写纯函数单元测试。
- [x] 每个新增页面至少有 smoke test。

验证记录:

- 日期: 2026-06-20
- 命令: `pnpm test src/pages/pageSmoke.test.tsx`
- 结果: 顶层页面 smoke 已扩展到 App 当前注册的 Library、Import、Settings、Projects、Topic、Browse、Feeds、Candidates、Ask、Graph、Compare、Reader 等页面/路由；Graph 的重型 force-graph 画布在 SSR smoke 中按现有 PdfPane 模式 mock。定向测试 14 passed。
- 日期: 2026-06-20
- 命令: `pnpm test src/i18n/dict.test.ts`; `pnpm typecheck`
- 结果: 中英文词典 key 集合一致、无空翻译、插值占位符一致；`TKey` 类型检查通过。i18n 定向 3 passed；TypeScript typecheck 通过。
- 日期: 2026-06-20
- 命令: `git status --short -- src-tauri/migrations`; `rg -n "migrat|Migration|Migrator|run_migrations|MIGRATOR|sqlx::migrate" src-tauri/src src-tauri/tests src-tauri/migrations --glob '!target/**'`; `timeout 60 cargo test migrations --lib`
- 结果: 本轮没有新增或修改 `src-tauri/migrations`；迁移测试集中在 `src-tauri/src/storage/db.rs`，覆盖内存库 apply、latest schema、重复执行幂等、旧 `0001` fixture 升级。迁移定向 4 passed。
- 日期: 2026-06-20
- 命令: `rg -n "fn parse_|parse_[a-zA-Z0-9_]+\\(|parse_lenient|serde_json::from_str|mod tests|#\\[test\\]|#\\[tokio::test\\]" src-tauri/src/ai src-tauri/src/commands/reader_translate src-tauri/src/commands/reader_terms --glob '!target/**'`; `timeout 60 cargo test ai --lib`
- 结果: AI/LLM 解析路径已有纯函数测试覆盖，包括 chat response/SSE、lenient JSON、query expansion、topic survey skeleton/annotations、summaries、translate JSON/Markdown chunk/finish_reason、library QA context、models truncation，以及 reader translate/terms 的解析 helper。AI 定向 97 passed。
- 日期: 2026-06-20
- 命令: `pnpm test src/lib/tauriCommandParity.test.ts`; `pnpm test src/pages/pageSmoke.test.tsx`
- 结果: `tauriCommandParity` 新增反向断言，要求 `src/test/tauriMockCommands.ts` 中登记的 mock 命令都存在于 Rust command registry；结合 page smoke，新增页面所需 mock 会被基础渲染测试触发。command parity 2 passed；page smoke 14 passed。

### [ ] 架构债

- [x] 单个 React 页面超过 800 行时检查是否能按状态、工具栏、列表、详情拆分。
- [x] 单个 Rust command 文件超过 1000 行时检查是否能按业务命令拆分。
- [x] 长参数列表改为 input struct。
- [ ] 重复的错误展示抽成组件。
- [ ] 重复的 Tauri API 调用模式抽成 hook。

验证记录:

- 日期: 2026-06-20
- 文件: `src/pages/**/*.tsx`; `src-tauri/src/commands/**/*.rs`
- 处理: `wc -l src/pages/*.tsx src/pages/**/*.tsx` 显示 React 页面/组件当前最高为 `src/pages/reader/PdfPane.tsx` 737 行，未超过 800 行拆分检查阈值；`wc -l src-tauri/src/commands/*.rs src-tauri/src/commands/**/*.rs` 显示 Rust command 文件最高为 `src-tauri/src/commands/pdf/download.rs` 552 行，未超过 1000 行拆分检查阈值。
- 日期: 2026-06-20
- 文件: `src-tauri/src/commands/batch/ai.rs`; `src-tauri/src/commands/reader_translate/translate.rs`; `src-tauri/src/commands/reader_translate/mod.rs`
- 处理: 静态扫描 `src-tauri/src/commands`、`src/pages`、`src/components`、`src/lib` 中 6 个及以上参数的函数，命中 `emit_progress` 7 参数和 `translate_selection` 6 参数；已分别改为 `BatchProgress` 和 `TranslateSelectionInput` input struct。验证: `rustfmt --edition 2021 --check src/commands/batch/ai.rs src/commands/reader_translate/translate.rs src/commands/reader_translate/mod.rs` 通过；`timeout 60 cargo test batch --lib` 编译通过（当前匹配 0 tests）；`timeout 60 cargo test reader_translate --lib` 6 passed。

### [x] 可观测性

- [x] AI 请求记录 task kind、model、prompt chars、completion tokens。
- [x] 导入任务记录来源和失败原因。
- [x] 同步任务记录 manifest version、文件数量、总字节。
- [x] 大库搜索记录耗时。
- [x] 用户可导出诊断日志。

验证记录:

- 日期: 2026-06-19
- 命令: `pnpm test src/pages/graph/graphPerformance.test.ts src/i18n/dict.test.ts`; `pnpm typecheck`; `timeout 60 cargo test papers --lib`
- 结果: `papers_search` 日志新增 `query_len`、`limit`、`result_count`、`elapsed_ms` 和失败错误；M10 1000/5000 篇 fixture 的搜索耗时已记录到 M10 验证记录。
- 日期: 2026-06-20
- 命令: `pnpm test src/pages/settings/DataPrivacyPanel.test.tsx src/i18n/dict.test.ts src/lib/tauriCommandParity.test.ts`; `timeout 60 cargo test diagnostics_export --lib`; `pnpm typecheck`; `rustfmt --edition 2021 --check src/commands/mod.rs`
- 结果: Settings 数据与隐私页新增导出诊断日志入口，通过 Tauri 保存对话框选择目标路径；后端 `diagnostics_export_log` 会复制 `logs/litfolio.log`，日志尚未创建时写入说明文件；前端 API/mock、命令 parity、SSR 文案、Rust 导出单测、TypeScript typecheck 和 Rust 格式检查均通过。
- 日期: 2026-06-20
- 命令: `timeout 60 cargo test sync --lib`; `rustfmt --edition 2021 --check src/library_sync/local.rs src/library_sync/local/tests.rs src/commands/sync.rs`
- 结果: 同步 preview 和 push/pull 报告新增 manifest 摘要字段，现有 tracing 日志记录 `manifest_version`、`manifest_file_count`、`manifest_total_bytes`，同时保留传输 `file_count`、`total_bytes`、skipped 统计；同步本地 manifest/WebDAV/config 单测 30 passed，Rust 格式检查通过。
- 日期: 2026-06-20
- 命令: `timeout 60 cargo test ai --lib`
- 结果: AI chat client 新增结构化 tracing：成功日志记录 `task_kind`、`model`、`prompt_chars`、`prompt_tokens`、`completion_tokens`、`finish_reason`、`response_chars`；HTTP 非成功、空 body、响应解码失败记录 `task_kind`、`model`、`prompt_chars` 和错误上下文。所有业务 LLM 调用点改为带任务名路径，覆盖 `tldr`、`quick_read`、`translate`、`tag`、`link`、`topic_survey`、`ask`、`lit_review`，搜索扩展和模型连接测试分别记录 `search_expand`、`llm_test`；AI 定向测试 97 passed。
- 日期: 2026-06-20
- 命令: `timeout 60 cargo test import_pdf --lib`; `timeout 60 cargo test jobs --lib`; `rustfmt --edition 2021 --check src/commands/imports.rs src/commands/pdf/common.rs src/commands/pdf/import_files.rs src/commands/pdf/folder.rs src/commands/pdf/local.rs src/commands/pdf/download.rs src/commands/jobs.rs src/ai/client.rs src/ai/mod.rs src/ai/profile.rs src/ai/profile/tests.rs src/ai/summarize.rs src/ai/translate.rs src/ai/topic_survey.rs src/ai/query_expand.rs src/ai/link_discover.rs src/ai/lit_review.rs src/ai/library_qa.rs src/ai/topic_survey_annotate.rs src/ai/concept_extract.rs src/commands/comparisons.rs src/commands/reader_terms/explain.rs src/commands/reader_translate/explain.rs src/commands/reader_translate/translate.rs src/commands/reader_translate/mod.rs src/commands/llm.rs`
- 结果: 导入命令新增结构化日志，记录 `import_source`、公开标识符/路径、`imported_count`、`failed_count`；失败路径记录 `failure_reason`。覆盖 DOI、arXiv、BibTeX、Semantic Scholar 搜索导入、PDF 文件导入、文件夹导入、本地 PDF 保存、arXiv/DOI 自动 PDF 下载；通用 import job 创建/失败记录 `job_id`、`job_kind`、`import_source`、`scope` 和失败原因。PDF 导入定向 2 passed；job lifecycle 定向 2 passed；Rust 格式检查通过。

### [ ] 用户体验细节

- [ ] 所有生成类按钮有 loading、error、retry。
- [ ] 所有 destructive 操作有确认。
- [ ] 空状态有下一步入口。
- [ ] 窄屏布局无文字重叠。
- [ ] 图标按钮有 aria-label 和 title。

验证记录:

- 日期:
- 页面:
- 结果:

## 5. 每周更新格式

每周结束时在本节追加一条，不要改历史记录。

```text
### YYYY-MM-DD 周记录

完成:
- [x] M? 的某个小任务

验证:
- 命令:
- 结果:

下周:
- [ ] 下一步小任务

风险:
- 具体风险和文件路径
```

## 6. 当前周记录

### 2026-06-18 周记录

完成:

- [x] 写入 12 个月路线图。
- [x] 把旧的单功能 TODO 改为长期规划。

验证:

- 命令: `rg '^### \\[[ x]\\]|\\[ \\]' todo.md`
- 结果: TODO 中保留长期未完成项，当前不再把 1 年规划标成已完成。
- 命令: `git status --short && git diff --stat`; `git diff --name-status`; `timeout 60 cargo test translate --lib`; `cargo clippy --lib --tests -- -D warnings`; `timeout 60 cargo test --lib`; `pnpm test src/pages/reader/TranslatedMarkdownPane.test.tsx src/i18n/dict.test.ts src/lib/tauriCommandParity.test.ts src/pages/pageSmoke.test.tsx`; `pnpm typecheck`; `pnpm lint`
- 结果: 当前改动归属已梳理；已修复译文缓存 stale null、缓存查询绕过 paper 校验、后端 re-export 可维护性问题；后端翻译/缓存目标测试 26 passed；Rust lib 测试 266 passed；clippy/typecheck/lint 通过；母语阅读前端验收 13 passed。
- 命令: `pnpm test src/pages/import/ArxivDoiWorkflow.test.ts src/pages/import/importJobs.test.ts src/i18n/dict.test.ts`
- 结果: M1 PDF/DOI 导入失败可读化测试通过；3 files / 26 tests passed。
- 命令: `timeout 60 cargo test dedup --lib`
- 结果: M1 重复检测测试通过；10 passed；同时修复 dedup SQL select 使用不存在 `abstract_text` 列的问题。
- 命令: `pnpm test src/pages/pageSmoke.test.tsx src/i18n/dict.test.ts src/lib/tauriCommandParity.test.ts`
- 结果: M1 导入页已有 DOI 操作的基础页面/i18n/command parity 验证通过；3 files / 10 tests passed。
- 命令: `pnpm test src/pages/import/importJobs.test.ts`; `timeout 60 cargo test import_pdf --lib`; `pnpm test src/pages/import`
- 结果: M1 导入任务列表失败态测试通过 11 tests；import_pdf Rust targeted 2 passed；import 前端目录测试 2 files / 25 tests passed。
- 命令: `pnpm exec playwright test e2e/app-smoke.spec.ts -g "opens an existing paper"`; `pnpm test src/pages/pageSmoke.test.tsx src/lib/tauriCommandParity.test.ts`
- 结果: 已新增已有 DOI 跳转 e2e 用例，但 Playwright Chromium 未安装导致 e2e 未执行；SSR page smoke + command parity 2 files / 8 tests passed。
- 命令: `pnpm test src/pages/reader/readerState.test.ts`; `pnpm test src/pages/reader/pdfTextCache.test.ts`
- 结果: M2 高亮跳转和 PDF text cache invalidate targeted 测试通过；readerState 3 tests passed；pdfTextCache 2 tests passed。
- 命令: `pnpm test src/pages/reader/TranslatedMarkdownPane.test.tsx src/pages/reader/readerLayout.test.ts`
- 结果: M2 母语阅读重新翻译成功态和窄屏布局 guard 通过；2 files / 4 tests passed。
- 命令: `pnpm test src/pages/reader src/pages/pageSmoke.test.tsx`; `pnpm typecheck`
- 结果: M2 reader/pageSmoke 自动验证通过 8 files / 21 tests passed；TypeScript typecheck 通过。
- 命令: `timeout 60 cargo test estimate --lib`; `pnpm test src/pages/reader/TranslatedMarkdownPane.test.tsx src/i18n/dict.test.ts src/lib/tauriCommandParity.test.ts`
- 结果: M3 全文翻译 chunk 估算和母语阅读空状态估算展示通过；Rust estimate 2 passed；前端 3 files / 8 tests passed。
- 命令: `timeout 60 cargo test markdown_translation_errors_on_length_finish_reason --lib`
- 结果: M3 finish_reason=length 单元测试通过；1 passed。
- 命令: `pnpm test src/pages/settings/TaskAssignments.test.tsx src/i18n/dict.test.ts`; `pnpm test src/pages/reader/TranslatedMarkdownPane.test.tsx`; `timeout 60 cargo test ai --lib`; `pnpm test src/pages/settings src/pages/reader`
- 结果: M3 Settings 绑定 profile/model、AI 错误展示测试和自动验收通过；Rust AI 92 passed；settings/reader 前端 8 files / 17 tests passed。
- 命令: `timeout 60 cargo test fifty_paper_fixture --lib`
- 结果: M4 50 条本地测试论文 fixture 和标题/作者/摘要/笔记检索路径通过；2 passed。
- 命令: `pnpm test src/pages/library/libraryFilters.test.ts src/pages/library/LibraryFilterBar.test.tsx src/i18n/dict.test.ts`
- 结果: M4 Library 年份/标签/阅读状态组合过滤与 FilterBar 控件测试通过；3 files / 7 tests passed。
- 命令: `pnpm test src/components/SmartCollectionEditor.test.tsx src/components/smartCollectionRules.test.ts src/i18n/dict.test.ts`
- 结果: M4 智能集合非法规则 UI 和规则 helper 测试通过；3 files / 7 tests passed。
- 命令: `pnpm test src/pages/library/librarySelection.test.ts src/pages/library/libraryFilters.test.ts`
- 结果: M4 大列表选择状态 helper 和组合过滤回归测试通过；2 files / 4 tests passed。
- 命令: `pnpm test src/pages/library/LibraryEmptyState.test.tsx src/pages/library/LibraryFilterBar.test.tsx`
- 结果: M4 Library 空状态导入入口说明测试通过；2 files / 3 tests passed。
- 命令: `timeout 60 cargo test retrieval --lib`; `timeout 60 cargo test smart_collections --lib`; `pnpm test src/pages/library`; `pnpm typecheck`
- 结果: M4 自动验收通过；retrieval 15 passed；smart_collections 4 passed；library 前端 6 files / 11 tests passed；typecheck 通过。
- 命令: `pnpm test src/pages/reader/NotesPane.test.tsx`
- 结果: M5 笔记保存失败重试 UI 测试通过；1 passed。

### 2026-06-19 周记录

完成:

- [x] M7 生成草稿前显示来源论文数量。
- [x] M7 导出 survey Markdown。
- [x] M8 图谱节点和边类型统一。
- [x] M8 节点详情抽屉、手动关系写入、删除确认。
- [x] M8 Compare 差异表。
- [x] M9 SyncPanel 当前配置/最后结果、preview、备份提示、WebDAV 错误和同步日志。

验证:

- 命令: `pnpm test src/pages/topic/topicSurveyState.test.ts src/pages/topic/surveyMarkdown.test.ts src/pages/topic/SubareaCard.test.tsx src/i18n/dict.test.ts`; `pnpm test src/pages/topic`; `pnpm typecheck`; `timeout 60 cargo test topic_survey --lib`; `timeout 60 cargo test topic_survey_retrieval --lib`
- 结果: M7 Topic 前端 targeted 4 files / 11 tests passed；topic 目录 5 files / 12 tests passed；typecheck 通过；topic_survey Rust 28 passed；topic_survey_retrieval Rust 11 passed。
- 命令: `pnpm test src/pages/graph src/pages/ComparePage* src/i18n/dict.test.ts`; `pnpm typecheck`; `timeout 60 cargo test paper_links --lib`; `timeout 60 cargo test concepts --lib`
- 结果: M8 Graph/Compare 前端 4 files / 9 tests passed；typecheck 通过；paper_links Rust 2 passed；concepts Rust 命令通过，当前匹配 0 tests。
- 命令: `pnpm test src/pages/settings/SyncPanel* src/i18n/dict.test.ts`; `pnpm typecheck`; `timeout 60 cargo test library_sync --lib`
- 结果: M9 SyncPanel/i18n 2 files / 6 tests passed；typecheck 通过；library_sync Rust 29 passed。

下周:

- [ ] M7 用一个真实主题完整跑一次，不要求联网部分在 CI 中执行。
- [ ] M8 手动加载 500 节点图谱，交互不冻结 5 秒以上。
- [ ] M9 用临时目录完成一次 push 和 pull。

风险:

- 真实主题流程仍依赖本机网络和可用 LLM 配置，尚未做人工端到端验证。
- M8 500 节点性能仍需人工或浏览器环境验证。
- M9 完整成功路径仍需本地 WebDAV 服务或真实临时远端。
- 命令: `pnpm test src/pages/reader/noteSectionState.test.ts`
- 结果: M5 阅读卡片空值和恢复状态测试通过；3 tests passed。
- 命令: `timeout 60 cargo test renders_readable_paper_metadata_section --lib`
- 结果: M5 Markdown 导出 paper metadata 测试通过；1 passed。
- 命令: `pnpm test src/components/ExportCitationsDialog.test.ts`; `timeout 60 cargo test citations --lib`
- 结果: M5 引用导出格式测试通过；前端 1 passed；后端 citations 6 passed。
- 命令: `timeout 60 cargo test outline_reuses_reading_card_notes --lib`
- 结果: M5 项目写作页复用阅读卡片 renderer 测试通过；1 passed。
- 命令: `pnpm test src/pages/projects/ProjectWritingPanel.test.tsx`; `timeout 60 cargo test notes --lib`; `timeout 60 cargo test export --lib`; `pnpm test src/pages/reader src/components/ExportCitationsDialog.test.ts src/pages/projects/ProjectWritingPanel.test.tsx`
- 结果: M5 写作页错误展示与自动验收通过；ProjectWritingPanel 1 passed；notes 4 passed；export 8 passed；前端 reader/export/writing 11 files / 22 tests passed。

下周:

- [x] 从 M0 开始做当前工作区基线冻结。
- [x] 跑 M0 全量验收命令并处理失败。

风险:

- 当前工作区已有多处未提交代码改动和未跟踪文件；做 M0 前先用 `git status --short` 和 `git diff --stat` 确认每个文件归属。
