/* LitFolio 宿主桥（仅在 EASYREAD_HOST=litfolio 时由后端注入到每个页面）。
 * 三件事：
 *   1. 跨页导航（阅读页、文献库首页、设置、问 AI）交给宿主路由，页面自己不再整页跳转；
 *   2. 文献库写入成功后通知宿主，让宿主按需重读 /api/host/catalog 补自己的索引；
 *   3. 接收宿主自己写入（例如系统拖放导入）后的通知，重读当前页面列表。
 * 消息不带 loopback token，也不带论文内容。宿主负责校验
 * event.origin 与 event.source。普通模式下这个文件不会被加载，页面行为保持原样。 */
(() => {
  "use strict";
  if (window.__litfolioHostBridge) return;
  window.__litfolioHostBridge = true;

  const SOURCE = "litfolio-easyread";
  const parent = window.parent && window.parent !== window ? window.parent : null;
  if (!parent) return; // 独立打开的页面没有宿主可通知

  // Tauri 的 iframe 设了 no-referrer，多数情况下拿不到来源；自定义协议的 origin 又是 "null"，
  // 不能当 targetOrigin 用。只有拿到真正可投递的 http(s) origin 才限定投递范围。
  let target = "*";
  try {
    const origin = document.referrer ? new URL(document.referrer).origin : "";
    if (/^https?:\/\//.test(origin)) target = origin;
  } catch (_) { /* referrer 不是合法 URL 时退回通配，宿主自己校验 event.origin */ }

  const emit = (message) => {
    try { parent.postMessage(Object.assign({ source: SOURCE }, message), target); } catch (_) { /* 宿主已关闭 */ }
  };

  /* 宿主主题是唯一来源；PR.applyTheme 仍可被上游排版/偏好恢复调用，但不再改配色。 */
  const root = document.documentElement;
  const PR = window.PR;
  PR.applyTheme = () => {};
  PR.logo = () => "";
  const translate = PR.t;
  PR.t = (...args) => translate(...args).replace(/EasyRead/g, "LitFolio");
  document.querySelectorAll("#backBtn .mark, .ch-empty svg.hero, .welcome svg.hero").forEach((node) => node.remove());
  const updateTitle = () => {
    if (document.title.includes("EasyRead")) document.title = document.title.replace(/EasyRead/g, "LitFolio");
  };
  updateTitle();
  new MutationObserver(updateTitle).observe(document.querySelector("title"), { childList: true, subtree: true, characterData: true });
  if (PR.openHelp) {
    const openHelp = PR.openHelp;
    PR.openHelp = (...args) => {
      openHelp(...args);
      const heading = document.querySelector("#textDlg .help-head h2");
      if (heading) heading.textContent = "LitFolio";
    };
  }

  /* ---------- 导航 ---------- */
  const READ = /^\/read\/[A-Za-z0-9_-]{1,64}$/;
  const route = (pathname) =>
    pathname === "/" || pathname === "/settings" || pathname === "/ask" || READ.test(pathname) ? pathname : null;
  const navigate = (path) => emit({ type: "navigate", path });
  const ID = /^[A-Za-z0-9_-]{4,64}$/;
  const lib = PR.lib;
  const readerId = READ.test(location.pathname) ? location.pathname.slice(6) : null;
  const action = (name, paperIds, text) => emit({ type: "action", action: name, paperIds, ...(text ? { text } : {}) });
  const openReader = (id) => {
    if (!ID.test(id)) return;
    if (lib?.byId(id)?.source_type === "host-reference") action("details", [id]);
    else navigate("/read/" + id);
  };

  // 页内锚点（#b-xxx）、新标签页、下载仍由浏览器处理，只接管真正的跨页跳转。
  document.addEventListener("click", (event) => {
    if (event.defaultPrevented || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const anchor = event.target && event.target.closest ? event.target.closest("a[href]") : null;
    if (!anchor || (anchor.target && anchor.target !== "_self") || anchor.hasAttribute("download")) return;
    let url;
    try { url = new URL(anchor.getAttribute("href"), location.href); } catch (_) { return; }
    if (url.origin !== location.origin || url.pathname === location.pathname) return;
    const path = route(url.pathname);
    if (!path) return;
    event.preventDefault();
    if (READ.test(path)) openReader(path.slice(6));
    else navigate(path);
  }, true);

  // 文献库的双击、回车等入口直接设 location：改成只上报。
  if (lib) lib.openReader = openReader;

  document.addEventListener("click", (event) => {
    const hit = event.target && event.target.closest ? event.target.closest("#libraryAskBtn") : null;
    if (!hit) return;
    event.preventDefault();
    event.stopImmediatePropagation(); // 页面自己的全库问答对话框不再打开
    navigate("/ask");
  }, true);

  const label = (zh, en) => PR.lang === "en" ? en : zh;
  const single = [
    ["details", "论文详情", "Paper details", "book"],
    ["tldr", "速读摘要", "TL;DR", "sparkle"],
    ["quick-read", "深读", "Deep Read", "book"],
    ["translate-metadata", "翻译标题与摘要", "Translate title and abstract", "en"],
    ["similar", "相似论文", "Similar papers", "search"],
  ];
  const batch = [
    ["review", "文献综述", "Literature review", "note"],
    ["export", "引用导出", "Export citations", "copy"],
    ["zotero", "推送到 Zotero", "Push to Zotero"],
    ["queue-add", "加入阅读队列", "Add to reading queue", "plus"],
  ];
  function toolsButton(entries, paperIds) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "btn line litfolio-tools";
    button.setAttribute("aria-haspopup", "menu");
    button.setAttribute("aria-label", label("LitFolio 工具", "LitFolio tools"));
    button.innerHTML = PR.icon("sparkle", "sm");
    const text = document.createElement("span");
    text.textContent = button.getAttribute("aria-label");
    button.append(text);
    button.onclick = () => {
      const ids = paperIds();
      PR.menu(button, entries.map(([name, zh, en, icon]) => ({
        label: label(zh, en), icon, fn: () => action(name, ids),
      })));
    };
    return button;
  }

  let filter = null;
  if (lib) {
    root.dataset.litfolioPage = "library";
    document.querySelector(".topbar > .brand")?.remove();
    const search = document.querySelector("#q");
    search.setAttribute("aria-label", search.placeholder);
    const side = document.querySelector("#side");
    const library = document.querySelector(".lib");
    const browse = document.createElement("button");
    browse.type = "button";
    browse.className = "btn line litfolio-browse";
    browse.textContent = label("分类", "Browse");
    browse.setAttribute("aria-controls", "side");
    browse.setAttribute("aria-expanded", "false");
    side.setAttribute("aria-label", browse.textContent);
    side.tabIndex = -1;
    search.closest(".search").before(browse);
    const closeBrowse = (focus) => {
      if (!library.classList.contains("litfolio-browsing")) return;
      library.classList.remove("litfolio-browsing");
      browse.setAttribute("aria-expanded", "false");
      if (focus) browse.focus();
    };
    browse.onclick = () => {
      if (library.classList.contains("litfolio-browsing")) return closeBrowse(true);
      library.classList.add("litfolio-browsing");
      browse.setAttribute("aria-expanded", "true");
      side.focus();
    };
    // Keep the global list shortcuts from opening the selected paper when Enter activates Browse or a category.
    for (const control of [browse, side]) {
      control.addEventListener("keydown", (event) => {
        if (event.key === "Enter") event.stopPropagation();
      });
    }
    document.addEventListener("pointerdown", (event) => {
      if (!side.contains(event.target) && !browse.contains(event.target) && !event.target.closest(".menu")) closeBrowse(false);
    });
    document.addEventListener("keydown", (event) => {
      if (event.key !== "Escape" || !library.classList.contains("litfolio-browsing")) return;
      if (event.target.closest("input, textarea, select, [contenteditable], .menu, dialog")) return;
      event.preventDefault();
      event.stopPropagation();
      closeBrowse(true);
    }, true);
    side.addEventListener("click", (event) => {
      if (!event.target.closest("[data-more], [data-fold]") && event.target.closest("[data-view], [data-cat], a[href]")) closeBrowse(true);
    });
    matchMedia("(max-width: 1100px)").addEventListener("change", () => closeBrowse(false));

    // The list renderer and upstream selection logic share these view predicates.
    for (const view of lib.VIEWS) {
      const matchesView = view[3];
      view[3] = (item) => (!filter || filter.has(item.id)) && matchesView(item);
    }
    const renderDetail = PR.renderDetail;
    PR.renderDetail = function () {
      renderDetail.apply(this, arguments);
      const item = lib.byId(lib.selected);
      const box = document.querySelector("#detail .detail-inner");
      if (!item || !box || box.querySelector(".litfolio-tools")) return;
      if (item.source_type === "host-reference") {
        box.querySelectorAll(".cover a[href^='/p/'], .jobbox, h4:has(+ .jobbox)").forEach((node) => node.remove());
        const read = box.querySelector(".cover a[href^='/read/']");
        if (read) read.textContent = label("打开论文详情", "Open paper details");
      }
      (box.querySelector(".cover .actions") || box).append(toolsButton([...single, ...batch], () => [item.id]));
    };
    const renderBatch = PR.renderBatch;
    PR.renderBatch = function () {
      renderBatch.apply(this, arguments);
      const bar = document.querySelector("#batchBar .batch-tools");
      if (!bar) return;
      const button = toolsButton(batch, () => [...lib.picked]);
      button.classList.add("sm");
      button.disabled = !lib.picked.size;
      bar.append(button);
    };
  } else if (readerId) {
    root.dataset.litfolioPage = "reader";
    // Keep IME confirmation and cancellation out of the reader shortcuts.
    window.addEventListener("keydown", (event) => {
      if ((event.isComposing || event.keyCode === 229) &&
          (event.key === "Enter" || event.key === "Escape") &&
          event.target.closest?.("textarea, input, [contenteditable]")) {
        event.stopPropagation();
      }
    }, true);
    document.querySelector("#bar [data-act='settings']").before(toolsButton([...single, ...batch], () => [readerId]));
    PR.translateSelection = ({ quote }) => {
      if (quote?.trim()) action("selection-translate", [readerId], quote);
    };
    PR.on("remote", (changed) => {
      if (changed.includes("paper")) emit({ type: "library-changed" });
    });
  }

  /* ---------- 文献库写入 ---------- */
  // 只列改变文献库可见状态（标题、状态、标签、笔记、收录/移动）的写入；
  // 翻译、问答、裁图只改单篇内部数据，宿主的索引不必重读。
  const MUTATION = [/^\/api\/p\/[^/]+\/(item|ops|delete)$/, /^\/api\/import(?:-url)?$/, /^\/api\/trash$/,
    /^\/api\/migrate\/(start|stop)$/, /^\/api\/library\/(move|cleanup)$/];
  const mutating = (method, url) => {
    if (method === "GET" || method === "HEAD") return false;
    let path;
    try { path = new URL(url, location.href).pathname; } catch (_) { return false; }
    return MUTATION.some((pattern) => pattern.test(path));
  };
  // 只报成功：失败的写入由页面自己提示，宿主的索引不必跟着变。
  const report = (response) => {
    if (response && response.ok) emit({ type: "library-changed" });
  };

  const fetch = window.fetch;
  if (typeof fetch === "function") {
    window.fetch = function (input, init) {
      const method = String((init && init.method) || (input && input.method) || "GET").toUpperCase();
      const url = typeof input === "string" ? input : input && input.url ? input.url : String(input);
      const promise = fetch.apply(this, arguments);
      if (mutating(method, url)) promise.then(report, () => {});
      return promise;
    };
  }

  const deletes = new Map();
  let deleteSequence = 0;
  if (lib) {
    const confirm = PR.confirm;
    PR.confirm = (options) => {
      if (options.ok !== PR.t("移到回收站")) return confirm(options);
      return confirm({ ...options, body: label(
        "论文会从文献库移除；挂接的库内 PDF 会被清除。请先保留需要的副本。",
        "Papers will be removed from the library. Linked PDFs stored in the library will be removed; keep a copy if needed.",
      ) });
    };
  }
  // 引用导入完成后回传实际 ID；宿主只为原始引用回写发现来源。
  const api = window.PR && window.PR.api;
  if (typeof api === "function") {
    window.PR.api = async function (path, opts) {
      const deletion = lib && opts?.method === "POST" && /^\/api\/p\/([A-Za-z0-9_-]{4,64})\/delete$/.exec(path);
      if (deletion) {
        const requestId = String(++deleteSequence);
        return new Promise((resolve, reject) => {
          const timer = setTimeout(() => {
            deletes.delete(requestId);
            reject(new Error(label("未收到删除结果，请刷新后检查。", "Deletion result unavailable. Refresh to check.")));
          }, 30000);
          deletes.set(requestId, { resolve, reject, timer });
          emit({ type: "delete", requestId, paperId: deletion[1] });
        });
      }
      const result = await api.apply(this, arguments);
      if (path === "/api/import-url" && opts && opts.body && typeof opts.body.ref === "string" && result && typeof result.id === "string") {
        emit({ type: "imported", paperId: result.id, reference: opts.body.ref });
      }
      return result;
    };
  }

  /* ---------- 宿主给出的打开方式 ---------- */
  window.addEventListener("load", () => {
    // /?litfolio=import&ref=<encoded>：替宿主打开导入框并填好引用（arXiv 号、DOI 或链接）。
    const url = new URL(location.href);
    if (url.searchParams.get("litfolio") !== "import") return;
    const ref = url.searchParams.get("ref") || "";
    url.searchParams.delete("litfolio");
    url.searchParams.delete("ref");
    try { history.replaceState(history.state, "", url.pathname + url.search + url.hash); } catch (_) { /* 刷新时会再开一次，不影响使用 */ }
    if (window.PR && typeof window.PR.openImport === "function") window.PR.openImport(ref);
  }, { once: true });

  /* ---------- 宿主界面语言 ---------- */
  // 语言以宿主为准，但文案仍由上游自己翻译：只写上游的界面语言偏好，再让页面按该语言重载，
  // 这里不维护第二份词表。写操作要页面令牌，阅读页在 PR.load 之后才有 PR.token，缺了就现取。
  const LOCALE_KEY = "litfolio-host-locale";
  // 宿主是语言的唯一来源：上游自己的切换按钮只写上游偏好再刷新本页，会让界面语言和宿主再次分叉。
  // 就地隐藏而不摘除元素，是因为 common/theme.js 还把 #langBtn 当作按钮插入锚点。
  const langBtn = document.querySelector("#langBtn");
  if (langBtn) {
    langBtn.style.display = "none";
    langBtn.setAttribute("aria-hidden", "true");
    langBtn.tabIndex = -1;
  }
  // 换语言后落地的第一个页面就是目标语言：清掉待办，之后再换还能再写一次。
  try {
    if (sessionStorage.getItem(LOCALE_KEY) === PR.lang) sessionStorage.removeItem(LOCALE_KEY);
  } catch (_) { /* 没有 sessionStorage 就只靠 PR.lang 判断 */ }
  const applyLocale = async (lang) => {
    if (lang !== "en" && lang !== "zh") return;
    if (PR.lang === lang) return;
    try {
      if (sessionStorage.getItem(LOCALE_KEY) === lang) return;  // 写了没生效就不再刷页
      sessionStorage.setItem(LOCALE_KEY, lang);
    } catch (_) { /* 存不下就只改这一次 */ }
    try {
      if (!PR.token) PR.token = (await PR.api("/api/library")).token;
      await PR.api("/api/prefs", { method: "POST", body: { ui: { lang } } });
      location.reload();
    } catch (_) {
      try { sessionStorage.removeItem(LOCALE_KEY); } catch (e) { /* 忽略 */ }
    }
  };

  /* ---------- 宿主发来的通知 ---------- */
  window.addEventListener("message", (event) => {
    if (target !== "*" && event.origin !== target) return;
    if (event.source !== parent) return;
    const data = event.data;
    if (!data || data.source !== "litfolio-host") return;
    if (data.type === "theme") {
      if (!["violet", "warm", "blueprint"].includes(data.theme) || !data.tokens || typeof data.tokens !== "object") return;
      const names = ["bg", "paper", "panel", "surface-2", "text", "mute", "text-subtle", "border", "border-strong", "accent", "accent-contrast", "accent2", "info", "success", "warn", "error", "focus", "ink", "font-sans", "shadow-md", "shadow-lg"];
      if (names.some((name) => typeof data.tokens[name] !== "string" || !data.tokens[name])) return;
      for (const name of names) root.style.setProperty("--litera-" + name, data.tokens[name]);
      root.dataset.theme = data.colorScheme === "light" ? "light" : "dark";
      root.dataset.litfolioTheme = data.theme;
      root.style.colorScheme = data.colorScheme === "light" ? "light" : "dark";
      return;
    }
    if (data.type === "locale") { applyLocale(data.lang); return; }
    if (data.type === "delete-result") {
      const pending = deletes.get(data.requestId);
      if (!pending) return;
      deletes.delete(data.requestId);
      clearTimeout(pending.timer);
      if (data.ok === true) pending.resolve({ ok: true });
      else pending.reject(new Error(label("删除失败，请查看应用提示。", "Deletion failed. See the app for details.")));
      return;
    }
    if (data.type === "library-filter" && lib) {
      const ids = data.paperIds;
      if (ids !== null && (!Array.isArray(ids) || !ids.every((id) => typeof id === "string" && ID.test(id)))) return;
      const next = ids === null ? null : new Set(ids);
      if (next === filter || (next && filter && next.size === filter.size && [...next].every((id) => filter.has(id)))) return;
      filter = next;
      if (lib.selected && filter && !filter.has(lib.selected)) lib.select(null);
      if (lib.picking) lib.endPick();
      else lib.render();
      return;
    }
    if (data.type === "library-changed" && lib) lib.load();
  });
})();
