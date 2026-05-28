// Drive Playwright over the LitFolio frontend to produce 18 manual screenshots.
//
//   1. Spawn vite (alias-swapped to mock Tauri IPC) on :5179.
//   2. Launch Chromium, navigate per ROUTES, screenshot to docs/manual/figures.
//   3. Tear everything down.

import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { mkdirSync, existsSync } from "node:fs";
import { ROUTES } from "./routes.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../../..");
const FIG = resolve(__dirname, "../figures");
const KEEP_VITE = process.env.KEEP_VITE === "1";

mkdirSync(FIG, { recursive: true });

console.log("[capture] starting vite (mock-tauri-aliased) on :5179");
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
  console.log(`[capture] ${item.out} → ${url}`);
  await page.goto(url, { waitUntil: "domcontentloaded" });
  if (item.waitFor) {
    await page.waitForSelector(item.waitFor, { timeout: 10000 }).catch((e) => {
      console.warn(`[capture] selector wait failed (${item.waitFor}):`, e.message);
    });
  }
  await sleep(item.waitMs ?? 400);
  if (item.action) {
    try {
      await item.action(page);
    } catch (e) {
      console.warn(`[capture] action threw on ${item.out}:`, e.message);
    }
  }
  // Last yield so React state batches settle.
  await sleep(120);
  await page.screenshot({ path: resolve(FIG, item.out), fullPage: false });
}

async function main() {
  await waitForReady();
  console.log("[capture] vite ready");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    colorScheme: "dark",
    locale: "zh-CN",
  });
  const page = await context.newPage();
  page.on("pageerror", (e) => console.error("[page-error]", e.message));
  page.on("console", (msg) => {
    if (msg.type() === "error" && !msg.text().includes("[mock-tauri]")) {
      console.warn("[console]", msg.text().slice(0, 200));
    }
  });

  // Visit root once to establish origin, then seed localStorage to dismiss
  // any first-run modals (reader onboarding, etc.) before screenshots.
  await page.goto("http://localhost:5179/", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => {
    try { localStorage.setItem("litera.reader.onboarded", "1"); } catch {}
  });

  for (const item of ROUTES) {
    if (process.env.ONLY && !item.out.includes(process.env.ONLY)) continue;
    try {
      await shoot(page, item);
    } catch (e) {
      console.error(`[capture] failed ${item.out}:`, e.message);
    }
  }
  await browser.close();
  if (!KEEP_VITE) viteProc.kill();
  console.log(`[capture] done → ${FIG}`);
}

main().catch((e) => {
  console.error(e);
  viteProc.kill();
  process.exit(1);
});
