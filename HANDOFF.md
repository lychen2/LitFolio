# AI Markdown 全文翻译阅读交接

日期: 2026-06-16
当前状态: 功能主体已写入，未做最终代码审查，未提交。

## 用户目标

用户想要: AI 把 PDF 转换得到的 `document.md` 做全文翻译，然后在阅读器里直接渲染出来，用于快速母语阅读。

这次实现的产品路径是:

1. 继续沿用现有 PDF 到 Markdown 流程。
2. 在 Reader 中增加“母语阅读”模式。
3. 首次点击时调用绑定的翻译模型，把全文 Markdown 分块翻译。
4. 译文保存为纸张目录下的独立 Markdown 文件。
5. 下次打开同一论文和同一目标语言时直接读取缓存。

## 关键现有事实

- PDF 正文 Markdown 已经存在于 `papers/<paper_id>/document.md`。
- 前端 `PdfPane` 会通过 `api.paperSetPdfText(paperId, text)` 把 pdf.js 提取结果推到后端。
- 后端入口是 `paper_set_pdf_text`，位于 `src-tauri/src/commands/reader_terms/mod.rs`。
- 现有标题和摘要翻译任务使用 `TaskKind::Translate`。
- 前端语言到 LLM 语言名的映射是 `llmLanguageNameFor(lang)`，中文界面对应 `Chinese`，英文界面对应 `English`。

## 本轮已改文件

### 后端

- `src-tauri/src/storage/paths.rs`
  - 新增 `translated_paper_markdown_file(paper_id, target_lang)`。
  - 新增 `read_translated_paper_markdown(paper_id, target_lang)`。
  - 新增 `write_translated_paper_markdown(paper_id, target_lang, markdown)`。
  - 新增目标语言 slug 逻辑，文件名形如 `document.translated.chinese.md` 或 `document.translated.simplified-chinese.md`。
  - 新增单元测试，覆盖读写往返和路径字符过滤。

- `src-tauri/src/ai/translate.rs`
  - 原文件从“标题摘要翻译”扩展为“论文翻译流程”。
  - 新增 `MarkdownTranslationResult`。
  - 新增 `translate_markdown_text(client, profile, title, markdown, target_lang)`。
  - Markdown 按空行分块，默认每块约 6000 字符。
  - 每块调用 `chat_complete`。
  - Prompt 要求保留 Markdown 结构、公式、引用、URL、模型名、数据集名，不摘要、不省略。
  - 新增 `strip_markdown_fence`，处理模型把 Markdown 包进代码块的情况。
  - 新增单元测试，覆盖分块和 fence 清理。

- `src-tauri/src/ai/mod.rs`
  - 导出 `translate_markdown_text`。

- `src-tauri/src/commands/reader_translate/mod.rs`
  - 新增返回结构 `ReaderMarkdownTranslationResult`。
  - 新增 Tauri 命令 `paper_translated_markdown_get`，读取缓存译文。
  - 新增 Tauri 命令 `paper_translate_markdown`，读取或提取正文 Markdown，调用全文翻译，写入缓存。
  - 翻译正文复用 `commands::summaries::load_or_extract_pdf_body`，没有 `document.md` 时会走已有后端 PDF 提取兜底。

- `src-tauri/src/commands/mod.rs`
  - 注册 `paper_translated_markdown_get`。
  - 注册 `paper_translate_markdown`。

### 前端

- `src/lib/types/ai.ts`
  - 新增 `ReaderMarkdownTranslationResult` 类型。

- `src/lib/api.ts`
  - 导出 `ReaderMarkdownTranslationResult` 类型。

- `src/lib/apiAiReader.ts`
  - 新增 `paperTranslatedMarkdownGet(paperId, targetLang?)`。
  - 新增 `paperTranslateMarkdown(paperId, targetLang?)`。

- `src/test/tauriMockCommands.ts`
  - 新增两个 mock Tauri 命令，保证 smoke 和 parity 测试能覆盖新命令。

- `src/pages/reader/TranslatedMarkdownPane.tsx`
  - 新增母语阅读 Pane。
  - 缓存查询 key 是 `['paperTranslatedMarkdown', paperId, targetLang]`。
  - 空状态展示“生成全文译文”。
  - 有缓存或新生成结果时，用 `MarkdownView` 渲染译文。
  - 提供重新翻译按钮。

- `src/pages/reader/TranslatedMarkdownPane.test.tsx`
  - 新增测试，覆盖中文 CTA 和查询 key。

