/// Tiny i18n: Chinese / English string maps + a useT hook. Keep it minimal —
/// the project is Chinese-first, so missing keys silently fall back to the zh
/// entry. Coverage is intentionally focused on the most visible chrome (nav,
/// page headers, common buttons, empty states) rather than every leaf string.
export type Lang = "zh" | "en";

export const zh = {
  // Nav
  "nav.library": "文献库",
  "nav.import": "导入",
  "nav.browse": "arXiv 浏览",
  "nav.feeds": "RSS 订阅",
  "nav.topic": "主题发现",
  "nav.ask": "提问",
  "nav.settings": "设置",
  "shell.footer": "v0.1.0 · local-first",
  // Common
  "common.open": "打开",
  "common.translate": "翻译",
  "common.import": "入库",
  "common.read": "已读",
  "common.unread": "未读",
  "common.create": "新建",
  "common.delete": "删除",
  "common.loading": "加载中…",
  "common.search": "搜索",
  "common.cancel": "取消",
  "common.save": "保存",
  "common.refresh": "刷新",
  "common.refreshAll": "刷新全部",
  "common.all": "全部",
  "common.retry": "重试",
  "common.untitled": "(无标题)",
  // Library
  "library.title": "文献库",
  "library.searchPlaceholder": "搜索 标题 / 作者 / 摘要 / 速读…",
  // Folders
  "folders.title": "分类文件夹",
  "folders.all": "全部文献",
  "folders.emptyTitle": "还没有分类文件夹。",
  "folders.emptyHint": "建一个就能把文献分到不同主题里(一篇可同时归入多个文件夹)。",
  "folders.namePlaceholder": "例:超快激光",
  "folders.createRoot": "新建根分类",
  "folders.loadFailed": "分类加载失败",
  // Feeds
  "feeds.title": "RSS 订阅",
  "feeds.subtitle":
    "订阅 arXiv / 期刊 / 实验室博客的 RSS 或 Atom feed,新文章直接列在右侧。点 📥 入库 会跳转到「导入」页,绑定 PDF 后才入库。",
  "feeds.sourcesTitle": "订阅源",
  "feeds.allSubs": "全部订阅",
  "feeds.noSubs": "还没有订阅。",
  "feeds.placeholder": "https://… (RSS / Atom)",
  "feeds.subscribe": "订阅",
  "feeds.unsubscribe": "取消订阅",
  "feeds.onlyUnread": "只看未读",
  "feeds.refreshThis": "刷新此订阅",
  "feeds.markAllRead": "全部标为已读",
  "feeds.upToDate": "已是最新",
  "feeds.lastError": "上次出错",
  "feeds.empty":
    "没有可显示的条目。订阅一个 RSS,然后点 🔄 刷新。",
  "feeds.imported": "✓ 已入库",
  "feeds.openExternal": "在浏览器打开",
  "feeds.importGo": "跳转到 📥 导入,绑定 PDF 后入库",
  "feeds.viewMeta": "查看元数据 / 摘要",
  // Ask
  "ask.title": "提问",
  "ask.subtitle":
    "先让模型把问题改写成精确检索词,在本地文献库 BM25 多路召回,再带着片段生成有引用的回答。",
  "ask.placeholder":
    "例如:这些论文里哪几篇讨论了 chirped pulse amplification 的局限?",
  "ask.submit": "提问",
  "ask.searching": "正在让模型改写检索词、召回相关论文并生成回答…",
  "ask.emptyHint1": "输入问题后会先让 LLM 把问题改写成 2-4 个英文检索词,",
  "ask.emptyHint2": "在 SQLite FTS5 多路召回并按命中数 + 年份排序,",
  "ask.emptyHint3": "再把命中的 TL;DR / 摘要 / 高亮交给模型回答并标注 [N] 引用。",
  "ask.terms": "检索词",
  "ask.sources": "来源",
  // Import
  "import.title": "导入",
  "import.subtitle": "先取元数据,再绑定 PDF。每篇文献必须有 PDF。",
  "import.tab.arxivDoi": "arXiv 或 DOI",
  "import.tab.pdf": "PDF 文件",
  "import.tab.search": "搜索",
  "import.fromFeed": "来自 RSS 订阅",
  "import.source": "来源",
  "import.openOrigin": "打开原文",
  // Topic
  "topic.title": "主题发现",
  "topic.tab.search": "搜索召回",
  "topic.tab.survey": "综述生成",
  // Browse
  "browse.title": "arXiv 浏览",
  // Settings
  "settings.title": "设置",
  // Language switcher
  "lang.label": "Language",
  "lang.zh": "中文",
  "lang.en": "English",
};

