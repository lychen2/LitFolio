# LitFolio

[English](./README.md) · [中文](./README.zh-CN.md)

本地优先的科研文献管理桌面应用:DOI / arXiv / BibTeX / 本地 PDF 一键入库;
PDF 阅读器内做高亮和 Markdown 笔记;对整个文献库提问;订阅期刊 RSS 看最新文章。
所有 AI 流程接任何 OpenAI 兼容接口,任务级别绑定模型。

## 功能

- **文献库**:支持 DOI / arXiv ID / BibTeX / 本地 PDF / Semantic Scholar 搜索
  入库;每篇文献都带 PDF;一篇可同时归入多个分类文件夹,也可打标签筛选。
- **阅读器**:PDF.js + react-pdf-highlighter,三栏布局(高亮列表 · PDF · 笔记),
  支持深色模式。
- **AI 流程**:速读(一句话 + 关键发现)、四段深读(问题 / 方法 / 对比 / 局限)、
  标题摘要翻译。每个任务可绑定不同的 LLM 配置和模型。
- **主题发现**:LLM 把(可能是中文的)主题改写成精确英文关键词,多路并发跑
  Semantic Scholar,合并去重 + 引用量排序;可生成包含子领域、关键 PI、必读
  文献的综述骨架。
- **文献库问答 (RAG)**:LLM 把你的问题改写成 2-4 个英文检索词,在 SQLite FTS5
  上多路召回,按命中数 + 年份排序;把命中片段(含你的高亮)交给模型,带 `[N]`
  引用回答。
- **RSS 订阅**:订阅 arXiv / Optica / Nature / ACS Photonics / ScienceDirect
  等期刊的 RSS / Atom feed,条件 GET 刷新(304 直接跳过),点条目展开详情抽屉,
  一键翻译标题和摘要。"入库" 会跳到导入页并预填来源链接。
- **本地优先**:所有数据放在 `~/Litera-Library/`。

## 技术栈

Tauri 2 · React 18 · TypeScript · SQLite (sqlx) · feed-rs · react-pdf-highlighter

## 快速开始

```bash
pnpm install
pnpm tauri dev
```

首次启动会创建 `~/Litera-Library/`,并默认订阅一批光学 / 光子学期刊 RSS。
在设置 → 模型配置里填好 LLM Profile 之后再使用 AI 功能。

## 目录结构

```
src/                  React 前端
  components/         通用 UI (Shell, …)
  pages/              路由页面 (library / reader / import /
                      browse / feeds / topic / ask / settings)
  pages/<feature>/    各页面子组件
  lib/                API 客户端 + 工具
  styles/             Tailwind 全局样式

src-tauri/            Rust 后端
  src/commands/       Tauri IPC 命令
  src/storage/        SQLite 层 + sqlx 迁移
  src/ingest/         导入管线 (DOI / arXiv / BibTeX / PDF / S2 / RSS)
  src/ai/             LLM 客户端、Profile、速读 / 翻译 /
                      检索词改写 / RAG / 主题综述
  migrations/         版本化的 SQL 迁移
```

## 许可

GPL-3.0-or-later,详见 [`LICENSE`](./LICENSE)。
