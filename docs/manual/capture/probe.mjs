import { chromium } from "playwright";
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, colorScheme: "dark", locale: "zh-CN" });
const page = await ctx.newPage();
page.on("pageerror", (e) => console.error("[err]", e.message));
await page.goto("http://localhost:5179/", { waitUntil: "domcontentloaded" });
await page.evaluate(() => { try { localStorage.setItem("litera.reader.onboarded", "1"); } catch {} });
await page.goto("http://localhost:5179/reader/01KSCN65XF4B2PZ83D27ET55PX");
await page.waitForSelector("text=高亮", { timeout: 10000 });
await page.waitForSelector(".textLayer", { state: "attached", timeout: 10000 });
await page.waitForTimeout(3000);
const info = await page.evaluate(() => {
  const pages = Array.from(document.querySelectorAll(".page"));
  const layers = Array.from(document.querySelectorAll(".textLayer"));
  const sample = pages.slice(0, 2).map((p) => ({
    dataPageNumber: p.getAttribute("data-page-number"),
    children: Array.from(p.children).map((c) => c.className),
    rect: { ...p.getBoundingClientRect().toJSON?.() ?? {}, w: p.getBoundingClientRect().width, h: p.getBoundingClientRect().height, t: p.getBoundingClientRect().top, l: p.getBoundingClientRect().left },
  }));
  const layerSamples = layers.slice(0, 2).map((l) => ({
    parent: l.parentElement?.className,
    parentPageNum: l.parentElement?.getAttribute?.("data-page-number"),
    spanCount: l.querySelectorAll("span").length,
  }));
  return { pageCount: pages.length, layerCount: layers.length, samplePages: sample, layerSamples };
});
console.log(JSON.stringify(info, null, 2));
await browser.close();
