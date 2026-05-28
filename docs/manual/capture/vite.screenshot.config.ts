import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

// Vite config used ONLY for screenshot capture. It aliases the four
// @tauri-apps modules onto the in-process mock so every invoke() resolves
// to seeded sample data. The main app (pnpm tauri dev / build) does not
// see this config.
const ROOT = path.resolve(__dirname, "../../..");
const MOCK = process.env.LANG_EN
  ? path.resolve(__dirname, "./mock-tauri-en.ts")
  : path.resolve(__dirname, "./mock-tauri.ts");

export default defineConfig({
  root: ROOT,
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(ROOT, "src"),
      "@tauri-apps/api/core": MOCK,
      "@tauri-apps/api/event": MOCK,
      "@tauri-apps/plugin-dialog": MOCK,
      "@tauri-apps/plugin-shell": MOCK,
    },
  },
  css: {
    postcss: ROOT, // explicit: read postcss.config.js from project root
  },
  publicDir: path.resolve(__dirname, "public"),
  clearScreen: false,
  server: { port: 5179, strictPort: true, watch: { ignored: ["**/src-tauri/**", "**/.git/**"] } },
});

