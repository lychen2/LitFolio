import { expect, test, type Frame, type Page } from "@playwright/test";

/**
 * The reader route renders the hosted EasyRead page from a loopback service the
 * Rust side spawns. The browser harness has no Rust side, so the reading-service
 * mock answers with a fixed loopback origin and this spec serves that origin
 * itself. What is under test is the host contract: what the frame is asked to
 * load, what the host publishes into it, and what the host does with the
 * messages it sends back.
 */
const SERVICE_ORIGIN = "http://127.0.0.1:9";

const HOST_PAGE = `<!doctype html>
<html lang="zh-CN">
<head><meta charset="utf-8"><title>LitFolio</title></head>
<body>
<p id="upstream">Upstream reader fixture</p>
<script>
  window.__hostMessages = [];
  window.addEventListener("message", (event) => { window.__hostMessages.push(event.data); });
  window.__emit = (message) => parent.postMessage(
    Object.assign({ source: "litfolio-easyread" }, message), "*");
</script>
</body>
</html>`;

async function serveHostPage(page: Page) {
  await page.route(`${SERVICE_ORIGIN}/**`, (route) =>
    route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: HOST_PAGE }),
  );
}

function readerFrame(page: Page): Frame {
  const frame = page.frames().find((candidate) => candidate.url().startsWith(`${SERVICE_ORIGIN}/read/`));
  if (!frame) throw new Error("reader frame is not loaded");
  return frame;
}

async function openReader(page: Page, paperId: string) {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.addInitScript(() => {
    window.localStorage.setItem("litfolio.lang", "en");
    window.localStorage.setItem("litera.onboarding.completed", "1");
    window.localStorage.setItem("litera.reader.onboarded", "1");
  });
  await serveHostPage(page);
  await page.goto(`/reader/${paperId}`);
  await expect(page.locator(`iframe[src="${SERVICE_ORIGIN}/read/${paperId}"]`)).toBeVisible();
  await expect.poll(async () => {
    const frame = page.frames().find((candidate) => candidate.url().startsWith(`${SERVICE_ORIGIN}/read/`));
    return frame ? await frame.textContent("#upstream") : null;
  }).toBe("Upstream reader fixture");
}

test("hosts the upstream reader page in the document column and publishes host state into it", async ({ page }, testInfo) => {
  await openReader(page, "paper-reader");

  await expect(page.getByRole("heading", { name: "Reader Comparison Fixture" })).toBeVisible();

  // The host publishes its own theme tokens and its own interface language;
  // the framed page keeps upstream's dictionary and adopts the language.
  await expect.poll(async () =>
    readerFrame(page).evaluate(() => {
      const received = (window as unknown as { __hostMessages: Array<{ type?: string; tokens?: Record<string, string>; lang?: string }> }).__hostMessages;
      return {
        theme: received.some((message) => message.type === "theme" && message.tokens?.["accent"] !== undefined),
        locale: received.find((message) => message.type === "locale")?.lang ?? null,
      };
    }),
  ).toEqual({ theme: true, locale: "en" });

  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1281);
  await page.screenshot({ path: testInfo.outputPath("reader-hosted-frame.png") });
});

test("follows host navigation sent from the framed reader", async ({ page }) => {
  await openReader(page, "paper-reader");

  await readerFrame(page).evaluate(() =>
    (window as unknown as { __emit: (message: unknown) => void }).__emit({
      type: "navigate",
      path: "/read/paper-cached",
    }),
  );
  await expect(page).toHaveURL(/\/reader\/paper-cached$/);

  await openReader(page, "paper-reader");
  await readerFrame(page).evaluate(() =>
    (window as unknown as { __emit: (message: unknown) => void }).__emit({ type: "navigate", path: "/settings" }),
  );
  await expect(page).toHaveURL(/\/settings\?tab=profiles$/);
});

test("opens LitFolio extension tools beside the reader and reads an earlier cached translation", async ({ page }) => {
  await openReader(page, "paper-cached");

  const tabs = page.getByRole("tablist", { name: "LitFolio extension tools" });
  await expect(tabs).toBeHidden();
  await page.getByRole("button", { name: "Toggle extension tools" }).click();
  await expect(tabs).toBeVisible();

  // The cached-translation tab exists only for a paper that has one stored.
  await page.getByRole("tab", { name: "Earlier full-text translation" }).click();
  await expect(page.getByText("The saved translation appears without another model call.")).toBeVisible();

  await page.getByRole("button", { name: "Source text", exact: true }).click();
  await expect(page.getByText("The original paragraph remains readable offline.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Translation", exact: true })).toHaveAttribute("aria-pressed", "false");
});

test("keeps the extension panel reachable without a stored translation", async ({ page }) => {
  await openReader(page, "paper-reader");

  await page.getByRole("button", { name: "Toggle extension tools" }).click();
  const tabs = page.getByRole("tablist", { name: "LitFolio extension tools" });
  await expect(tabs).toBeVisible();
  await expect(page.getByRole("tab", { name: "Reading Card" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Earlier full-text translation" })).toHaveCount(0);

  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1281);
});

test("describes the hosted reader and its extension panel on first entry", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.addInitScript(() => {
    window.localStorage.setItem("litfolio.lang", "en");
    window.localStorage.setItem("litera.onboarding.completed", "1");
  });
  await serveHostPage(page);
  await page.goto("/reader/paper-reader");

  const onboarding = page.getByRole("dialog", { name: "Reading workspace" });
  await expect(onboarding).toBeVisible();
  await expect(onboarding).toContainText("extension panel");
  await expect(onboarding).not.toContainText("bilingual");
  await onboarding.getByRole("button", { name: "Got it" }).click();
  await expect(onboarding).toBeHidden();
});
