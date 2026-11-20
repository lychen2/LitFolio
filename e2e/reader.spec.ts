import { expect, test, type Frame, type Page } from "@playwright/test";

/**
 * The reader route renders the hosted LitFolio page from a loopback service the
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
<h1 id="upstream">Upstream reader fixture</h1>
<button id="extras">Extension panel</button>
<script>
  window.__hostMessages = [];
  window.addEventListener("message", (event) => { window.__hostMessages.push(event.data); });
  window.__emit = (message) => parent.postMessage(
    Object.assign({ source: "litfolio-core" }, message), "*");
  document.querySelector("#extras").onclick = () => window.__emit({ type: "reader-control", control: "extras" });
  window.addEventListener("message", (event) => {
    const { type, colorScheme, tokens } = event.data ?? {};
    if (type !== "theme") return;
    const root = document.documentElement;
    root.dataset.themeApplied = "true";
    root.dataset.colorScheme = colorScheme;
    root.style.setProperty("--litera-annotation-bg", tokens["annotation-bg"]);
    root.style.setProperty("--litera-annotation-ink", tokens["annotation-ink"]);
  });
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

  await expect(page.getByRole("heading", { name: "Reader Comparison Fixture" })).toHaveCount(0);

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

  const frameRoot = readerFrame(page).locator("html");
  await page.locator("html").evaluate((root) => {
    root.dataset.theme = "violet";
    root.dataset.mode = "dark";
  });
  for (const mode of ["light", "dark"]) {
    const annotation = await page.locator("html").evaluate((root, mode) => {
      root.dataset.mode = mode;
      const styles = getComputedStyle(root);
      return ["--litera-annotation-bg", "--litera-annotation-ink"].map((name) => styles.getPropertyValue(name).trim());
    }, mode);
    expect(annotation.every(Boolean)).toBe(true);
    await expect(frameRoot).toHaveAttribute("data-color-scheme", mode);
    await expect.poll(() => frameRoot.evaluate((root) => {
      const styles = getComputedStyle(root);
      return ["--litera-annotation-bg", "--litera-annotation-ink"].map((name) => styles.getPropertyValue(name).trim());
    })).toEqual(annotation);
  }

  // The iframe can replace its document after changing locale. A new bridge
  // listener must receive host state even when no iframe load event fires.
  await readerFrame(page).evaluate(() => {
    delete document.documentElement.dataset.themeApplied;
    parent.postMessage({ source: "litfolio-core", type: "ready" }, "*");
  });
  await expect(readerFrame(page).locator("html")).toHaveAttribute("data-theme-applied", "true");
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

  const tabs = page.getByRole("tablist", { name: "Reading tools" });
  await expect(tabs).toBeHidden();
  await readerFrame(page).getByRole("button", { name: "Extension panel" }).click();
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

  await readerFrame(page).getByRole("button", { name: "Extension panel" }).click();
  const tabs = page.getByRole("tablist", { name: "Reading tools" });
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
