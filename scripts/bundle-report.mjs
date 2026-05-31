import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

const ASSETS_DIR = join(process.cwd(), "dist", "assets");
const TOP_COUNT = 20;

function main() {
  const assets = readAssets();
  const scripts = assets.filter((asset) => asset.name.endsWith(".js") || asset.name.endsWith(".mjs"));
  const styles = assets.filter((asset) => asset.name.endsWith(".css"));
  printSection("Largest script chunks", scripts, TOP_COUNT);
  printSection("CSS chunks", styles, TOP_COUNT);
  printRouteSignals(scripts);
}

function readAssets() {
  try {
    return readdirSync(ASSETS_DIR)
      .map((name) => assetStats(name))
      .sort((a, b) => b.bytes - a.bytes);
  } catch (error) {
    throw new Error(`Bundle report needs a completed Vite build at ${ASSETS_DIR}: ${error.message}`);
  }
}

function assetStats(name) {
  const path = join(ASSETS_DIR, name);
  const bytes = statSync(path).size;
  const gzipBytes = gzipSync(readFileSync(path)).length;
  return { name, bytes, gzipBytes };
}

function printSection(title, assets, limit) {
  console.log(`\n${title}`);
  for (const asset of assets.slice(0, limit)) {
    console.log(`${pad(formatBytes(asset.bytes), 10)} ${pad(formatBytes(asset.gzipBytes), 10)} gzip  ${asset.name}`);
  }
}

function printRouteSignals(scripts) {
  const routeChunks = ["ReaderPage", "GraphPage", "MarkdownView", "pdf.worker"];
  console.log("\nRoute/lazy-load signals");
  for (const signal of routeChunks) {
    const hit = scripts.find((asset) => asset.name.includes(signal));
    const size = hit ? `${formatBytes(hit.bytes)} / ${formatBytes(hit.gzipBytes)} gzip` : "missing";
    console.log(`${pad(signal, 14)} ${size}`);
  }
}

function formatBytes(bytes) {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(2)} MiB`;
  return `${(bytes / 1024).toFixed(1)} KiB`;
}

function pad(value, length) {
  return String(value).padStart(length);
}

main();