export type TKey = keyof typeof zh;

export const en: Record<TKey, string> = {
  "nav.library": "Library",
  "nav.import": "Import",
  "nav.browse": "Browse arXiv",
  "nav.feeds": "RSS",
  "nav.topic": "Discover",
  "nav.ask": "Ask",
  "nav.settings": "Settings",
  "shell.footer": "v0.1.0 · local-first",

  "common.open": "Open",
  "common.translate": "Translate",
  "common.import": "Add",
  "common.read": "Read",
  "common.unread": "Unread",
  "common.create": "New",
  "common.delete": "Delete",
  "common.loading": "Loading…",
  "common.search": "Search",
  "common.cancel": "Cancel",
  "common.save": "Save",
  "common.refresh": "Refresh",
  "common.refreshAll": "Refresh all",
  "common.all": "All",
  "common.retry": "Retry",
  "common.untitled": "(untitled)",

  "library.title": "Library",
  "library.searchPlaceholder": "Search title / author / abstract / TL;DR…",

  "folders.title": "Folders",
  "folders.all": "All papers",
  "folders.emptyTitle": "No folders yet.",
  "folders.emptyHint":
    "Create one to group papers by topic (a paper can live in many folders).",
  "folders.namePlaceholder": "e.g. Ultrafast lasers",
  "folders.createRoot": "New root folder",
  "folders.loadFailed": "Failed to load folders",

  "feeds.title": "RSS Feeds",
  "feeds.subtitle":
    "Subscribe to RSS / Atom feeds from arXiv, journals or lab blogs. Click 📥 Add to jump to Import where you bind the PDF.",
  "feeds.sourcesTitle": "Sources",
  "feeds.allSubs": "All subscriptions",
  "feeds.noSubs": "No subscriptions yet.",
  "feeds.placeholder": "https://… (RSS / Atom)",
  "feeds.subscribe": "Subscribe",
  "feeds.unsubscribe": "Unsubscribe",
  "feeds.onlyUnread": "Unread only",
  "feeds.refreshThis": "Refresh this feed",
  "feeds.markAllRead": "Mark all as read",
  "feeds.upToDate": "Already up to date",
  "feeds.lastError": "Last error",
  "feeds.empty": "Nothing to show. Add a feed and hit 🔄 refresh.",
  "feeds.imported": "✓ Added",
  "feeds.openExternal": "Open in browser",
  "feeds.importGo": "Go to Import to bind a PDF",
  "feeds.viewMeta": "View metadata / abstract",

  "ask.title": "Ask",
  "ask.subtitle":
    "The model rewrites your question into precise search terms, fans out BM25 retrieval across your local library, and answers with cited snippets.",
  "ask.placeholder":
    "e.g. Which of these papers discuss limitations of chirped pulse amplification?",
  "ask.submit": "Ask",
  "ask.searching":
    "Rewriting query, retrieving relevant papers, generating answer…",
  "ask.emptyHint1": "Your question is first rewritten into 2-4 English search terms.",
  "ask.emptyHint2": "Multi-path FTS5 retrieval, ranked by term-match count + year.",
  "ask.emptyHint3":
    "Matched TL;DR / abstract / highlights are handed to the model with [N] citations.",
  "ask.terms": "Search terms",
  "ask.sources": "Sources",

  "import.title": "Import",
  "import.subtitle": "Fetch metadata, then bind a PDF. Every paper needs a PDF.",
  "import.tab.arxivDoi": "arXiv or DOI",
  "import.tab.pdf": "PDF file",
  "import.tab.search": "Search",
  "import.fromFeed": "From RSS subscription",
  "import.source": "Source",
  "import.openOrigin": "Open source page",

  "topic.title": "Discover",
  "topic.tab.search": "Search results",
  "topic.tab.survey": "Survey",

  "browse.title": "Browse arXiv",

  "settings.title": "Settings",

  "lang.label": "Language",
  "lang.zh": "中文",
  "lang.en": "English",
};

export const dict: Record<Lang, Record<TKey, string>> = { zh, en };

/// LLM-side language name for `LlmConfig.output_language` + the `targetLang`
/// argument on translation IPCs. Backend prompts ask the LLM in English to
/// "reply in <name>", so these strings need to be the names the model
/// recognises (full English words, not locale codes).
export function llmLanguageNameFor(lang: Lang): string {
  return lang === "en" ? "English" : "Chinese";
}
