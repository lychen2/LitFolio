#!/usr/bin/env node

import { accessSync, constants } from "node:fs";
import { chromium } from "@playwright/test";

const executablePath = chromium.executablePath();

try {
  accessSync(executablePath, constants.X_OK);
} catch {
  console.error(
    [
      "Playwright Chromium is not installed or executable.",
      "Run: pnpm exec playwright install --with-deps chromium",
      `Expected browser executable: ${executablePath}`,
    ].join("\n"),
  );
  process.exit(1);
}
