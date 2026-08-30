# Changelog

## v0.4.1 (2026-08-30)

### 产品定位调整 / Product Repositioning

- LitFolio 聚焦**热榜追踪 + 论文阅读**；长期知识存储交给 Zotero（推送/链接），不再内置项目、证据看板、多论文对比等知识库功能。
- 全量移除 research-workbench 插件及其承载的科研项目（projects）、证据看板（evidence board）、多论文对比（comparisons）能力，包括 library-ask / knowledge-graph 插件中的相关消费端。
- 全新安装默认只启用 `discovery-feeds` + `candidate-inbox`（热榜追踪闭环），其余插件默认关闭。
- 项目/对比相关 API、类型、schema 解析器、mock 与页面（ProjectsPage、ComparePage、项目周报/写作面板）全部清理；已发布的数据库迁移保持原样（无害保留）。

### 新功能 / Added

- **界面字体与字号设置**：新增四款界面字体（柔和圆体 / 系统默认 / 优雅衬线 / 极客等宽）与四档字号（14/16/18/20px），在设置中即时预览切换。
- **Ollama 模型拉取**：LLM 配置新增「下载/拉取」按钮，通过本地 Ollama `/api/pull` 下载模型权重；云端服务会给出明确的不支持提示。
- **更新品牌视觉**：新 Logo / 应用图标，侧边栏样式与交互动效打磨。

### 改进 / Changed

- 翻译任务强制关闭思维链输出，并过滤 `<think>` 标签，修复推理模型翻译时正文混入推理内容的问题。
- 用户手册（中/英文）移除已删除的多论文对比章节，重建 PDF。
- 设置 → 插件面板视觉优化。

### 仓库 / Repository

- 新增 README。
- 将 agent 规划文件（AGENTS.md、ROLE.md、todo.md、.snow/）移出版本库并加入 .gitignore。

### 修复 / Fixed

- 修复后端 `LibraryPaths` 汇总中重复读取 Markdown 文档的问题。

## v0.4.0 (2026-08-29)

### Added

- **Zotero 推送**：把论文元数据与阅读内容推送到本地 Zotero 桌面端（Settings 同步 tab 配置；文献库批量推送 + 详情抽屉单篇推送，幂等可强制重推）。
- Plugin host 基础、profile 裁剪边界与旧库转换地基（v0.4.0 系列主体）。

### Fixed

- Zotero 推送失败时给出可操作的本地化错误提示（未配置 / 未启动 Zotero 指向设置入口）。
