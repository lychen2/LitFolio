/* LitFolio 宿主桥（仅在 LITFOLIO_CORE_HOST=litfolio 时由后端注入到每个页面）。
 * 三件事：
 *   1. 跨页导航（阅读页、文献库首页、设置）交给宿主路由，页面自己不再整页跳转；
 *   2. 文献库写入成功后通知宿主，让宿主按需重读 /api/host/catalog 补自己的索引；
 *   3. 接收宿主自己写入（例如系统拖放导入）后的通知，重读当前页面列表。
 * 消息不带 loopback token，也不带论文内容。宿主负责校验
 * event.origin 与 event.source。普通模式下这个文件不会被加载，页面行为保持原样。 */
(() => {
  "use strict";
  if (window.__litfolioHostBridge) return;
  window.__litfolioHostBridge = true;

  const icons = document.createElement("script");
  icons.type = "module";
  icons.src = "/web/js/litfolio-icons.js";
  document.head.append(icons);

  const SOURCE = "litfolio-core";
  const parent = window.parent && window.parent !== window ? window.parent : null;
  if (!parent) return; // 独立打开的页面没有宿主可通知

  let parentOrigin;
  const emit = (message) => {
    // Only readiness is sent before the parent identifies its origin.
    if (parentOrigin === undefined && message.type !== "ready") return;
    try { parent.postMessage(Object.assign({ source: SOURCE }, message), parentOrigin ?? "*"); } catch (_) { /* 宿主已关闭 */ }
  };

  /* 宿主主题是唯一来源；PR.applyTheme 仍可被上游排版/偏好恢复调用，但不再改配色。 */
  const root = document.documentElement;
  const themeTokens = [
    "bg", "paper", "panel", "subnav", "surface-1", "surface-2", "line", "text", "mute", "text-subtle",
    "border", "border-strong", "accent", "accent-contrast", "accent2", "info", "success", "warn", "error",
    "focus", "ink", "annotation-bg", "annotation-ink", "font-sans", "shadow-md", "shadow-lg",
    "space-1", "space-2", "space-3", "space-4", "space-6", "control-sm", "control-md",
    "radius-sm", "radius-md", "radius-lg", "radius-xl", "radius-full", "hover", "selected", "scrim",
  ];
  const PR = window.PR;
  if (!PR?.applyTheme) return; // The upstream tab container has no reader or library API.
  PR.applyTheme = () => {};
  PR.logo = () => "";
  document.querySelectorAll("#backBtn .mark, .ch-empty svg.hero, .welcome svg.hero").forEach((node) => node.remove());
  document.getElementById("backBtn")?.classList.add("icon");

  /* ---------- 导航 ---------- */
  const READ = /^\/read\/[A-Za-z0-9_-]{1,64}$/;
  const route = (pathname) =>
    pathname === "/" || pathname === "/settings" || READ.test(pathname) ? pathname : null;
  const navigate = (path) => emit({ type: "navigate", path });
  const ID = /^[A-Za-z0-9_-]{4,64}$/;
  const lib = PR.lib;
  const readerId = READ.test(location.pathname) ? location.pathname.slice(6) : null;
  const action = (name, paperIds, text) => emit({ type: "action", action: name, paperIds, ...(text ? { text } : {}) });
  let composingEditor = null;
  window.addEventListener("compositionstart", (event) => { composingEditor = event.target; }, true);
  for (const type of ["compositionend", "focusout"]) {
    window.addEventListener(type, (event) => {
      if (event.target === composingEditor) composingEditor = null;
    }, true);
  }
  window.addEventListener("keydown", (event) => {
    if ((event.isComposing || event.keyCode === 229 || event.target === composingEditor) &&
        (event.key === "Enter" || event.key === "Escape") &&
        event.target.closest?.("textarea, input, [contenteditable]")) {
      event.stopPropagation();
    }
  }, true);
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

  const label = (zh, en) => PR.lang === "en" ? en : zh;

  function installSentenceLayout() {
    const menu = PR.$("#orderMenu");
    const settings = PR.$("#settings");
    const caret = PR.$("#bar [data-order-menu]");
    const sentenceLabel = label("逐句对照", "Sentence by sentence");
    const usesSentences = () => PR.prefs.biLayout === "sentences";
    const toggleLayout = () => {
      PR.prefs.biLayout = usesSentences() ? "paragraphs" : "sentences";
      PR.setPref("mode", "bi");
    };

    const prepare = PR.prepareReadingBlocks;
    PR.prepareReadingBlocks = (scope) => {
      prepare(scope);
      if (PR.prefs.mode !== "bi" || !usesSentences()) return;
      scope.querySelectorAll(".blk-para > .zh[data-key], .blk-list li > .zh[data-key]").forEach((translation) => {
        const original = PR.enOfZh(translation);
        const translatedSentences = Array.from(translation.children);
        const originalSentences = original && Array.from(original.children);
        if (translatedSentences.length < 2 || translatedSentences.length !== originalSentences?.length ||
            !translatedSentences.every((node, i) => node.matches(".snt[data-s]") &&
              originalSentences[i].matches(".snt[data-s]") && node.dataset.s === originalSentences[i].dataset.s)) return;

        // Keep each side and its text offsets intact for notes, selection and edits.
        const pair = PR.el("div", { class: "litfolio-sentence-pair" });
        const first = PR.originalFirst() ? original : translation;
        first.before(pair);
        pair.append(first, first === original ? translation : original);
        for (const [i, sentence] of translatedSentences.entries()) {
          sentence.style.setProperty("--litfolio-sentence-index", i);
          originalSentences[i].style.setProperty("--litfolio-sentence-index", i);
        }
      });
    };

    PR.mountSentenceEditor = (translation, bar, current, draft) => {
      if (PR.prefs.mode !== "bi" || !usesSentences() ||
          !translation.parentElement.classList.contains("litfolio-sentence-pair")) return null;
      const sentences = Array.from(translation.children);
      if (sentences.length < 2 || !sentences.every(node => node.matches(".snt[data-s]"))) return null;
      const ends = draft ? draft.sentence_ends : PR.sentenceEnds(translation.dataset.key, "zh", current);
      const text = draft?.zh ?? current;
      if (!PR.validSentenceEnds(ends, sentences.length, text.length)) return null;

      const prefixes = [];
      const inputs = sentences.map((sentence, i) => {
        const part = text.slice(i ? ends[i - 1] : 0, ends[i]);
        prefixes.push(part.match(/^\s*/)[0]);
        const input = PR.el("textarea", {
          class: "editor", spellcheck: "false",
          "aria-label": label(`编辑第 ${i + 1} 句译文`, `Edit translation for sentence ${i + 1}`),
        });
        input.value = part.slice(prefixes[i].length);
        sentence.replaceChildren(input);
        return input;
      });
      bar.style.setProperty("--litfolio-sentence-index", sentences.length);
      translation.append(bar);
      return { inputs, read() {
        let zh = "";
        const sentence_ends = [];
        for (const [i, input] of inputs.entries()) {
          zh += prefixes[i] + input.value;
          sentence_ends.push(zh.length);
        }
        return { zh, sentence_ends };
      } };
    };

    const viewSegHtml = PR.viewSegHtml;
    PR.viewSegHtml = () => viewSegHtml(true) + '<div class="order-line"><button type="button" ' +
      'class="btn sm line litfolio-sentence-toggle" aria-pressed="' + usesSentences() + '">' + PR.esc(sentenceLabel) + '</button></div>';

    function appendMenuOption() {
      const on = usesSentences();
      if (!menu.classList.contains("open") || menu.querySelector(".litfolio-sentence-toggle")) return;
      menu.append(PR.el("hr", { role: "separator" }), PR.el("button", {
        type: "button", class: "litfolio-sentence-toggle", role: "menuitemcheckbox", "aria-checked": String(on),
      }, '<span class="tick">' + (on ? PR.icon("check", "sm") : "") + "</span>" + PR.esc(sentenceLabel)));
    }

    const toggleOrderMenu = PR.toggleOrderMenu;
    PR.toggleOrderMenu = (force) => {
      const wasOpen = menu.classList.contains("open");
      const hadFocus = menu.contains(document.activeElement);
      toggleOrderMenu(force);
      if (menu.classList.contains("open")) {
        appendMenuOption();
        if (!wasOpen) (menu.querySelector('[aria-checked="true"]') || menu.querySelector("button"))?.focus();
      } else if (hadFocus) caret?.focus();
    };

    const applyReadingLanguage = PR.applyReadingLanguage;
    PR.applyReadingLanguage = () => {
      document.body.classList.toggle("litfolio-sentence-view", usesSentences());
      applyReadingLanguage();
      appendMenuOption();
    };

    menu.addEventListener("click", (event) => {
      if (!event.target.closest(".litfolio-sentence-toggle")) return;
      PR.toggleOrderMenu(false);
      toggleLayout();
    });
    settings.addEventListener("click", (event) => {
      if (!event.target.closest(".litfolio-sentence-toggle")) return;
      toggleLayout();
      settings.querySelector(".litfolio-sentence-toggle")?.focus();
    });
  }

  function hostButton(text, icon, onClick, className = "btn line") {
    const button = document.createElement("button");
    button.type = "button";
    button.className = className;
    button.innerHTML = PR.icon(icon, "sm");
    const caption = document.createElement("span");
    caption.textContent = text;
    button.append(caption);
    button.setAttribute("aria-label", text);
    button.title = text;
    button.onclick = onClick;
    return button;
  }
  const batch = [
    ["export", "引用导出", "Export citations", "copy"],
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

  let updateCollections;
  let updateReaderControls;
  if (PR.importState) {
    PR.importState.openReader = openReader;
    PR.openSettings = () => navigate("/settings");
    PR.openFolderImport = () => navigate("/import?tab=pdf");
    const form = PR.$("#importDlg .dialog");
    const openImport = PR.openImport;
    PR.openImport = (ref) => {
      openImport(ref);
      form.querySelector("h2").remove();
      form.querySelector(".or").remove();
      const pick = PR.$("#pick");
      const files = PR.el("div", { class: "litfolio-import-files" });
      files.append(pick, form.querySelector(".imp-bulk"));
      const sources = PR.el("div", { class: "litfolio-import-sources" });
      sources.append(files, PR.$("#arxivRef").closest(".field"));
      const options = PR.el("details", { class: "litfolio-import-options" });
      options.append(PR.el("summary", { text: label("导入设置", "Import settings") }), ...form.children);
      form.replaceChildren(sources, options);
      pick.setAttribute("role", "button");
      pick.tabIndex = 0;
      pick.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        pick.click();
      });
    };
    async function loadImport() {
      const status = PR.el("p", { role: "status", text: label("正在准备导入…", "Preparing import…") });
      form.replaceChildren(status);
      try {
        const data = await PR.api("/api/host/import-context");
        PR.token = data.token;
        PR.importState.engine = data.engine;
        PR.importState.engineLabel = data.engine_label;
        if (!PR.ls.get("core-import", null)) PR.ls.set("core-import", { after: "none" });
        PR.openImport();
      } catch (error) {
        status.setAttribute("role", "alert");
        status.textContent = error.message;
        form.append(hostButton(PR.t("重试"), "redo", loadImport, "btn"));
      }
    }
    loadImport();
  } else if (lib) {
    root.dataset.litfolioPage = "library";
    document.querySelector(".topbar > .brand")?.remove();
    document.getElementById("libraryAskBtn")?.remove();
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

    const collectionView = ["litfolio-collection", "", "folder", () => false];
    lib.VIEWS.push(collectionView);
    let choices = [];
    let activeKey = null;
    let collectionStatus = null;
    const manage = () => action("collections", []);
    const renderSide = PR.renderSide;
    PR.renderSide = () => {
      renderSide();
      if (side.querySelector(".side-input") === document.activeElement) return;
      const group = PR.el("section", { class: "litfolio-collections" });
      const heading = PR.el("h3");
      heading.textContent = label("文件夹", "Folders");
      const rows = PR.el("div", { class: "sgroup" });
      for (const choice of choices) {
        const row = hostButton(choice.title, "folder", () => {
          emit({ type: "library-collection", key: choice.key });
          closeBrowse(true);
        }, "srow");
        row.querySelector("span").className = "t";
        row.style.paddingInlineStart = `${8 + Math.min(choice.depth || 0, 8) * 12}px`;
        if (choice.key === activeKey && lib.view === collectionView[0] && !lib.tag) {
          row.classList.add("on");
          row.setAttribute("aria-current", "true");
        }
        rows.append(row);
      }
      rows.append(hostButton(label("管理文件夹", "Manage folders"), "gear", () => { closeBrowse(false); manage(); }, "srow"));
      group.append(heading, rows);
      side.querySelectorAll(".litfolio-collections").forEach((section) => section.remove());
      side.append(group);
    };
    side.addEventListener("click", (event) => {
      if (!activeKey || event.target.closest("[data-more], [data-fold]")) return;
      if (event.target.closest("[data-view], [data-cat]")) emit({ type: "library-collection", key: null });
    }, true);

    const renderLibrary = lib.render;
    lib.render = () => {
      renderLibrary();
      const list = PR.$("#list");
      if (lib.view === collectionView[0] && collectionStatus) {
        const status = PR.el("div", { class: "empty-state", role: collectionStatus === "failed" ? "alert" : "status" });
        if (collectionStatus === "failed") {
          status.append(label("无法加载分组。", "Could not load the collection."), " ",
            hostButton(PR.t("重试"), "redo", () => emit({ type: "library-collection-retry" }), "btn sm line"));
        } else status.textContent = label("正在加载分组…", "Loading collection…");
        PR.$("#count").textContent = "";
        list.replaceChildren(status);
      } else if (lib.loadStatus === "ready" && !lib.items.length && lib.view === "all" && !lib.tag && !lib.q.trim()) {
        const panel = PR.el("div", { class: "empty-state litfolio-empty" });
        const title = PR.el("h2");
        title.textContent = label("文献库为空", "Your library is empty");
        panel.append(title,
          hostButton(label("导入论文", "Import papers"), "pdf", () => navigate("/import")),
        );
        list.replaceChildren(panel);
      }
    };
    PR.openImport = (link) => {
      if (link) emit({ type: "navigate", path: "/import?tab=arxiv_doi", link });
      else navigate("/import");
    };

    updateCollections = (data) => {
      const { choices: nextChoices, activeKey: nextKey, paperIds: ids, pending, failed } = data;
      if (!Array.isArray(nextChoices) || !nextChoices.every((x) => x && typeof x.key === "string" && typeof x.title === "string")) return;
      if (ids !== null && (!Array.isArray(ids) || !ids.every((id) => typeof id === "string" && ID.test(id)))) return;
      const choice = nextChoices.find(({ key }) => key === nextKey);
      if (nextKey !== null && !choice) return;
      const changedView = activeKey !== nextKey;
      const membership = new Set(ids || []);
      const previousPredicate = collectionView[3];
      choices = nextChoices;
      activeKey = nextKey;
      collectionStatus = failed ? "failed" : pending ? "pending" : null;
      if (choice) {
        collectionView[1] = choice.title;
        collectionView[3] = (item) => membership.has(item.id);
        if (changedView) {
          lib.tag = null;
          lib.view = collectionView[0];
        }
        if (lib.view === collectionView[0] && lib.selected && !membership.has(lib.selected)) lib.select(null);
      } else if (lib.view === collectionView[0]) {
        lib.view = "all";
        lib.tag = null;
      }
      const changedMembership = lib.view === collectionView[0] && [...lib.picked].some((id) =>
        previousPredicate({ id }) && !membership.has(id));
      if (lib.picking && (changedView || changedMembership)) lib.endPick();
      else lib.render();
    };

    const renderDetail = PR.renderDetail;
    PR.renderDetail = function () {
      renderDetail.apply(this, arguments);
      const item = lib.byId(lib.selected);
      const box = document.querySelector("#detail .detail-inner");
      if (!item || !box) return;
      box.querySelectorAll(".litfolio-more-info").forEach((button) => button.remove());
      box.querySelectorAll(".kv [data-meta]").forEach((field) => {
        field.dataset.placeholder = label("点击填写", "Click to edit");
      });
      if (item.source_type === "host-reference") {
        box.querySelectorAll(".cover a[href^='/p/'], .jobbox, h4:has(+ .jobbox)").forEach((node) => node.remove());
        box.querySelector(".cover a[href^='/read/']")?.remove();
      }
      (box.querySelector(".cover .actions") || box).append(hostButton(
        label("更多信息与工具", "More information and tools"), "note", () => action("details", [item.id]), "btn line litfolio-more-info",
      ));
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
    installSentenceLayout();
    // WebKitGTK can report scrolled textarea coordinates in document space.
    // Give the desktop host a visible anchor in this frame's viewport instead.
    let noteCursorFrame = 0;
    function publishNoteCursor() {
      if (noteCursorFrame) return;
      noteCursorFrame = requestAnimationFrame(() => {
        noteCursorFrame = 0;
        const editor = document.activeElement;
        if (!editor?.matches("#margin .card textarea, .inline-notes .card textarea")) return;
        const rect = editor.getBoundingClientRect();
        const left = Math.max(0, rect.left);
        const top = Math.max(0, rect.top);
        const bottom = Math.min(innerHeight, rect.bottom);
        if (left >= Math.min(innerWidth, rect.right) || top >= bottom) return;
        emit({ type: "note-ime-anchor", x: left, y: top, height: bottom - top });
      });
    }
    for (const type of ["focusin", "compositionstart", "compositionupdate", "compositionend", "input", "keyup", "scroll", "resize"]) {
      window.addEventListener(type, publishNoteCursor, { capture: true, passive: true });
    }
    // Preserve the live textarea across responsive layout changes while the note is being edited.
    const renderMargin = PR.renderMargin;
    const marginWide = PR.marginWide;
    PR.marginWide = () => document.body.classList.contains("side-open")
      ? document.body.classList.contains("litfolio-dock-margin")
      : marginWide();
    PR.renderMargin = () => {
      const editor = document.activeElement;
      const card = editor?.closest("#margin .card[data-note], .inline-notes .card[data-note]");
      if (editor?.matches("textarea") && card && card.dataset.note === PR.editingNote) {
        PR.layoutMargin();
        return;
      }
      const body = document.body;
      // 52px gutters, a 44px gap and a 272px note column leave 400px for text.
      body.classList.toggle("litfolio-dock-margin", body.classList.contains("side-open") &&
        !body.classList.contains("no-margin") &&
        document.querySelector("#stage").clientWidth >= 820);
      renderMargin();
    };
    const settings = document.querySelector("#bar [data-act='settings']");
    const details = hostButton(label("论文详情", "Paper details"), "note", () => action("details", [readerId]), "btn line litfolio-reader-tool");
    const extras = hostButton(label("阅读工具", "Reading tools"), "sparkle", () => emit({ type: "reader-control", control: "extras" }), "btn line litfolio-reader-tool");
    const split = hostButton(label("分屏", "Split view"), "panel", () => emit({ type: "reader-control", control: "split" }), "btn line litfolio-reader-tool");
    const dock = document.querySelector("#bar [data-act='dock']");
    const dockLabel = label("PDF 与笔记", "PDF and notes");
    const dockText = dock.querySelector("span");
    if (dockText) dockText.textContent = dockLabel;
    dock.title = dockLabel;
    dock.setAttribute("aria-label", dockLabel);
    extras.hidden = split.hidden = true;
    settings.before(details, extras, split);
    let hasHighlights = false;
    updateReaderControls = ({ extrasOpen, canSplit, splitView, hasHighlights: available }) => {
      document.querySelector("#backBtn").toggleAttribute("hidden", splitView === true);
      hasHighlights = available === true;
      extras.hidden = false;
      extras.setAttribute("aria-pressed", String(extrasOpen));
      split.hidden = !canSplit;
    };
    const isShortcutEvent = (event) => !event.defaultPrevented && !event.isComposing && event.keyCode !== 229 && PR.keysOn &&
      !event.metaKey && !event.ctrlKey && !event.altKey &&
      !event.target.closest?.("input, textarea, select, [contenteditable], [role='dialog'], dialog");
    const forwardShortcut = (event, key) => {
      event.preventDefault();
      emit({ type: "reader-shortcut", key });
    };
    // Reserve plain J/K for saved LitFolio highlights when available. Shift+J/K
    // still reaches the upstream paragraph bindings and remapped keys keep priority.
    window.addEventListener("keydown", (event) => {
      if (!hasHighlights || event.shiftKey || !isShortcutEvent(event) || PR.hasPendingSelection()) return;
      const key = event.key.toLowerCase();
      if (key !== "j" && key !== "k") return;
      const binding = PR.keyAction(key);
      if (binding && binding !== (key === "j" ? "next" : "prev")) return;
      event.stopPropagation();
      forwardShortcut(event, key);
    }, true);
    // Selection digits remain upstream annotation shortcuts while a selection is active.
    window.addEventListener("keydown", (event) => {
      const key = event.key;
      if (isShortcutEvent(event) && (key === "1" || key === "2" || key === "3" || key === "?")) {
        forwardShortcut(event, key);
      }
    });
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
      return api.apply(this, arguments);
    };
  }

  /* ---------- 宿主界面语言 ---------- */
  // 语言以宿主为准，但文案仍由上游自己翻译：只写上游的界面语言偏好，再让页面按该语言重载，
  // 这里不维护第二份词表。写操作要页面令牌，阅读页在 PR.load 之后才有 PR.token，缺了就现取。
  // 宿主是语言的唯一来源：上游自己的切换按钮只写上游偏好再刷新本页，会让界面语言和宿主再次分叉。
  // 就地隐藏而不摘除元素，是因为 common/theme.js 还把 #langBtn 当作按钮插入锚点。
  const langBtn = document.querySelector("#langBtn");
  if (langBtn) {
    langBtn.style.display = "none";
    langBtn.setAttribute("aria-hidden", "true");
    langBtn.tabIndex = -1;
  }
  // The attempt belongs to this frame's history entry, including across reloads.
  if (history.state?.litfolioLocaleAttempt === PR.lang) history.replaceState(null, "");
  let writingLocale = false;
  let requestedLocale;
  const applyLocale = async (lang) => {
    if (lang !== "en" && lang !== "zh") return;
    requestedLocale = lang;
    if (writingLocale || PR.lang === lang || history.state?.litfolioLocaleAttempt === lang) return;
    writingLocale = true;
    try {
      if (!PR.token) PR.token = (await PR.api(PR.importState ? "/api/host/import-context" : "/api/library")).token;
      do {
        lang = requestedLocale;
        await PR.api("/api/prefs", { method: "POST", body: { ui: { lang } } });
      } while (requestedLocale !== lang);
      history.replaceState({ litfolioLocaleAttempt: lang }, "");
      location.reload();
    } catch (_) { writingLocale = false; }
  };

  /* ---------- 宿主发来的通知 ---------- */
  window.addEventListener("message", (event) => {
    if (event.source !== parent) return;
    const data = event.data;
    if (!data || data.source !== "litfolio-host") return;
    const origin = event.origin === "null" ? "*" : event.origin;
    if (parentOrigin !== undefined && parentOrigin !== origin) return;
    parentOrigin = origin;
    if (data.type === "theme") {
      const { theme, colorScheme, tokens } = data;
      if (!["violet", "warm", "blueprint"].includes(theme) || !tokens || typeof tokens !== "object") return;
      if (colorScheme !== "light" && colorScheme !== "dark") return;
      if (themeTokens.some((name) => typeof tokens[name] !== "string" || !tokens[name])) return;
      for (const name of themeTokens) root.style.setProperty("--litera-" + name, tokens[name]);
      root.dataset.theme = colorScheme;
      root.dataset.litfolioTheme = theme;
      root.style.colorScheme = colorScheme;
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
    if (data.type === "library-collections") { updateCollections?.(data); return; }
    if (data.type === "reader-controls") { updateReaderControls?.(data); return; }
    if (data.type === "library-changed" && lib) lib.load();
  });
  // Locale changes reload the iframe document and discard the applied host state.
  emit({ type: "ready" });
})();
