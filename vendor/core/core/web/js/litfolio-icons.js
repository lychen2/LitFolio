/* Loaded only by the LitFolio host bridge. The upstream glyphs remain the fallback
 * until a local asset loads. Keep native controls and their event targets intact. */
import { kubaiImages } from "../kubai/paint.js";

(() => {
  "use strict";
  const shared = {
    menu: "menu", back: "chevron-left", search: "search", plus: "plus", gear: "settings",
    star: "star", note: "note", edit: "edit", en: "language", page: "document", redo: "sync",
    copy: "copy", trash: "trash", pdf: "document", book: "book", panel: "split", upload: "upload",
    x: "close", folder: "folder", cloud: "cloud", marker: "highlighter", chevron: "chevron-down",
    arrowUp: "arrow-up", stop: "stop", underline: "underline", more: "more", download: "download",
    log: "clipboard", check: "check", tag: "tag", pin: "pushpin", link: "link", sparkle: "sparkle",
    question: "help",
  };

  // Each selector owns a glyph-only element. Labelled controls with separate text
  // (e.g. Export, full screen) target only their existing glyph child.
  const inline = {
    close: '[data-pv="close"], .find-panel [data-close], [data-zoom="close"], .jump-back-close, .tab-close, [data-st-close] > svg, [data-c="close"], [data-c="unref"], [data-c="unimage"], [data-c="unfile"], [data-note-media="remove"], [data-media-close], [data-nh="close"], [data-np-act="close"]',
    plus: '#newTab, [data-pv-zoom="in"], [data-zoom="in"], [data-note-zoom="in"], #settings [data-fs="1"]',
    minus: '[data-pv-zoom="out"], [data-zoom="out"], [data-note-zoom="out"], #settings [data-fs="-1"]',
    "chevron-left": '[data-pv="prev"]',
    "chevron-right": '[data-pv="next"]',
    "chevron-down": '[data-order-menu] > svg, .pn-export-arrow',
    "arrow-up": '.find-panel [data-prev]',
    "arrow-down": '.find-panel [data-next], .mg-arrow',
    more: '#blockbar [data-i="more"]',
    check: '.ch-model-check, .media-option-check:not(:empty)',
    text: '#bar [data-act="settings"]',
    grip: '.cite-grip',
    expand: '[data-note-expand] > svg',
  };
  const inlineSelector = Object.values(inline).join(",");

  // The prebuilt Tiptap bundle exposes a common icon class but no semantic ID.
  // Match its path prefixes only inside the editor's control icons, including portaled menus.
  const editor = {
    "M12.7071 5.70711": "arrow-left", "M4.43471 4.01458": "exclude", "M8 6C8 5.44772": "quote",
    "M6 2.5C5.17157": "bold", "M5.29289 8.29289": "chevron-down", "M6.70711 2.29289": "code-block",
    "M21 4C21 3.44772": "return", "M14 3C14 2.44772": "external-link", "M6 3C6.55228": "heading",
    "M21.0001 10C21.0001": "heading-1", "M22.0001 12C22.0001": "heading-2", "M19.4608 11.2169": "heading-3",
    "M17 9C17.5523": "heading-4", "M16 10C16 9.44772": "heading-5", "M20.7071 9.29289": "heading-6",
    "M14.7072 4.70711": "highlighter", "M20 2C20 1.44772": "photo", "M15.0222 3H19": "italic",
    "M16.9958 1.06669": "link", "M7 6C7 5.44772": "list", "M9 6C9 5.44772": "list-ordered",
    "M2 6C2 4.89543": "list-task", "M15.7071 2.29289": "redo", "M9.00039 3H16.0001": "strikethrough",
    "M12.7071 7.29289": "superscript", "M7 5V4C7 3.17477": "trash", "M7 4C7 3.44772": "underline",
    "M9.70711 3.70711": "undo", "M3 9h18M3 15h18": "table", "m15 15 6 6M7 10h6": "zoom-in",
  };
  const editorSelector = "svg:is(.tiptap-button-icon, .tiptap-button-dropdown-small)";
  const selector = `svg[data-pr-icon], ${inlineSelector}, ${editorSelector}`;
  const isSvg = (node) => node instanceof SVGElement;
  const requested = new Set();
  const root = document.documentElement;
  const sources = new Map();

  function publish(name, source) {
    const scheme = root.dataset.theme === "dark" ? "dark" : "light";
    const images = kubaiImages(source, root.dataset.litfolioTheme);
    root.style.setProperty(`--kubai-${name}-image`, `url("${images[scheme]}")`);
    root.style.setProperty(`--kubai-${name}-on-fill-image`, `url("${images[scheme === "dark" ? "light" : "dark"]}")`);
  }

  new MutationObserver(() => {
    for (const [name, source] of sources) publish(name, source);
  }).observe(root, { attributeFilter: ["data-litfolio-theme", "data-theme"] });

  async function asset(name) {
    if (requested.has(name)) return;
    requested.add(name);
    try {
      const response = await fetch(`/web/kubai/${name}.svg`);
      if (!response.ok) return;
      const source = await response.text();
      const image = new Image();
      image.src = kubaiImages(source).light;
      await image.decode();
      sources.set(name, source);
      publish(name, source);
      root.style.setProperty(`--kubai-${name}-original`, "hidden");
      root.setAttribute(`data-kubai-${name}`, "");
    } catch {
      // Leave the original glyph visible if the local asset fails to load.
    }
  }

  function paint(glyph, name, active) {
    if (!name || !glyph.firstChild || glyph.classList.contains("kubai-glyph") ||
        glyph.firstElementChild?.classList.contains("kubai-text-glyph")) return;
    asset(name);
    if (active) asset(active);
    let icon = glyph;
    if (!isSvg(glyph)) {
      if (glyph.matches("button")) {
        if (!glyph.getAttribute("aria-label") && glyph.title) glyph.setAttribute("aria-label", glyph.title);
        icon = document.createElement("span");
        icon.setAttribute("aria-hidden", "true");
      }
      const original = document.createElement("span");
      original.className = "kubai-original";
      original.append(...glyph.childNodes);
      icon.classList.add("kubai-text-glyph");
      icon.append(original);
      if (icon !== glyph) glyph.append(icon);
    }
    icon.classList.add("kubai-glyph");
    icon.style.setProperty("--kubai-image", `var(--kubai-${name}-image, none)`);
    icon.style.setProperty("--kubai-on-fill-image", `var(--kubai-${name}-on-fill-image, none)`);
    icon.style.setProperty("--kubai-original", `var(--kubai-${name}-original, visible)`);
    if (active) {
      icon.style.setProperty("--kubai-active-image", `var(--kubai-${active}-image, none)`);
      icon.style.setProperty("--kubai-active-original", `var(--kubai-${active}-original, visible)`);
    }
  }

  function decorate(node) {
    if (node.matches("svg[data-pr-icon]")) {
      const name = node.dataset.prIcon;
      if (name === "star" && node.closest('[data-d="star"]')) paint(node, "star-off", "star");
      else paint(node, Object.hasOwn(shared, name) ? shared[name] : null);
    } else if (node.matches(editorSelector)) {
      const paths = [...node.querySelectorAll("path")];
      const name = Object.entries(editor).find(([prefix]) => paths.some((path) => path.getAttribute("d")?.startsWith(prefix)))?.[1];
      paint(node, name);
    } else {
      const name = Object.keys(inline).find((key) => node.matches(inline[key]));
      paint(node, name, name === "expand" ? "minimize" : undefined);
    }
  }

  function scan(node) {
    if (!(node instanceof Element)) return;
    if (node.matches(selector)) decorate(node);
    node.querySelectorAll(selector).forEach(decorate);
  }
  if (document.querySelector('select.input, #importDlg, #settings, .topbar')) {
    asset("chevron-down");
    asset("chevron-right");
  }
  if (document.querySelector('.topbar')) {
    asset("check");
  }
  scan(document.body);
  new MutationObserver((records) => {
    for (const record of records) {
      // Controls may be assembled incrementally (including React portals).
      if (record.target instanceof Element && record.target.matches(selector)) decorate(record.target);
      record.addedNodes.forEach(scan);
    }
  }).observe(document.body, { childList: true, subtree: true });
})();
