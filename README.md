# LitFolio

**LitFolio** 是一款本地优先的桌面研究文献工作台（Tauri 2 + React 18 + Rust），把 arXiv 浏览、PDF 阅读、高亮笔记、术语提取、多轮 RAG 对话、知识图谱、主题综述生成、引用管理装进一个应用。所有数据都落在你自己电脑上的 `~/Litera-Library/` 目录——核心功能无需 AI、无需联网即可使用。

> Local-first desktop literature workbench. arXiv browsing, PDF reading, highlights, term extraction, multi-turn RAG, knowledge graph, topic surveys — all on your own machine.

## 特性 / Features

- **文献库** — 论文列表、阅读状态、TL;DR 速读、深读四段式、翻译、文件夹、标签、BibTeX 自动生成与引用格式化、批量导出
- **阅读器** — 三栏 PDF 视图：高亮（语义标注颜色）、结构化笔记卡片、选段翻译、术语网络
- **导入** — arXiv/DOI 元数据、本地 PDF、Semantic Scholar 搜索，批量导入与去重
- **发现** — arXiv 分类浏览、RSS 订阅、主题综述生成、主题提醒监控（热榜追踪：`discovery-feeds` + `candidate-inbox` 插件默认启用）
- **库内提问（RAG）** — 多轮对话、多路 FTS5 召回、带引用编号的回答
- **知识图谱** — 论文引用/关系/概念网络，AI 自动发现关联
- **Zotero 推送** — 一键把论文元数据与阅读内容推送到本地 Zotero
- **主题定制** — 三套配色主题、四种界面字体、四档字号

## 架构

```
src/            React/TypeScript 前端
src-tauri/      Rust/Tauri 后端（SQLite、迁移、AI 调度）
plugins/        插件 manifest 声明（插件化能力：库内提问、发现订阅、候补收件箱、知识图谱等）
scripts/        构建 / profile 生成 / 截图脚本
docs/manual/    用户手册 LaTeX 源码与 PDF（中文 / English）
```

- 核心构建（`LITFOLIO_PROFILE=core`）物理排除可选插件的路由、命令与依赖。
- LLM 能力为可选增强：本地工作流（阅读、高亮、笔记、搜索）完全离线可用。

## 从源码构建 / Build from source

依赖：Node.js ≥ 20、pnpm、Rust（含 Tauri 2 系统依赖，见 [Tauri prerequisites](https://tauri.app/start/prerequisites/)）。

```bash
pnpm install
pnpm dev          # 开发模式
pnpm tauri:build  # 产出 core profile 的桌面安装包
```

## 用户手册 / User Manual

完整手册见 `docs/manual/manual.pdf`（中文）与 `docs/manual/manual-en.pdf`（English），涵盖从导入到深读、综述、同步的全流程。

## 许可 / License

[GPL-3.0-or-later](LICENSE)
