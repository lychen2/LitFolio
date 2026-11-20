import { expect, test } from "@playwright/test";
import { THEME_MODE_STORAGE_KEY } from "../src/lib/theme";
import type { LiteratureNetwork, LiteratureNetworkEdge, LiteratureNetworkNode } from "../src/features/literature-network/network";

const seedTitle = "Browser Smoke Paper";
const relatedTitle = "Related Network Paper";
const witnessTitle = "Common Reference Paper";

interface LayoutFrame {
  time: number;
  marks: { x: number; y: number }[];
}

declare global {
  interface Window {
    networkLayout: { frames: LayoutFrame[]; pending: Set<number>; cancelled: number };
  }
}

// Node and camera transforms share graph pixels. Reading their local matrices avoids a layout flush.
function graphPosition(mark: Element) {
  const paper = mark.parentElement;
  const camera = paper?.parentElement;
  if (!(paper instanceof SVGGElement) || !(camera instanceof SVGGElement)) throw new Error("Expected a positioned graph paper");
  const node = paper.transform.baseVal.getItem(0).matrix;
  const view = camera.transform.baseVal.getItem(0).matrix;
  return { x: node.e + view.e, y: node.f + view.f };
}

for (const mode of ["light", "dark"] as const) {
  test(`discovers and inspects paper relationships in ${mode} mode`, async ({ page }, testInfo) => {
    const narrow = mode === "dark";
    await page.setViewportSize(narrow ? { width: 390, height: 844 } : { width: 1440, height: 1040 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.addInitScript(({ mode, key }) => {
      localStorage.setItem("litfolio.lang", "en");
      localStorage.setItem("litera.onboarding.completed", "1");
      localStorage.setItem(key, mode);
    }, { mode, key: THEME_MODE_STORAGE_KEY });
    await page.goto("/literature-network");
    await expect(page.getByRole("heading", { name: "Literature network", level: 1 })).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("data-mode", mode);

    const seeds = page.getByRole("region", { name: "Seed papers" });
    const chooseSeed = seeds.getByRole("button", { name: seedTitle, exact: true });
    const discover = seeds.getByRole("button", { name: "Discover online" });
    const graph = page.getByRole("region", { name: "Paper relationships" });
    const papers = page.getByRole("region", { name: "Papers", exact: true });
    const evidence = page.getByRole("region", { name: "Relationship evidence" });
    const prior = page.getByRole("region", { name: "Prior works" });
    const subsequent = page.getByRole("region", { name: "Subsequent works" });
    const seedNode = graph.getByRole("button", { name: `Seed paper: ${seedTitle}`, exact: true });
    const relatedNode = graph.getByRole("button", { name: relatedTitle, exact: true });
    const pairEdge = graph.getByRole("button", { name: `${seedTitle} — Direct citation · Shared references — ${relatedTitle}`, exact: true });

    await expect(discover).toBeDisabled();
    await expect(seeds.getByText(/DOI, arXiv ID, or original title/)).toBeVisible();
    await expect(graph).toHaveCount(0);
    await chooseSeed.click();
    await expect(chooseSeed).toHaveAttribute("aria-pressed", "true");
    await discover.click();
    await expect(graph.getByRole("status").filter({ hasText: "1 relationship" })).toBeVisible();
    await expect(pairEdge).toHaveCount(1);
    await expect(graph.getByRole("button", { name: new RegExp(`${seedTitle} — .* — ${relatedTitle}`) })).toHaveCount(1);
    await expect(graph.getByRole("group", { name: "Publication year" }).locator("[title*='2025']")).toBeVisible();
    const relationshipLabels = graph.locator(".relationship-graph__legend > div:last-child > span");
    const labelMetrics = await relationshipLabels.evaluateAll((labels) => labels.map((label) => {
      const range = document.createRange();
      range.selectNodeContents(label.lastChild!);
      return { top: range.getBoundingClientRect().top, fontSize: getComputedStyle(label).fontSize };
    }));
    expect(new Set(labelMetrics.map((label) => label.fontSize)).size).toBe(1);
    if (!narrow) expect(Math.max(...labelMetrics.map((label) => label.top)) - Math.min(...labelMetrics.map((label) => label.top))).toBeLessThan(1);
    await expect(seedNode.locator("foreignObject").getByText(seedTitle, { exact: true })).toBeVisible();
    await expect(relatedNode.locator("foreignObject").getByText(relatedTitle, { exact: true })).toBeVisible();
    await expect(papers.getByRole("button", { name: new RegExp(relatedTitle) })).toBeVisible();
    await expect(prior.getByText(witnessTitle, { exact: true })).toBeVisible();
    await expect(subsequent.getByText(/No work cites at least two/)).toBeVisible();

    const controls = graph.getByRole("group", { name: "Graph controls" });
    await controls.getByRole("button", { name: "Zoom in" }).click();
    await expect(controls.getByText("150%", { exact: true })).toBeVisible();
    await controls.getByRole("button", { name: "Reset view" }).click();
    await expect(controls.getByText("100%", { exact: true })).toBeVisible();
    await graph.scrollIntoViewIfNeeded();
    expect(await graph.evaluate((element) => element.getBoundingClientRect().right)).toBeLessThanOrEqual(narrow ? 390 : 1440);

    const topic = graph.getByRole("combobox", { name: "Filter by topic" });
    await topic.selectOption({ label: "Reference Matching" });
    await expect(papers.getByRole("status")).toHaveText("Reference Matching · 1 paper");
    await expect(seedNode).toHaveCount(0);
    await expect(pairEdge).toHaveCount(0);
    await expect(graph.getByText("No relationships found between these papers.")).toBeVisible();
    if (narrow) await graph.screenshot({ path: testInfo.outputPath("narrow-zero-edges.png") });
    await topic.selectOption({ label: "All topics" });

    await relatedNode.press("Enter");
    await expect(relatedNode).toBeFocused();
    await expect(relatedNode).toHaveAttribute("aria-pressed", "true");
    await expect(seedNode).toHaveAttribute("data-state", "neighbor");
    await expect(evidence.getByRole("heading", { name: relatedTitle })).toBeVisible();
    const neighbor = evidence.getByRole("button", { name: new RegExp(seedTitle) });
    await expect(neighbor).toHaveCount(1);
    await expect(neighbor.getByText(seedTitle, { exact: true })).toHaveCount(1);
    await expect(neighbor).toContainText("Cited by · Shared references");
    if (narrow) {
      await graph.screenshot({ path: testInfo.outputPath("narrow-dark.png") });
      await graph.getByRole("button", { name: "View selected evidence" }).click();
      await expect(evidence.getByRole("heading", { name: "Relationship evidence" })).toBeFocused();
      await expect(evidence).toBeInViewport();
      await evidence.screenshot({ path: testInfo.outputPath("narrow-dark-evidence.png") });
    }

    await neighbor.click();
    await expect(evidence.getByRole("heading", { name: "Shared references", exact: true })).toBeVisible();
    await expect(evidence.getByRole("heading", { name: "Direct citation", exact: true })).toBeVisible();
    await expect(evidence.getByText(`${seedTitle} cites ${relatedTitle}`, { exact: true })).toBeVisible();
    await expect(evidence.getByRole("link", { name: witnessTitle })).toHaveAttribute("href", "https://openalex.org/W3");

    await evidence.getByRole("button", { name: `Back to ${relatedTitle}` }).click();
    await pairEdge.scrollIntoViewIfNeeded();
    const directPoint = await pairEdge.evaluate((path) => {
      if (!(path instanceof SVGPathElement)) throw new Error("Expected a graph edge");
      const matrix = path.getScreenCTM();
      if (!matrix) throw new Error("The graph edge is not rendered");
      const point = path.getPointAtLength(path.getTotalLength() / 4).matrixTransform(matrix);
      return { x: point.x, y: point.y };
    });
    await page.mouse.click(directPoint.x, directPoint.y);
    await expect(pairEdge).toHaveAttribute("aria-pressed", "true");
    await expect(evidence.getByText(`${seedTitle} cites ${relatedTitle}`, { exact: true })).toBeVisible();
    await expect(evidence.getByRole("link", { name: relatedTitle })).toHaveAttribute("href", "https://openalex.org/W2");

    await evidence.getByRole("button", { name: `Back to ${relatedTitle}` }).click();
    await pairEdge.focus();
    await page.keyboard.press("Enter");
    await expect(pairEdge).toHaveAttribute("aria-pressed", "true");
    if (!narrow) await page.screenshot({ path: testInfo.outputPath("desktop-light-evidence.png") });
    const translate = graph.getByRole("button", { name: "Translate titles" });
    const showOriginal = graph.getByRole("button", { name: "Show original titles" });
    await translate.click();
    await expect(showOriginal).toHaveAttribute("aria-pressed", "true");
    await expect(graph.getByRole("button", { name: "相关网络论文", exact: true })).toBeVisible();
    await expect(graph.getByRole("button", { name: /浏览器测试论文 — Direct citation · Shared references — 相关网络论文/ })).toHaveAttribute("aria-pressed", "true");
    await expect(papers.getByRole("button", { name: /相关网络论文/ })).toBeVisible();
    await expect(evidence.getByRole("link", { name: "共同参考文献" })).toHaveAttribute("href", "https://openalex.org/W3");
    await expect(prior.getByText("共同参考文献", { exact: true })).toBeVisible();
    await expect(seeds.getByText(seedTitle, { exact: true })).toBeVisible();
    await showOriginal.click();
    await expect(translate).toHaveAttribute("aria-pressed", "false");
    await expect(evidence.getByRole("link", { name: witnessTitle })).toBeVisible();

    await prior.getByText(witnessTitle, { exact: true }).click();
    await prior.getByRole("button", { name: seedTitle, exact: true }).click();
    await expect(seedNode).toHaveAttribute("aria-pressed", "true");
    await expect(evidence.getByRole("link", { name: "Open in reader" })).toHaveAttribute("href", "/reader/paper-1");
    await translate.click();
    await expect(evidence.getByRole("heading", { name: "浏览器测试论文" })).toBeVisible();
    await expect(evidence.getByRole("link", { name: "Open in reader" })).toHaveAttribute("href", "/reader/paper-1");
    await showOriginal.click();
    await expect(evidence.getByRole("heading", { name: seedTitle })).toBeVisible();
    await seeds.getByRole("button", { name: `Remove ${seedTitle}` }).click();
    await expect(discover).toBeDisabled();
    await expect(graph).toHaveCount(0);
  });
}

test.describe("dense relationship graph", () => {
  test.use({ hasTouch: true });

  test("animates and settles the real route while preserving graph interactions", async ({ page }, testInfo) => {
    function trackLayout(position: typeof graphPosition) {
      const request = window.requestAnimationFrame.bind(window);
      const cancel = window.cancelAnimationFrame.bind(window);
      const layout = { frames: [] as LayoutFrame[], pending: new Set<number>(), cancelled: 0 };
      window.networkLayout = layout;
      // Track only graph frames, excluding unrelated callbacks from the app shell and test runner.
      window.requestAnimationFrame = (callback) => {
        if (callback.name !== "advanceLayout") return request(callback);
        const handle = request((time) => {
          layout.pending.delete(handle);
          const marks = [...document.querySelectorAll(".relationship-graph__mark")].map(position);
          layout.frames.push({ time, marks });
          callback(time);
        });
        layout.pending.add(handle);
        return handle;
      };
      window.cancelAnimationFrame = (handle) => {
        if (layout.pending.delete(handle)) layout.cancelled++;
        cancel(handle);
      };
    }
    await page.addInitScript({ content: `(${trackLayout.toString()})(${graphPosition.toString()});` });
    const longZh = "结合稀疏文献图与语义检索的跨学科引文证据追踪及其在长篇科学论文中的应用";
    const longEn = "Tracing Cross-Disciplinary Citation Evidence in Long Scientific Papers with Sparse Bibliographic Graphs";
    const nodes: LiteratureNetworkNode[] = Array.from({ length: 30 }, (_, index) => ({
      id: `W${100 + index}`,
      title: index === 0 ? seedTitle : `${index % 2 === 0 ? longEn : longZh} ${index}`,
      authors: ["Ada Lovelace", "Grace Hopper"],
      year: 2008 + index % 18,
      venue: "Journal of Bibliographic Research",
      doi: null,
      arxivId: null,
      url: `https://openalex.org/W${100 + index}`,
      libraryPaperId: index === 0 ? "paper-1" : null,
      isSeed: index === 0,
      groupId: `T${Math.floor(index / 10)}`,
      citationCount: 670 - index * 23,
      score: 30 - index,
    }));
    const edges: LiteratureNetworkEdge[] = [];
    for (let index = 0; index < nodes.length; index++) {
      for (const distance of [1, 2, 4]) {
        const other = index + distance;
        if (other >= nodes.length || (distance !== 1 && Math.floor(index / 10) !== Math.floor(other / 10))) continue;
        const source = nodes[index].id;
        const target = nodes[other].id;
        edges.push({ source, target, kind: "shared_reference", evidence: [{ id: "W201", title: "Shared foundation", url: "https://openalex.org/W201" }] });
        if (index % 3 === 0 && distance === 1) {
          edges.push({ source, target, kind: "co_citation", evidence: [{ id: "W202", title: "Joint follow-up", url: "https://openalex.org/W202" }] });
        }
      }
    }
    const result: LiteratureNetwork = {
      nodes, edges, unresolvedSeedIds: [],
      groups: Array.from({ length: 3 }, (_, index) => ({
        id: `T${index}`, label: `Topic ${index + 1}`, nodeIds: nodes.filter((node) => node.groupId === `T${index}`).map(({ id }) => id),
      })),
    };
    await page.addInitScript(({ key }) => {
      localStorage.setItem("litfolio.lang", "en");
      localStorage.setItem("litera.onboarding.completed", "1");
      localStorage.setItem(key, "light");
    }, { key: THEME_MODE_STORAGE_KEY });
    // Override only the transport for this case. The real route, parser and hooks still run.
    await page.route((url) => url.pathname.endsWith("/src/test/tauriCoreMock.ts") && !url.searchParams.has("denseOriginal"), async (route) => {
      const original = new URL(route.request().url());
      original.searchParams.set("denseOriginal", "1");
      await route.fulfill({ contentType: "application/javascript", body: `
        export * from ${JSON.stringify(original.href)};
        import { invoke as invokeOriginal } from ${JSON.stringify(original.href)};
        let translationAttempts = 0;
        export async function invoke(command, args) {
          if (command === "literature_network") {
            if (JSON.stringify(args.paperIds) !== '["paper-1"]') throw new Error("Wrong discovery seed ID");
            return ${JSON.stringify(result)};
          }
          if (command === "literature_network_translate_titles") {
            if (++translationAttempts === 1) throw new Error("Test translation unavailable");
            return args.titles.map((title) => "译文 · " + title);
          }
          return invokeOriginal(command, args);
        }
      ` });
    });
    await page.setViewportSize({ width: 1440, height: 1040 });
    await page.goto("/literature-network");
    const seeds = page.getByRole("region", { name: "Seed papers" });
    await seeds.getByRole("button", { name: seedTitle, exact: true }).click();
    await seeds.getByRole("button", { name: "Discover online" }).click();

    const graph = page.getByRole("region", { name: "Paper relationships" });
    const svg = graph.locator(".relationship-graph__svg");
    const controls = graph.getByRole("group", { name: "Graph controls" });
    const reset = controls.getByRole("button", { name: "Reset view" });
    const evidence = page.getByRole("region", { name: "Relationship evidence" });
    const seed = graph.getByRole("button", { name: `Seed paper: ${seedTitle}`, exact: true });
    const other = graph.getByRole("button", { name: nodes[1].title, exact: true });
    const seedMark = seed.locator(".relationship-graph__mark");
    const otherMark = other.locator(".relationship-graph__mark");
    const nodeMarks = svg.locator(".relationship-graph__mark");
    const labels = svg.locator("foreignObject");
    await expect(nodeMarks).toHaveCount(30);
    await expect(graph.locator(".relationship-graph__legend > div")).toHaveCount(3);
    const yearEntries = page.locator(".relationship-graph__years span[title]");
    await expect(yearEntries).toHaveText(["Early", "Middle", "Latest"]);
    expect(await yearEntries.evaluateAll((entries) => entries.map((entry) => entry.title))).toEqual(["2008–2013 (12)", "2014–2019 (12)", "2020–2025 (6)"]);
    await expect(page.getByRole("region", { name: "Papers", exact: true }).getByRole("status")).toHaveText("30 papers");
    await expect(reset).toBeDisabled();
    const pendingFrames = () => page.evaluate(() => window.networkLayout.pending.size);
    const frames = () => page.evaluate(() => window.networkLayout.frames);
    const waitForPaint = () => page.evaluate(async () => {
      const { promise, resolve } = Promise.withResolvers<void>();
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      await promise;
    });
    const settle = async () => {
      await expect.poll(pendingFrames).toBe(0);
      await waitForPaint();
    };
    const spanX = (marks: LayoutFrame["marks"]) => Math.max(...marks.map(({ x }) => x)) - Math.min(...marks.map(({ x }) => x));
    const displacement = (before: LayoutFrame["marks"][number], after: LayoutFrame["marks"][number]) => Math.hypot(after.x - before.x, after.y - before.y);
    await expect.poll(async () => (await frames()).length).toBeGreaterThan(10);
    await settle();
    const opening = await frames();
    expect(opening.every(({ marks }) => marks.length === nodes.length)).toBe(true);
    const distinctOpeningFrames = new Set(opening.map(({ marks }) => JSON.stringify(marks))).size;
    expect(distinctOpeningFrames).toBeGreaterThan(10);
    const firstSpan = spanX(opening[0].marks);
    const lastSpan = spanX(opening[opening.length - 1].marks);
    expect(lastSpan).toBeGreaterThan(firstSpan * 1.25);
    const openingDuration = opening[opening.length - 1].time - opening[0].time;
    const frameIntervals = opening.slice(1).map(({ time }, i) => time - opening[i].time).sort((a, b) => a - b);
    const frameIntervalP95 = frameIntervals[Math.floor(frameIntervals.length * 0.95)];
    await waitForPaint();
    expect((await frames()).length).toBe(opening.length);

    const center = async (mark: typeof seedMark) => {
      const box = await mark.boundingBox();
      if (!box) throw new Error("Paper mark unavailable");
      return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    };
    const position = async (mark: typeof seedMark) => mark.evaluate(graphPosition);
    const labelOffset = async () => seed.evaluate((paper) => {
      const label = paper.querySelector("foreignObject");
      if (!label) throw new Error("Seed label missing");
      return [Number(label.getAttribute("x")), Number(label.getAttribute("y"))];
    });
    const drag = async (point: { x: number; y: number }, dx: number, dy: number) => {
      await page.mouse.move(point.x, point.y);
      await page.mouse.down();
      await page.mouse.move(point.x + dx, point.y + dy, { steps: 8 });
      await page.mouse.up();
    };
    const dims = await svg.boundingBox();
    if (!dims) throw new Error("Graph unavailable");
    const blank = { x: dims.x + 12, y: dims.y + 17 };
    const start = await position(seedMark);
    const otherStart = await position(otherMark);
    const labelStart = await labelOffset();
    const overviewLabels = await labels.count();
    expect(overviewLabels).toBeGreaterThan(2);
    expect(overviewLabels).toBeLessThan(15);
    await page.screenshot({ path: testInfo.outputPath("dense-overview.png") });

    await drag(blank, 78, 46);
    const panned = await position(seedMark);
    const pan = { x: panned.x - start.x, y: panned.y - start.y };
    expect(pan.x).toBeCloseTo(78, 1);
    expect(pan.y).toBeCloseTo(46, 1);
    await expect(controls.getByText("100%", { exact: true })).toBeVisible();
    await reset.click();
    expect(await position(seedMark)).toEqual(start);

    const seedCenter = await center(seedMark);
    const dragFrameStart = (await frames()).length;
    await page.mouse.move(seedCenter.x, seedCenter.y);
    await page.mouse.down();
    await page.mouse.move(seedCenter.x + 92, seedCenter.y - 38, { steps: 8 });
    const held = await position(seedMark);
    const nodeDrag = { x: held.x - start.x, y: held.y - start.y };
    expect(nodeDrag.x).toBeCloseTo(92, 1);
    expect(nodeDrag.y).toBeCloseTo(-38, 1);
    await expect.poll(async () => displacement(otherStart, await position(otherMark))).toBeGreaterThan(8);
    const neighborDisplacement = displacement(otherStart, await position(otherMark));
    expect((await frames()).length - dragFrameStart).toBeGreaterThan(1);
    expect(await position(seedMark)).toEqual(held);
    const heldLabel = await labelOffset();
    expect(heldLabel[0]).toBeCloseTo(labelStart[0], 3);
    expect(heldLabel[1]).toBeCloseTo(labelStart[1], 3);
    await graph.screenshot({ path: testInfo.outputPath("dense-drag-held.png") });
    const releaseFrameStart = (await frames()).length;
    await page.mouse.up();
    await expect.poll(async () => (await frames()).length - releaseFrameStart).toBeGreaterThan(1);
    await settle();
    const moved = await position(seedMark);
    const releasedDisplacement = displacement(held, moved);
    expect(releasedDisplacement).toBeGreaterThan(10);
    const releasedFrames = (await frames()).length - releaseFrameStart;
    await waitForPaint();
    expect(await pendingFrames()).toBe(0);
    expect((await frames()).length).toBe(releaseFrameStart + releasedFrames);
    await expect(seed).toHaveAttribute("aria-pressed", "false");
    await expect(evidence).toHaveCount(0);

    const newCenter = await center(seedMark);
    await page.mouse.click(newCenter.x, newCenter.y);
    await expect(seed).toHaveAttribute("aria-pressed", "true");
    const neighbor = evidence.getByRole("button", { name: new RegExp(nodes[1].title) });
    await expect(neighbor).toHaveCount(1);
    await expect(neighbor).toContainText("Shared references · Co-citation");
    await neighbor.click();
    await expect(evidence.getByRole("link", { name: "Shared foundation" })).toHaveAttribute("href", "https://openalex.org/W201");
    await expect(evidence.getByRole("link", { name: "Joint follow-up" })).toHaveAttribute("href", "https://openalex.org/W202");

    await graph.getByRole("button", { name: "Translate titles" }).click();
    await expect(graph.getByRole("alert")).toContainText("Test translation unavailable");
    await expect(evidence.getByRole("link", { name: "Joint follow-up" })).toBeVisible();
    await graph.getByRole("button", { name: "Retry translation" }).click();
    const translatedSeed = graph.getByRole("button", { name: `Seed paper: 译文 · ${seedTitle}`, exact: true });
    const translatedMark = translatedSeed.locator(".relationship-graph__mark");
    await expect(translatedMark).toBeVisible();
    await expect(graph.getByRole("alert")).toHaveCount(0);
    expect(await position(translatedMark)).toEqual(moved);
    await expect(evidence.getByRole("link", { name: "译文 · Joint follow-up" })).toBeVisible();
    await graph.getByRole("button", { name: "Show original titles" }).click();
    expect(await position(seedMark)).toEqual(moved);
    await reset.click();
    expect(await position(seedMark)).toEqual(start);

    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ ...blank, id: 1 }] });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: blank.x + 53, y: blank.y + 34, id: 1 }] });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    const touched = await position(seedMark);
    const touchPan = { x: touched.x - start.x, y: touched.y - start.y };
    expect(touchPan.x).toBeCloseTo(53, 1);
    expect(touchPan.y).toBeCloseTo(34, 1);
    await reset.click();

    const touchY = dims.y + 100;
    const touchX = dims.x + dims.width / 2;
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: touchX - 40, y: touchY, id: 1 }, { x: touchX + 40, y: touchY, id: 2 }] });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: touchX - 75, y: touchY, id: 1 }, { x: touchX + 75, y: touchY, id: 2 }] });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await expect(controls.getByText("188%", { exact: true })).toBeVisible();
    await reset.click();

    const wheelAnchor = await center(otherMark);
    await page.mouse.move(wheelAnchor.x, wheelAnchor.y);
    await page.mouse.wheel(0, -260);
    await expect(controls.getByText("168%", { exact: true })).toBeVisible();
    const afterWheel = await center(otherMark);
    const wheelAnchorError = Math.hypot(afterWheel.x - wheelAnchor.x, afterWheel.y - wheelAnchor.y);
    // Chromium delivers the mouse position in whole CSS pixels.
    expect(wheelAnchorError).toBeLessThan(1);
    const zoomedLabels = await labels.count();
    expect(zoomedLabels).toBeGreaterThan(overviewLabels);
    await reset.click();
    await otherMark.tap();
    await expect(other).toHaveAttribute("aria-pressed", "true");
    await expect(evidence.getByRole("heading", { name: nodes[1].title, exact: true })).toBeVisible();

    const gap = await graph.evaluate((map) => {
      const legend = map.querySelector(".relationship-graph__legend");
      const perspectives = map.parentElement?.querySelector(".literature-network__perspectives");
      if (!legend || !perspectives) throw new Error("Missing result sections");
      return perspectives.getBoundingClientRect().top - legend.getBoundingClientRect().bottom;
    });
    expect(gap).toBeLessThanOrEqual(18);
    const side = page.locator(".literature-network__side");
    const scroll = await side.evaluate((element) => {
      const pageOffset = element.closest(".literature-network__body")?.scrollTop;
      element.scrollTop = 300;
      return { height: element.clientHeight, content: element.scrollHeight, moved: element.scrollTop,
        pageMoved: element.closest(".literature-network__body")?.scrollTop !== pageOffset };
    });
    expect(scroll.content).toBeGreaterThan(scroll.height);
    expect(scroll.moved).toBe(300);
    expect(scroll.pageMoved).toBe(false);
    await side.evaluate((element) => { element.scrollTop = 0; });
    await page.screenshot({ path: testInfo.outputPath("dense-selected.png") });

    // Remove the graph while a drag has a frame queued, then recreate it with reduced motion.
    await svg.scrollIntoViewIfNeeded();
    const activeCenter = await center(seedMark);
    await page.mouse.move(activeCenter.x, activeCenter.y);
    await page.mouse.down();
    await page.mouse.move(activeCenter.x + 45, activeCenter.y + 25);
    expect(await pendingFrames()).toBe(1);
    const cancelledBefore = await page.evaluate(() => window.networkLayout.cancelled);
    await seeds.getByRole("button", { name: `Remove ${seedTitle}` }).evaluate((button) => {
      if (!(button instanceof HTMLButtonElement)) throw new Error("Cannot remove seed");
      button.click();
    });
    await page.mouse.up();
    await expect(svg).toHaveCount(0);
    expect(await pendingFrames()).toBe(0);
    const cancelledOnLeave = await page.evaluate(() => window.networkLayout.cancelled) - cancelledBefore;
    expect(cancelledOnLeave).toBe(1);

    await page.emulateMedia({ reducedMotion: "reduce" });
    await seeds.getByRole("button", { name: "Choose from library" }).click();
    await seeds.getByRole("button", { name: seedTitle, exact: true }).click();
    const reducedFrameStart = (await frames()).length;
    await seeds.getByRole("button", { name: "Discover online" }).click();
    await expect(nodeMarks).toHaveCount(30);
    await svg.scrollIntoViewIfNeeded();
    await waitForPaint();
    const reduced = await position(seedMark);
    expect(reduced).toEqual(start);
    expect(await pendingFrames()).toBe(0);
    expect((await frames()).length).toBe(reducedFrameStart);
    await graph.screenshot({ path: testInfo.outputPath("dense-reduced-motion.png") });
    const reducedCenter = await center(seedMark);
    await page.mouse.move(reducedCenter.x, reducedCenter.y);
    await page.mouse.down();
    await page.mouse.move(reducedCenter.x + 55, reducedCenter.y - 24);
    const reducedHeld = await position(seedMark);
    expect(displacement(reduced, reducedHeld)).toBeGreaterThan(50);
    await page.mouse.up();
    await waitForPaint();
    expect(displacement(reducedHeld, await position(seedMark))).toBeGreaterThan(10);
    expect(await pendingFrames()).toBe(0);
    const reducedFrames = (await frames()).length - reducedFrameStart;
    expect(reducedFrames).toBe(0);
    const metrics = { nodes: nodes.length, relationshipPairs: new Set(edges.map(({ source, target }) => `${source}-${target}`)).size,
      edges: edges.length, distinctOpeningFrames, firstSpan, lastSpan, openingDuration, frameIntervalP95,
      pan, nodeDrag, neighborDisplacement, releasedDisplacement, releasedFrames, cancelledOnLeave, reducedFrames,
      touchPan, pinch: "188%", wheel: "168%", wheelAnchorError, overviewLabels, zoomedLabels, gap, scroll };
    await testInfo.attach("dense-measurements", { body: JSON.stringify(metrics, null, 2), contentType: "application/json" });
    console.log(`Dense graph measurements: ${JSON.stringify(metrics)}`);
  });
});