- `src/pages/ReaderPage.tsx`
  - 新增 `mainMode: 'pdf' | 'native'`。
  - 顶部工具栏新增“母语阅读 / PDF 原文”切换。
  - 主阅读区在 PDF 和 `TranslatedMarkdownPane` 之间切换。
  - 窄屏 header 也有图标按钮切换。

- `src/i18n/zh.ts`
  - 新增 `reader.nativeRead*` 和 `reader.showPdf` 文案。

- `src/i18n/en.ts`
  - 新增同一批英文文案。

## 已验证命令和结果

已通过:

```bash
cargo test --lib
```

结果: 248 passed。

```bash
rustfmt --edition 2021 --check src/ai/mod.rs src/ai/translate.rs src/commands/reader_translate/mod.rs src/commands/mod.rs src/storage/paths.rs
```

结果: exit 0。

```bash
pnpm test src/pages/reader/TranslatedMarkdownPane.test.tsx
```

结果: 1 file passed, 2 tests passed。

```bash
pnpm typecheck
```

结果: exit 0。

```bash
pnpm lint
```

结果: exit 0。

```bash
pnpm test src/pages/reader/TranslatedMarkdownPane.test.tsx src/i18n/dict.test.ts src/lib/tauriCommandParity.test.ts src/pages/pageSmoke.test.tsx
```

结果: 4 files passed, 12 tests passed。

已通过:

```bash
cargo clippy --lib --tests -- -D warnings
```

结果: Finished `dev` profile in 0.65s.

## 下个会话从这里继续

### 1. 先检查工作区状态

不要直接提交。先确认当前改动是不是只包含上面列出的文件，以及用户是否还有并行改动。

建议先读这些文件的相关片段:

- `src-tauri/src/commands/feed_metadata/mod.rs:160-230`
- `src-tauri/src/ai/translate.rs`
- `src-tauri/src/commands/reader_translate/mod.rs:60-125`
- `src/pages/reader/TranslatedMarkdownPane.tsx`
- `src/pages/ReaderPage.tsx:196-310`

### 2. 做一次代码审查

需要重点审查:

- 全文翻译是否会对很长论文产生过多串行模型调用。
- 6000 字符分块是否过小或过大。
- 分块按空行切分会不会破坏 Markdown 表格和代码块。
- 缓存文件只按目标语言区分，没有按模型或源 Markdown hash 区分。现在是快速可用的方案，但源文档变化后不会自动失效。
- 前端 SSR 测试只覆盖空状态，不覆盖异步成功态。可以补一个更强的测试，直接预填 React Query cache 或 mock 成同步返回。

### 3. 建议补的后续改进

用户感知优先级从高到低:

1. 成功态里显示论文标题和当前目标语言。
2. 翻译进行中显示“正在翻译第 N 段 / 共 M 段”。这需要后端事件或任务系统，当前没有进度回传。
3. 加一个“只翻译当前页附近”模式，适合超长论文先读摘要、引言、结论。
4. 缓存加入源 Markdown 内容 hash，源文档更新后自动失效。
5. 翻译缓存加入模型名和生成时间元数据。当前只在返回值里给 `model`，文件本身没有 sidecar 元数据。

## 设计取舍

选择了直接在主阅读区切换 PDF 和译文，而不是放进右侧工作区。

原因:

- 用户目标是“快速母语阅读”，不是辅助解释。
- 右侧 Pane 太窄，不适合整篇论文阅读。
- 主阅读区保留原来的 PDF 高亮和选段翻译，不改变现有 workflow。

选择了缓存到 paper 目录，而不是新建数据库表。

原因:

- `document.md` 已经是文件缓存。
- 译文也是可渲染 Markdown，文件缓存更直观。
- 不需要迁移即可完成第一版。

## 风险清单

- 模型输出可能把整个 chunk 包成代码块，已做 fence 清理。
- 模型可能改坏 Markdown 表格，当前没有结构校验。
- 超长论文串行翻译可能慢，当前无进度条。
- `target_lang` slug 对纯中文语言名会退回 `target`，但当前 app 传的是 `Chinese` 和 `English`，所以常规路径安全。
- 源 Markdown 更新后，旧译文仍会显示。需要 hash 失效机制才算完整缓存。

## 不要忘记

- AGENTS.md 要求不要提交生成的计划、交接、发布说明类文档。这个 `HANDOFF.md` 是用户临时要求的交接文件，不要默认提交。
- Release 版本文件不要碰。
- 如果后续要推送，记得完整跑 `cargo fmt`、`cargo clippy`、`pnpm lint`、`pnpm typecheck`、相关测试。
