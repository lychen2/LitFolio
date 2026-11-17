import { expect, test } from "@playwright/test";

test("reads local source, explicitly generates a translation, and compares the PDF", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.addInitScript(() => {
    localStorage.setItem("litfolio.lang", "en");
    localStorage.setItem("litera.onboarding.completed", "1");
  });
  await page.goto("/reader/paper-reader");
  const onboarding = page.getByRole("dialog", { name: "Reading workspace" });
  await onboarding.getByRole("button", { name: "Got it" }).click();

  await expect(page.getByText("The original paragraph remains readable offline.")).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("reader-source.png") });

  await page.getByRole("button", { name: "Generate full translation" }).click();
  await expect(page.getByText("The translated paragraph can be compared with the original.")).toBeVisible();
  await page.getByRole("button", { name: "Side by side", exact: true }).click();
  await expect(page.getByRole("region", { name: "Original" }).getByText("The original paragraph remains readable offline.")).toBeVisible();
  await expect(page.getByRole("region", { name: "Translation" }).getByText("The translated paragraph can be compared with the original.")).toBeVisible();
  await page.getByRole("button", { name: "Original", exact: true }).click();
  await expect(page.getByText("The original paragraph remains readable offline.")).toBeVisible();
  await page.getByRole("button", { name: "Page 2" }).click();
  const secondPage = page.locator(".pdfViewer .page[data-page-number='2']");
  await expect(secondPage).toBeVisible();
  await expect.poll(() => secondPage.evaluate((element) => {
    const viewer = element.closest(".pdfViewer")?.parentElement;
    return viewer?.scrollTop ?? 0;
  })).toBeGreaterThan(0);
  await page.screenshot({ path: testInfo.outputPath("reader-pdf-comparison.png") });
  await page.getByRole("button", { name: "Collapse / expand notes panel" }).click();
  await expect(page.getByText("Reading Card", { exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: "PDF source", exact: true }).first().click();
  await expect(page.locator(".pdfViewer .page").first()).toBeVisible();
  await page.getByRole("button", { name: "Native reading", exact: true }).click();
  await expect(page.getByRole("button", { name: "Original", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("The original paragraph remains readable offline.")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1281);
});

test("keeps bilingual text and PDF controls usable in the compact reader", async ({ page }) => {
  await page.setViewportSize({ width: 960, height: 720 });
  await page.addInitScript(() => {
    localStorage.setItem("litfolio.lang", "en");
    localStorage.setItem("litera.onboarding.completed", "1");
  });
  await page.goto("/reader/paper-reader");
  await page.getByRole("dialog", { name: "Reading workspace" }).getByRole("button", { name: "Got it" }).click();
  await expect(page.getByText("The original paragraph remains readable offline.")).toBeVisible();
  await page.getByRole("button", { name: "Generate full translation" }).click();
  await page.getByRole("button", { name: "Side by side", exact: true }).click();
  await expect(page.getByRole("region", { name: "Original" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Translation" })).toBeVisible();
  await page.getByRole("button", { name: "Compare with PDF", exact: true }).click();
  await expect(page.locator(".pdfViewer .page[data-page-number='1']")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(961);
});

test("shows Chinese reading controls and opens source page two", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.addInitScript(() => {
    localStorage.setItem("litfolio.lang", "zh");
    localStorage.setItem("litera.onboarding.completed", "1");
  });
  await page.goto("/reader/paper-reader");
  await page.getByRole("dialog", { name: "阅读工作区" }).getByRole("button", { name: "知道了" }).click();
  await expect(page.getByRole("button", { name: "原文", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.screenshot({ path: testInfo.outputPath("reader-source-zh.png") });
  await page.getByRole("button", { name: "第 2 页" }).click();
  await expect(page.locator(".pdfViewer .page[data-page-number='2']")).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("reader-pdf-comparison-zh.png") });
});

test("opens a cached translation without making a model request", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("litfolio.lang", "en");
    localStorage.setItem("litera.onboarding.completed", "1");
  });
  await page.goto("/reader/paper-cached");
  await page.getByRole("dialog", { name: "Reading workspace" }).getByRole("button", { name: "Got it" }).click();
  await expect(page.getByText("The saved translation appears without another model call.")).toBeVisible();
  await expect(page.getByText("Cached English translation")).toBeVisible();
  await expect(page.getByRole("button", { name: "Translation", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Original", exact: true }).click();
  await expect(page.getByText("The original paragraph remains readable offline.")).toBeVisible();
});
