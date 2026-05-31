import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

const host = process.env.TAURI_DEV_HOST;
const isE2e = process.env.LITERA_E2E === "1";

export default defineConfig(async () => ({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      ...(isE2e
        ? { "@tauri-apps/api/core": path.resolve(__dirname, "./src/test/tauriCoreMock.ts") }
        : {}),
    },
  },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? { protocol: "ws", host, port: 1421 }
      : undefined,
    watch: { ignored: ["**/src-tauri/**"] },
  },
  test: {
    exclude: ["e2e/**", "dist/**", "node_modules/**", "src-tauri/target/**"],
  },
}));
