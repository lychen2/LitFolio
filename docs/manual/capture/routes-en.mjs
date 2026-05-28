// English route definitions for screenshot capture.
// Selectors match src/i18n/en.ts translations.

export const ROUTES = [
  { out: "01-shell-library-en.png", route: "/library", waitFor: "text=Library", waitMs: 600 },
  { out: "02-library-drawer-en.png", route: "/library", waitFor: "text=Library",
    action: async (page) => {
      await page.locator("button:has-text('Deep read')").first().click();
      await page.waitForSelector("text=Problem addressed");
      await page.waitForTimeout(400);
    }, waitMs: 400 },
  { out: "03-library-folder-en.png", route: "/library", waitFor: "text=Library",
    action: async (page) => {
      await page.locator("button:has-text('Machine Learning')").first().click();
      await page.waitForTimeout(500);
    }, waitMs: 300 },
  { out: "04-import-arxiv-en.png", route: "/import", waitFor: "text=arXiv ID",
    action: async (page) => {
      await page.fill("input[placeholder*='1706.03762']", "1706.03762");
      await page.locator("button:has-text('Fetch metadata')").click();
      await page.waitForSelector("text=Attention is all you need");
      await page.waitForTimeout(400);
    }, waitMs: 200 },
  { out: "05-import-pdf-en.png", route: "/import", waitFor: "button:has-text('PDF file')",
    action: async (page) => {
      await page.locator("button:has-text('PDF file')").first().click();
      await page.waitForTimeout(500);
    }, waitMs: 200 },
  { out: "06-import-search-en.png", route: "/import", waitFor: "button:has-text('Search')",
    action: async (page) => {
      await page.locator("button[role='tab']:has-text('Search'), button:has-text('Search')").first().click();
      await page.waitForTimeout(300);
      const inp = page.locator("input[placeholder*='attention is all you need']");
      if (await inp.count()) {
        await inp.fill("attention is all you need");
        const btn = page.locator("button:has-text('Search')").last();
        await btn.click();
        await page.waitForTimeout(700);
      }
    }, waitMs: 200 },
  { out: "07-browse-en.png", route: "/browse", waitFor: "text=arXiv", waitMs: 800 },
  { out: "08-feeds-en.png", route: "/feeds", waitFor: "text=RSS",
    action: async (page) => {
      await page.waitForTimeout(500);
    }, waitMs: 600 },
  { out: "09-feeds-detail-en.png", route: "/feeds", waitFor: "text=RSS",
    action: async (page) => {
      await page.waitForTimeout(400);
      const firstItem = page.locator("article, [role='button']").filter({ hasText: "Ultrafast laser writing" });
      if (await firstItem.count()) await firstItem.first().click();
      else {
        await page.locator("text=Ultrafast laser writing").first().click().catch(() => {});
      }
      await page.waitForTimeout(500);
    }, waitMs: 200 },
  { out: "10-topic-search-en.png", route: "/topic", waitFor: "text=Discover",
    action: async (page) => {
      const searchTab = page.locator("button:has-text('Search'), button:has-text('Recall')").first();
      if (await searchTab.count()) await searchTab.click().catch(() => {});
      await page.fill("input[placeholder*='retrieval'], input[placeholder*='topic']", "retrieval augmented generation").catch(() => {});
      const discover = page.locator("button:has-text('Discover'), button:has-text('Search')").last();
      if (await discover.count()) await discover.first().click();
      await page.waitForTimeout(700);
    }, waitMs: 200 },
  { out: "11-topic-survey-en.png", route: "/topic", waitFor: "text=Discover",
    action: async (page) => {
      const surveyTab = page.locator("button:has-text('Survey'), button:has-text('Generate')").first();
      if (await surveyTab.count()) await surveyTab.click();
      await page.waitForTimeout(300);
      await page.fill("textarea[placeholder*='ultrashort'], textarea, input[placeholder*='ultrashort']", "ultrashort intense laser pulses").catch(() => {});
      const gen = page.locator("button:has-text('Generate survey'), button:has-text('Generate')").first();
      if (await gen.count()) await gen.click();
      await page.waitForSelector("text=Must-read", { timeout: 6000 }).catch(() => {});
      await page.waitForTimeout(600);
    }, waitMs: 200 },
  { out: "12-ask-empty-en.png", route: "/ask", waitFor: "textarea", waitMs: 500 },
  { out: "13-ask-result-en.png", route: "/ask", waitFor: "textarea",
    action: async (page) => {
      const ta = page.locator("textarea").first();
      await ta.fill("Which papers discuss limitations of chirped pulse amplification?");
      await ta.press("Control+Enter");
      await page.waitForSelector("text=AI Assistant", { timeout: 8000 });
      await page.waitForTimeout(500);
    }, waitMs: 200 },
  { out: "14-reader-en.png", route: "/reader/01KSCN65XF4B2PZ83D27ET55PX", waitFor: "text=Highlights", waitMs: 2500 },
  { out: "15-reader-translate-en.png", route: "/reader/01KSCN65XF4B2PZ83D27ET55PX", waitFor: "text=Highlights",
    action: async (page) => {
      await page.waitForSelector(".textLayer", { state: "attached", timeout: 8000 });
      await page.waitForTimeout(2000);
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
            x1: r.left + 2, y1: r.top + r.height / 2,
            x2: r.right - 2, y2: r.top + r.height / 2,
            text: (target.textContent || "").trim().slice(0, 60),
          };
        }
        return null;
      });
      if (box) {
        await page.mouse.move(box.x1, box.y1);
        await page.mouse.down();
        await page.mouse.move((box.x1 + box.x2) / 2, box.y2, { steps: 4 });
        await page.mouse.move(box.x2, box.y2, { steps: 8 });
        await page.mouse.up();
        await page.waitForTimeout(500);
        const trBtn = page.locator("button:has-text('Translate selection')").first();
        if (await trBtn.count()) await trBtn.click({ force: true }).catch(() => {});
        await page.waitForSelector("text=Translation", { timeout: 5000 }).catch(() => {});
        await page.waitForTimeout(600);
      }
    }, waitMs: 200 },
  { out: "16-reader-terms-en.png", route: "/reader/01KSCN65XF4B2PZ83D27ET55PX", waitFor: "text=Highlights",
    action: async (page) => {
      await page.waitForTimeout(2000);
      await page.getByRole("button", { name: "Terms", exact: true }).click();
      await page.waitForTimeout(500);
    }, waitMs: 300 },
  { out: "19-graph-network-en.png", route: "/graph", waitFor: "canvas, [class*='force-graph']",
    action: async (page) => {
      await page.waitForTimeout(1500);
    }, waitMs: 500 },
  { out: "20-graph-mindmap-en.png", route: "/graph", waitFor: "canvas, [class*='force-graph']",
    action: async (page) => {
      const mindmapBtn = page.locator("button:has-text('Mind map'), button:has-text('Mindmap')").first();
      if (await mindmapBtn.count()) await mindmapBtn.click();
      await page.waitForTimeout(1000);
    }, waitMs: 500 },
  { out: "17-settings-profiles-en.png", route: "/settings", waitFor: "text=LLM", waitMs: 600 },
  { out: "18-settings-sync-en.png", route: "/settings", waitFor: "text=LLM",
    action: async (page) => {
      await page.locator("button:has-text('Sync')").first().click();
      await page.waitForTimeout(400);
    }, waitMs: 200 },

  // ─── New feature screenshots ─────────────────────────────────────────

  { out: "21-library-bibtex-en.png", route: "/library", waitFor: "text=Library",
    action: async (page) => {
      await page.locator("button:has-text('Deep read')").first().click();
      await page.waitForSelector("text=Problem addressed");
      await page.waitForTimeout(300);
      const bibtexBtn = page.locator("button:has-text('BibTeX'), button:has-text('Copy BibTeX')").first();
      if (await bibtexBtn.count()) await bibtexBtn.click().catch(() => {});
      await page.waitForTimeout(400);
    }, waitMs: 400 },

  { out: "22-smart-collections-en.png", route: "/library", waitFor: "text=Library",
    action: async (page) => {
      await page.waitForTimeout(500);
      const smartItem = page.locator("text=2024+ Must-read, text=Transformer-related").first();
      if (await smartItem.count()) await smartItem.click().catch(() => {});
      await page.waitForTimeout(500);
    }, waitMs: 300 },

  { out: "23-reading-queue-en.png", route: "/library", waitFor: "text=Library",
    action: async (page) => {
      await page.waitForTimeout(400);
      const queueBtn = page.locator("button[title*='queue'], button[title*='Reading']").first();
      if (await queueBtn.count()) await queueBtn.click().catch(() => {});
      else { await page.locator("header button").first().click().catch(() => {}); }
      await page.waitForSelector("text=Reading Queue, text=Priority", { timeout: 3000 }).catch(() => {});
      await page.waitForTimeout(500);
    }, waitMs: 300 },

  { out: "24-ask-multiturn-en.png", route: "/ask", waitFor: "textarea",
    action: async (page) => {
      const ta = page.locator("textarea").first();
      await ta.fill("Which papers discuss limitations of chirped pulse amplification?");
      await ta.press("Control+Enter");
      await page.waitForSelector("text=AI Assistant", { timeout: 8000 });
      await page.waitForTimeout(500);
      const followUp = page.locator("textarea").last();
      await followUp.fill("Among post-compression approaches, which has the most potential to break sub-4-fs?");
      await followUp.press("Control+Enter");
      await page.waitForSelector("text=hollow-core", { timeout: 8000 }).catch(() => {});
      await page.waitForTimeout(600);
    }, waitMs: 200 },

  { out: "25-citations-network-en.png", route: "/graph", waitFor: "canvas, [class*='force-graph']",
    action: async (page) => {
      await page.waitForTimeout(1000);
      const citBtn = page.locator("button:has-text('Citations'), button:has-text('References')").first();
      if (await citBtn.count()) await citBtn.click().catch(() => {});
      await page.waitForTimeout(800);
    }, waitMs: 500 },

  { out: "26-concept-graph-en.png", route: "/graph", waitFor: "canvas, [class*='force-graph']",
    action: async (page) => {
      await page.waitForTimeout(800);
      const conceptToggle = page.locator("button:has-text('Show concepts'), label:has-text('Concepts'), input[type='checkbox']").first();
      if (await conceptToggle.count()) await conceptToggle.click().catch(() => {});
      await page.waitForTimeout(1000);
    }, waitMs: 500 },

  { out: "27-topic-alerts-en.png", route: "/settings", waitFor: "text=LLM",
    action: async (page) => {
      const toolsTab = page.locator("button:has-text('Tools')").first();
      if (await toolsTab.count()) await toolsTab.click().catch(() => {});
      await page.waitForTimeout(400);
      const alertsSection = page.locator("text=Topic Alerts").first();
      if (await alertsSection.count()) await alertsSection.scrollIntoViewIfNeeded().catch(() => {});
      await page.waitForTimeout(500);
    }, waitMs: 300 },

  { out: "28-similar-papers-en.png", route: "/library", waitFor: "text=Library",
    action: async (page) => {
      await page.locator("button:has-text('Deep read')").first().click();
      await page.waitForSelector("text=Problem addressed");
      await page.waitForTimeout(300);
      const similarTab = page.locator("button:has-text('Similar'), button:has-text('Recommendations')").first();
      if (await similarTab.count()) await similarTab.click().catch(() => {});
      await page.waitForSelector("text=Find similar, text=Similar Paper", { timeout: 3000 }).catch(() => {});
      const findBtn = page.locator("button:has-text('Find similar')").first();
      if (await findBtn.count()) await findBtn.click().catch(() => {});
      await page.waitForTimeout(800);
    }, waitMs: 400 },

  { out: "29-lit-review-en.png", route: "/library", waitFor: "text=Library",
    action: async (page) => {
      await page.waitForTimeout(500);
      await page.locator("button:has-text('Machine Learning')").first().click().catch(() => {});
      await page.waitForTimeout(400);
      const litReviewBtn = page.locator("button:has-text('Literature Review'), button:has-text('Review')").first();
      if (await litReviewBtn.count()) await litReviewBtn.click().catch(() => {});
      else { await page.locator("header button:has(svg)").last().click().catch(() => {}); }
      await page.waitForTimeout(300);
      const genBtn = page.locator("button:has-text('Generate'), button:has-text('Start')").first();
      if (await genBtn.count()) await genBtn.click().catch(() => {});
      await page.waitForSelector("text=Introduction, text=Conclusion", { timeout: 8000 }).catch(() => {});
      await page.waitForTimeout(500);
    }, waitMs: 400 },

  { out: "30-compare-en.png", route: "/compare", waitFor: "text=Comparisons",
    action: async (page) => {
      await page.waitForTimeout(600);
      const firstComp = page.locator("aside button, [class*='border-r'] button").first();
      if (await firstComp.count()) await firstComp.click().catch(() => {});
      await page.waitForTimeout(500);
    }, waitMs: 400 },

  { out: "31-command-palette-en.png", route: "/library", waitFor: "text=Library",
    action: async (page) => {
      await page.waitForTimeout(500);
      await page.keyboard.press("Control+k");
      await page.waitForTimeout(400);
      const paletteInput = page.locator("[cmdk-input], input[placeholder*='Search'], input[placeholder*='command'], dialog input, [role='dialog'] input").first();
      if (await paletteInput.count()) {
        await paletteInput.fill("attention");
        await page.waitForTimeout(400);
      }
    }, waitMs: 500 },

  { out: "32-settings-custom-fields-en.png", route: "/settings", waitFor: "text=LLM",
    action: async (page) => {
      const toolsTab = page.locator("button:has-text('Tools')").first();
      if (await toolsTab.count()) await toolsTab.click().catch(() => {});
      await page.waitForTimeout(400);
      const cfSection = page.locator("text=Custom Fields").first();
      if (await cfSection.count()) await cfSection.scrollIntoViewIfNeeded().catch(() => {});
      await page.waitForTimeout(500);
    }, waitMs: 300 },

  { out: "33-reader-labels-en.png", route: "/reader/01KSCN65XF4B2PZ83D27ET55PX", waitFor: "text=Highlights",
    action: async (page) => {
      await page.waitForTimeout(2000);
      const highlightItem = page.locator("[class*='highlight'], button:has-text('Highlights')").first();
      if (await highlightItem.count()) await highlightItem.click().catch(() => {});
      await page.waitForTimeout(300);
      const labelBtn = page.locator("button:has-text('Key Finding'), button:has-text('Method'), button:has-text('To Verify'), [class*='label']").first();
      if (await labelBtn.count()) await labelBtn.click().catch(() => {});
      await page.waitForTimeout(500);
    }, waitMs: 400 },

  { out: "34-settings-export-en.png", route: "/settings", waitFor: "text=LLM",
    action: async (page) => {
      const toolsTab = page.locator("button:has-text('Tools')").first();
      if (await toolsTab.count()) await toolsTab.click().catch(() => {});
      await page.waitForTimeout(400);
      const exportSection = page.locator("text=Export, text=Markdown").first();
      if (await exportSection.count()) await exportSection.scrollIntoViewIfNeeded().catch(() => {});
      await page.waitForTimeout(500);
    }, waitMs: 300 },

  { out: "35-import-folder-en.png", route: "/import", waitFor: "text=arXiv ID",
    action: async (page) => {
      await page.locator("button:has-text('PDF file')").first().click();
      await page.waitForTimeout(400);
      const folderBtn = page.locator("button:has-text('Import folder'), button:has-text('Folder')").first();
      if (await folderBtn.count()) await folderBtn.click().catch(() => {});
      await page.waitForTimeout(500);
    }, waitMs: 300 },

  { out: "36-reader-note-sections-en.png", route: "/reader/01KSCN65XF4B2PZ83D27ET55PX", waitFor: "text=Highlights",
    action: async (page) => {
      await page.waitForTimeout(2000);
      const notesTab = page.getByRole("button", { name: "Notes", exact: true }).first();
      if (await notesTab.count()) await notesTab.click().catch(() => {});
      else { await page.locator("button:has-text('Notes')").first().click().catch(() => {}); }
      await page.waitForTimeout(800);
      const sections = page.locator("text=Quick Read, text=Key Numbers, text=Method Notes, text=To-Do");
      if (await sections.count()) await sections.first().scrollIntoViewIfNeeded().catch(() => {});
      await page.waitForTimeout(500);
    }, waitMs: 400 },
];
