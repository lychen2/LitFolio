// One entry per screenshot. capture.mjs loops over this list.
//   route   – path after http://localhost:5179
//   waitFor – CSS selector that signals the page is rendered
//   action  – optional async fn (page) => {} for interactions (click, type…)
//   out     – filename inside docs/manual/figures/
// Selectors are intentionally robust (text= / role= / lucide icon classes).

export const ROUTES = [
  { out: "01-shell-library.png",   route: "/library",  waitFor: "text=最近文献", waitMs: 600 },
  { out: "02-library-drawer.png",  route: "/library",  waitFor: "text=最近文献",
    action: async (page) => {
      await page.locator("button:has-text('深读')").first().click();
      await page.waitForSelector("text=解决什么问题");
      await page.waitForTimeout(400);
    }, waitMs: 400 },
  { out: "03-library-folder.png",  route: "/library",  waitFor: "text=最近文献",
    action: async (page) => {
      await page.locator("button:has-text('机器学习')").first().click();
      await page.waitForTimeout(500);
    }, waitMs: 300 },
  { out: "04-import-arxiv.png",    route: "/import",   waitFor: "text=粘贴 arXiv ID",
    action: async (page) => {
      await page.fill("input[placeholder*='1706.03762']", "1706.03762");
      await page.locator("button:has-text('查询元数据')").click();
      await page.waitForSelector("text=Attention is all you need");
      await page.waitForTimeout(400);
    }, waitMs: 200 },
  { out: "05-import-pdf.png",      route: "/import",   waitFor: "button:has-text('PDF 文件')",
    action: async (page) => {
      await page.locator("button:has-text('PDF 文件')").first().click();
      await page.waitForTimeout(500);
    }, waitMs: 200 },
  { out: "06-import-search.png",   route: "/import",   waitFor: "button:has-text('搜索')",
    action: async (page) => {
      await page.locator("button[role='tab']:has-text('搜索'), button:has-text('搜索')").first().click();
      await page.waitForTimeout(300);
      const inp = page.locator("input[placeholder*='attention is all you need']");
      if (await inp.count()) {
        await inp.fill("attention is all you need");
        const btn = page.locator("button:has-text('搜索')").last();
        await btn.click();
        await page.waitForTimeout(700);
      }
    }, waitMs: 200 },
  { out: "07-browse.png",          route: "/browse",   waitFor: "text=arXiv", waitMs: 800 },
  { out: "08-feeds.png",           route: "/feeds",    waitFor: "text=订阅源",
    action: async (page) => {
      // Click the first feed source to show its items
      await page.waitForTimeout(500);
    }, waitMs: 600 },
  { out: "09-feeds-detail.png",    route: "/feeds",    waitFor: "text=订阅源",
    action: async (page) => {
      await page.waitForTimeout(400);
      const firstItem = page.locator("article, [role='button']").filter({ hasText: "Ultrafast laser writing" });
      if (await firstItem.count()) await firstItem.first().click();
      else {
        // fallback: click any text reference
        await page.locator("text=Ultrafast laser writing").first().click().catch(() => {});
      }
      await page.waitForTimeout(500);
    }, waitMs: 200 },
  { out: "10-topic-search.png",    route: "/topic",    waitFor: "text=主题",
    action: async (page) => {
      const searchTab = page.locator("button:has-text('搜索召回'), button:has-text('搜索')").first();
      if (await searchTab.count()) await searchTab.click().catch(() => {});
      await page.fill("input[placeholder*='retrieval'], input[placeholder*='主题']", "retrieval augmented generation").catch(() => {});
      const discover = page.locator("button:has-text('发现')");
      if (await discover.count()) await discover.first().click();
      await page.waitForTimeout(700);
    }, waitMs: 200 },
  { out: "11-topic-survey.png",    route: "/topic",    waitFor: "text=主题",
    action: async (page) => {
      const surveyTab = page.locator("button:has-text('综述生成'), button:has-text('综述')").first();
      if (await surveyTab.count()) await surveyTab.click();
      await page.waitForTimeout(300);
      await page.fill("textarea[placeholder*='极端'], textarea, input[placeholder*='极端']", "极端超短脉冲激光").catch(() => {});
      const gen = page.locator("button:has-text('生成综述'), button:has-text('生成')").first();
      if (await gen.count()) await gen.click();
      await page.waitForSelector("text=必读", { timeout: 6000 }).catch(() => {});
      await page.waitForTimeout(600);
    }, waitMs: 200 },
  { out: "12-ask-empty.png",       route: "/ask",      waitFor: "textarea", waitMs: 500 },
  { out: "13-ask-result.png",      route: "/ask",      waitFor: "textarea",
    action: async (page) => {
      const ta = page.locator("textarea").first();
      await ta.fill("这些论文里讨论 chirped pulse amplification 局限的工作有哪几篇？");
      await ta.press("Control+Enter");
      await page.waitForSelector("text=AI 助手", { timeout: 8000 });
      await page.waitForTimeout(500);
    }, waitMs: 200 },
  { out: "14-reader.png",          route: "/reader/01KSCN65XF4B2PZ83D27ET55PX", waitFor: "text=高亮", waitMs: 2500 },
  { out: "15-reader-translate.png",route: "/reader/01KSCN65XF4B2PZ83D27ET55PX", waitFor: "text=高亮",
    action: async (page) => {
      // Wait for the PDF.js text layer to render. Spans are absolute-positioned
      // so Playwright's default visibility check rejects them — use attached.
      await page.waitForSelector(".textLayer", { state: "attached", timeout: 8000 });
      await page.waitForTimeout(2000);
      // Pick a span with enough text, return its boundingClientRect so we can
      // drive a real mouse drag (PDF.js needs real DOM selection events to
      // attach pageNumber metadata; synthetic Range.addRange crashes
      // react-pdf-highlighter at groupHighlightsByPage).
      const box = await page.evaluate(() => {
        const layers = Array.from(document.querySelectorAll(".textLayer"));
        for (const layer of layers) {
          const spans = Array.from(layer.querySelectorAll("span")).filter(
            (s) => !s.classList.contains("markedContent") && (s.textContent || "").trim().length > 30,
          );
          if (spans.length === 0) continue;
          const target = spans[0];
          const r = target.getBoundingClientRect();
          return {
            x1: r.left + 2,
            y1: r.top + r.height / 2,
            x2: r.right - 2,
            y2: r.top + r.height / 2,
            text: (target.textContent || "").trim().slice(0, 60),
          };
        }
        return null;
      });
      console.log("[capture] target span:", box?.text);
      if (box) {
        await page.mouse.move(box.x1, box.y1);
        await page.mouse.down();
        await page.mouse.move((box.x1 + box.x2) / 2, box.y2, { steps: 4 });
        await page.mouse.move(box.x2, box.y2, { steps: 8 });
        await page.mouse.up();
        await page.waitForTimeout(500);
        // SelectionActions popup includes the 翻译选段 button.
        const trBtn = page.locator("button:has-text('翻译选段')").first();
        if (await trBtn.count()) await trBtn.click({ force: true }).catch(() => {});
        await page.waitForSelector("text=译文", { timeout: 5000 }).catch(() => {});
        await page.waitForTimeout(600);
      }
    }, waitMs: 200 },
  { out: "16-reader-terms.png",    route: "/reader/01KSCN65XF4B2PZ83D27ET55PX", waitFor: "text=高亮",
    action: async (page) => {
      await page.waitForTimeout(2000);
      await page.getByRole("button", { name: "术语", exact: true }).click();
      await page.waitForTimeout(500);
    }, waitMs: 300 },
  { out: "19-graph-network.png",    route: "/graph",    waitFor: "canvas, [class*='force-graph']",
    action: async (page) => {
      await page.waitForTimeout(1500);
    }, waitMs: 500 },
  { out: "20-graph-mindmap.png",    route: "/graph",    waitFor: "canvas, [class*='force-graph']",
    action: async (page) => {
      // Switch to mindmap view
      const mindmapBtn = page.locator("button:has-text('思维导图'), button:has-text('Mindmap')").first();
      if (await mindmapBtn.count()) await mindmapBtn.click();
      await page.waitForTimeout(1000);
    }, waitMs: 500 },
  { out: "17-settings-profiles.png", route: "/settings", waitFor: "text=LLM 配置", waitMs: 600 },
  { out: "18-settings-sync.png",   route: "/settings", waitFor: "text=LLM 配置",
    action: async (page) => {
      await page.locator("button:has-text('同步')").first().click();
      await page.waitForTimeout(400);
    }, waitMs: 200 },

  // ─── New feature screenshots ─────────────────────────────────────────

  // 21. BibTeX copy button in library drawer
  { out: "21-library-bibtex.png", route: "/library", waitFor: "text=最近文献",
    action: async (page) => {
      await page.locator("button:has-text('深读')").first().click();
      await page.waitForSelector("text=解决什么问题");
      await page.waitForTimeout(300);
      // Look for BibTeX copy button in the drawer
      const bibtexBtn = page.locator("button:has-text('BibTeX'), button:has-text('复制 BibTeX')").first();
      if (await bibtexBtn.count()) await bibtexBtn.click().catch(() => {});
      await page.waitForTimeout(400);
    }, waitMs: 400 },

  // 22. Smart collections in sidebar
  { out: "22-smart-collections.png", route: "/library", waitFor: "text=最近文献",
    action: async (page) => {
      await page.waitForTimeout(500);
      // Click on a smart collection in the sidebar
      const smartItem = page.locator("text=2024+ 必读论文, text=Transformer 相关").first();
      if (await smartItem.count()) await smartItem.click().catch(() => {});
      await page.waitForTimeout(500);
    }, waitMs: 300 },

  // 23. Reading queue view
  { out: "23-reading-queue.png", route: "/library", waitFor: "text=最近文献",
    action: async (page) => {
      await page.waitForTimeout(400);
      // Toggle to queue view via the clock button
      const queueBtn = page.locator("button[title*='阅读队列'], button[title*='queue']").first();
      if (await queueBtn.count()) await queueBtn.click().catch(() => {});
      else {
        // Fallback: find button with Clock icon near the title
        await page.locator("header button").first().click().catch(() => {});
      }
      await page.waitForSelector("text=阅读队列, text=优先级", { timeout: 3000 }).catch(() => {});
      await page.waitForTimeout(500);
    }, waitMs: 300 },

  // 24. Multi-turn Ask conversation
  { out: "24-ask-multiturn.png", route: "/ask", waitFor: "textarea",
    action: async (page) => {
      // First question
      const ta = page.locator("textarea").first();
      await ta.fill("这些论文里讨论 chirped pulse amplification 局限的工作有哪几篇？");
      await ta.press("Control+Enter");
      await page.waitForSelector("text=AI 助手", { timeout: 8000 });
      await page.waitForTimeout(500);
      // Follow-up question
      const followUp = page.locator("textarea").last();
      await followUp.fill("那 post-compression 方案里，哪种最有潜力突破 sub-4-fs？");
      await followUp.press("Control+Enter");
      await page.waitForSelector("text=空芯光纤, text=hollow-core", { timeout: 8000 }).catch(() => {});
      await page.waitForTimeout(600);
    }, waitMs: 200 },

  // 25. Citation network view
  { out: "25-citations-network.png", route: "/graph", waitFor: "canvas, [class*='force-graph']",
    action: async (page) => {
      await page.waitForTimeout(1000);
      // Look for citation network tab or button
      const citBtn = page.locator("button:has-text('引用网络'), button:has-text('Citations'), button:has-text('引用')").first();
      if (await citBtn.count()) await citBtn.click().catch(() => {});
      await page.waitForTimeout(800);
    }, waitMs: 500 },

  // 26. Concept graph view
  { out: "26-concept-graph.png", route: "/graph", waitFor: "canvas, [class*='force-graph']",
    action: async (page) => {
      await page.waitForTimeout(800);
      // Toggle concepts display
      const conceptToggle = page.locator("button:has-text('显示概念'), label:has-text('概念'), input[type='checkbox']").first();
      if (await conceptToggle.count()) await conceptToggle.click().catch(() => {});
      await page.waitForTimeout(1000);
    }, waitMs: 500 },

  // 27. Topic alerts
  { out: "27-topic-alerts.png", route: "/settings", waitFor: "text=LLM 配置",
    action: async (page) => {
      // Navigate to tools/alerts tab
      const toolsTab = page.locator("button:has-text('工具'), button:has-text('Tools')").first();
      if (await toolsTab.count()) await toolsTab.click().catch(() => {});
      await page.waitForTimeout(400);
      // Look for alerts section
      const alertsSection = page.locator("text=主题提醒").first();
      if (await alertsSection.count()) await alertsSection.scrollIntoViewIfNeeded().catch(() => {});
      await page.waitForTimeout(500);
    }, waitMs: 300 },

  // 28. Similar papers panel
  { out: "28-similar-papers.png", route: "/library", waitFor: "text=最近文献",
    action: async (page) => {
      await page.locator("button:has-text('深读')").first().click();
      await page.waitForSelector("text=解决什么问题");
      await page.waitForTimeout(300);
      // Click on similar papers tab/section
      const similarTab = page.locator("button:has-text('相似'), button:has-text('Similar'), button:has-text('推荐')").first();
      if (await similarTab.count()) await similarTab.click().catch(() => {});
      await page.waitForSelector("text=查找相似论文, text=相似论文推荐", { timeout: 3000 }).catch(() => {});
      const findBtn = page.locator("button:has-text('查找相似论文')").first();
      if (await findBtn.count()) await findBtn.click().catch(() => {});
      await page.waitForTimeout(800);
    }, waitMs: 400 },

  // 29. Literature review page
  { out: "29-lit-review.png", route: "/library", waitFor: "text=最近文献",
    action: async (page) => {
      await page.waitForTimeout(500);
      // Select a folder to activate the lit review button
      await page.locator("button:has-text('超快激光'), button:has-text('机器学习')").first().click().catch(() => {});
      await page.waitForTimeout(400);
      // Open lit review dialog
      const litReviewBtn = page.locator("button:has-text('文献综述'), button:has-text('综述')").first();
      if (await litReviewBtn.count()) await litReviewBtn.click().catch(() => {});
      else {
        // Look for sparkle icon button near the header
        await page.locator("header button:has(svg)").last().click().catch(() => {});
      }
      await page.waitForTimeout(300);
      // Select grouping and generate
      const genBtn = page.locator("button:has-text('开始生成'), button:has-text('生成')").first();
      if (await genBtn.count()) await genBtn.click().catch(() => {});
      await page.waitForSelector("text=引言, text=综述, text=结论", { timeout: 8000 }).catch(() => {});
      await page.waitForTimeout(500);
    }, waitMs: 400 },

  // 30. Compare page (multi-paper comparison)
  { out: "30-compare.png", route: "/compare", waitFor: "text=Comparisons, text=比较",
    action: async (page) => {
      await page.waitForTimeout(600);
      // Click on the first comparison in the sidebar
      const firstComp = page.locator("aside button, [class*='border-r'] button").first();
      if (await firstComp.count()) await firstComp.click().catch(() => {});
      await page.waitForTimeout(500);
    }, waitMs: 400 },

  // 31. Command palette overlay
  { out: "31-command-palette.png", route: "/library", waitFor: "text=最近文献",
    action: async (page) => {
      await page.waitForTimeout(500);
      // Trigger command palette with Ctrl+K
      await page.keyboard.press("Control+k");
      await page.waitForTimeout(400);
      // Type a search query
      const paletteInput = page.locator("[cmdk-input], input[placeholder*='搜索'], input[placeholder*='Search'], input[placeholder*='command'], dialog input, [role='dialog'] input").first();
      if (await paletteInput.count()) {
        await paletteInput.fill("attention");
        await page.waitForTimeout(400);
      }
    }, waitMs: 500 },

  // 32. Custom fields in settings
  { out: "32-settings-custom-fields.png", route: "/settings", waitFor: "text=LLM 配置",
    action: async (page) => {
      // Navigate to tools tab
      const toolsTab = page.locator("button:has-text('工具'), button:has-text('Tools')").first();
      if (await toolsTab.count()) await toolsTab.click().catch(() => {});
      await page.waitForTimeout(400);
      // Look for custom fields section
      const cfSection = page.locator("text=自定义字段").first();
      if (await cfSection.count()) await cfSection.scrollIntoViewIfNeeded().catch(() => {});
      await page.waitForTimeout(500);
    }, waitMs: 300 },

  // 33. Annotation color labels
  { out: "33-reader-labels.png", route: "/reader/01KSCN65XF4B2PZ83D27ET55PX", waitFor: "text=高亮",
    action: async (page) => {
      await page.waitForTimeout(2000);
      // Click on a highlight to show label options
      const highlightItem = page.locator("[class*='highlight'], button:has-text('高亮')").first();
      if (await highlightItem.count()) await highlightItem.click().catch(() => {});
      await page.waitForTimeout(300);
      // Look for label/color buttons
      const labelBtn = page.locator("button:has-text('关键发现'), button:has-text('方法'), button:has-text('待验证'), [class*='label']").first();
      if (await labelBtn.count()) await labelBtn.click().catch(() => {});
      await page.waitForTimeout(500);
    }, waitMs: 400 },

  // 34. Markdown export settings
  { out: "34-settings-export.png", route: "/settings", waitFor: "text=LLM 配置",
    action: async (page) => {
      // Navigate to tools tab
      const toolsTab = page.locator("button:has-text('工具'), button:has-text('Tools')").first();
      if (await toolsTab.count()) await toolsTab.click().catch(() => {});
      await page.waitForTimeout(400);
      // Look for export section
      const exportSection = page.locator("text=导出, text=Markdown").first();
      if (await exportSection.count()) await exportSection.scrollIntoViewIfNeeded().catch(() => {});
      await page.waitForTimeout(500);
    }, waitMs: 300 },

  // 35. Batch folder import
  { out: "35-import-folder.png", route: "/import", waitFor: "text=粘贴 arXiv ID",
    action: async (page) => {
      // Switch to PDF tab
      await page.locator("button:has-text('PDF 文件')").first().click();
      await page.waitForTimeout(400);
      // Look for folder import button
      const folderBtn = page.locator("button:has-text('导入文件夹'), button:has-text('文件夹')").first();
      if (await folderBtn.count()) await folderBtn.click().catch(() => {});
      await page.waitForTimeout(500);
    }, waitMs: 300 },

  // 36. Structured note cards
  { out: "36-reader-note-sections.png", route: "/reader/01KSCN65XF4B2PZ83D27ET55PX", waitFor: "text=高亮",
    action: async (page) => {
      await page.waitForTimeout(2000);
      // Switch to notes tab
      const notesTab = page.getByRole("button", { name: "笔记", exact: true }).first();
      if (await notesTab.count()) await notesTab.click().catch(() => {});
      else {
        await page.locator("button:has-text('笔记')").first().click().catch(() => {});
      }
      await page.waitForTimeout(800);
      // Look for structured note sections
      const sections = page.locator("text=速读, text=重要数字, text=方法笔记, text=待跟进");
      if (await sections.count()) await sections.first().scrollIntoViewIfNeeded().catch(() => {});
      await page.waitForTimeout(500);
    }, waitMs: 400 },
];
