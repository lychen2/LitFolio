// English screenshot capture script.
// Same as capture.mjs but uses English routes, English locale, and outputs with -en suffix.

import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { mkdirSync } from "node:fs";
import { ROUTES } from "./routes-en.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../../..");
const FIG = resolve(__dirname, "../figures");
const KEEP_VITE = process.env.KEEP_VITE === "1";

mkdirSync(FIG, { recursive: true });

// Set LANG_EN so vite.screenshot.config.ts picks mock-tauri-en.ts
process.env.LANG_EN = "1";

console.log("[capture-en] starting vite (mock-tauri-en-aliased) on :5179");
const viteProc = spawn(
  resolve(ROOT, "node_modules/.bin/vite"),
  ["--config", resolve(__dirname, "vite.screenshot.config.ts")],
  { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"], env: process.env },
);
viteProc.stdout.on("data", (d) => process.stdout.write(`[vite] ${d}`));
viteProc.stderr.on("data", (d) => process.stderr.write(`[vite] ${d}`));

async function waitForReady() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch("http://localhost:5179/");
      if (r.ok) return;
    } catch {}
    await sleep(500);
  }
  throw new Error("vite did not become ready");
}

async function shoot(page, item) {
  const url = `http://localhost:5179${item.route}`;
  console.log(`[capture-en] ${item.out} → ${url}`);
  await page.goto(url, { waitUntil: "domcontentloaded" });
  if (item.waitFor) {
    await page.waitForSelector(item.waitFor, { timeout: 10000 }).catch((e) => {
      console.warn(`[capture-en] selector wait failed (${item.waitFor}):`, e.message);
    });
  }
  await sleep(item.waitMs ?? 400);
  if (item.action) {
    try {
      await item.action(page);
    } catch (e) {
      console.warn(`[capture-en] action threw on ${item.out}:`, e.message);
    }
  }
  await sleep(120);
  await page.screenshot({ path: resolve(FIG, item.out), fullPage: false });
}

async function main() {
  await waitForReady();
  console.log("[capture-en] vite ready");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    colorScheme: "dark",
    locale: "en",
  });
  const page = await context.newPage();
  page.on("pageerror", (e) => console.error("[page-error]", e.message));
  page.on("console", (msg) => {
    if (msg.type() === "error" && !msg.text().includes("[mock-tauri]")) {
      console.warn("[console]", msg.text().slice(0, 200));
    }
  });

  await page.goto("http://localhost:5179/", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => {
    try { localStorage.setItem("litera.reader.onboarded", "1"); } catch {}
  });

  for (const item of ROUTES) {
    if (process.env.ONLY && !item.out.includes(process.env.ONLY)) continue;
    try {
      await shoot(page, item);
    } catch (e) {
      console.error(`[capture-en] failed ${item.out}:`, e.message);
    }
  }
  await browser.close();
  if (!KEEP_VITE) viteProc.kill();
  console.log(`[capture-en] done → ${FIG}`);
}

main().catch((e) => {
  console.error(e);
  viteProc.kill();
  process.exit(1);
});
