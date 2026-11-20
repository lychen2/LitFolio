import { expect, test, type Frame, type Page } from "@playwright/test";

/**
 * Host writes go through the same commands the framed upstream page lists
 * from, so a write has to reach that page as well as the host's own cache.
 * The browser harness has no Rust side: the reading-service mock points the
 * frame at a loopback origin, and this spec serves a fixture that records what
 * the host publishes into it.
 */
const SERVICE_ORIGIN = "http://127.0.0.1:9";

const HOST_PAGE = `<!doctype html>
<html lang="zh-CN">
<head><meta charset="utf-8"><title>LitFolio</title></head>
<body>
<p id="upstream">Upstream library fixture</p>
<script>
  window.__hostMessages = [];
  window.addEventListener("message", (event) => { window.__hostMessages.push(event.data); });
  window.__emit = (message) => parent.postMessage(
    Object.assign({ source: "litfolio-core" }, message), "*");
</script>
</body>
</html>`;

async function serveHostPage(page: Page) {
  await page.route(`${SERVICE_ORIGIN}/**`, (route) =>
    route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: HOST_PAGE }),
  );
}

async function boot(page: Page, path: string) {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.addInitScript(() => {
    window.localStorage.setItem("litfolio.lang", "en");
    window.localStorage.setItem("litera.onboarding.completed", "1");
    window.localStorage.setItem("litera.reader.onboarded", "1");
  });
  await serveHostPage(page);
  await page.goto(path);
  await expect(page.frameLocator(`iframe[src^="${SERVICE_ORIGIN}/"]`).getByText("Upstream library fixture")).toBeVisible();
}

function hostFrame(page: Page): Frame {
  const frame = page.frames().find((candidate) => candidate.url().startsWith(SERVICE_ORIGIN));
  if (!frame) throw new Error("hosted frame is not loaded");
  return frame;
}

function hostMessages(page: Page) {
  return hostFrame(page).evaluate(() =>
    (window as unknown as { __hostMessages: Array<{ type?: string }> }).__hostMessages.map((message) => message.type),
  );
}

test("opens a host panel handed over by another route and clears the handoff", async ({ page }) => {
  await boot(page, "/library?panel=collections");

  await expect(page.getByRole("dialog", { name: "Folders" })).toBeVisible();
  await expect(page).toHaveURL(/\/library$/);
});

test("keeps the library on the hosted page with host entry points", async ({ page }) => {
  await boot(page, "/library");

  await expect(page.locator(`iframe[src="${SERVICE_ORIGIN}/"]`)).toBeVisible();
  await expect(page.getByRole("button", { name: "Folders" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Reading Queue" })).toHaveCount(0);
  await expect(page.getByRole("tablist")).toHaveCount(0);
  await expect.poll(async () => (await hostMessages(page)).includes("library-collections")).toBe(true);
});

test("acknowledges a paper deletion requested by the framed page", async ({ page }) => {
  await boot(page, "/library");
  await expect.poll(async () => (await hostMessages(page)).includes("library-collections")).toBe(true);

  await emitFromFrame(page, { type: "delete", paperId: "paper-reader", requestId: "1" });
  await expect.poll(() => hostFrame(page).evaluate(() => {
    const frame = window as unknown as { __hostMessages: Array<{ type?: string; requestId?: string; ok?: boolean }> };
    return frame.__hostMessages.find((message) => message.type === "delete-result");
  })).toMatchObject({ requestId: "1", ok: true });
});

function emitFromFrame(page: Page, message: unknown) {
  return hostFrame(page).evaluate(
    (payload) => (window as unknown as { __emit: (message: unknown) => void }).__emit(payload),
    message,
  );
}

test("translates a reader selection in the extension panel instead of a second drawer", async ({ page }) => {
  await boot(page, "/reader/paper-reader");

  await emitFromFrame(page, {
    type: "action",
    action: "selection-translate",
    paperIds: ["paper-reader"],
    text: "A selected passage.",
  });

  await expect(page.getByRole("tablist", { name: "Reading tools" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Translate" })).toHaveAttribute("aria-selected", "true");
});

test("opens the matching import form from each framed library entry", async ({ page }) => {
  await boot(page, "/library");
  await emitFromFrame(page, { type: "navigate", path: "/import?tab=pdf" });
  await expect(page).toHaveURL(/\/import\?tab=pdf$/);
  await expect(page.getByRole("button", { name: "Local files and folders", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("iframe")).toHaveCount(0);

  await page.getByRole("link", { name: "Library", exact: true }).click();
  await expect(page.locator(`iframe[src="${SERVICE_ORIGIN}/"]`)).toBeVisible();
  await expect.poll(async () => (await hostMessages(page)).includes("library-collections")).toBe(true);
  await emitFromFrame(page, { type: "navigate", path: "/import?tab=arxiv_doi" });
  await expect(page).toHaveURL(/\/import\?tab=arxiv_doi$/);
  await expect(page.getByRole("button", { name: "arXiv or DOI" })).toHaveAttribute("aria-pressed", "true");
});

test.describe("Android PDF import", () => {
  test.use({ userAgent: "Mozilla/5.0 (Linux; Android 15; Pixel) AppleWebKit/537.36" });

  test("passes a selected provider URI unchanged to the host importer", async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem("litfolio.lang", "en");
      window.localStorage.setItem("litera.onboarding.completed", "1");
    });
    await page.goto("/import");
    await expect(page.getByRole("button", { name: "Import Folder…" })).toHaveCount(0);
    await page.getByRole("button", { name: "Select PDF files…" }).click();
    await expect(page.getByText("reading-check.pdf", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Import 1 file(s)" }).click();
    await expect(page.getByText("✓ Imported 1 paper(s)", { exact: true })).toBeVisible();
  });
});

test("takes focus from the iframe and closes only after IME composition", async ({ page }) => {
  await boot(page, "/library");
  await hostFrame(page).getByText("Upstream library fixture").click();
  const iframe = page.locator(`iframe[src="${SERVICE_ORIGIN}/"]`);
  await expect(iframe).toBeFocused();

  await emitFromFrame(page, { type: "action", action: "details", paperIds: ["paper-reader"] });
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeFocused();
  await dialog.getByText("More", { exact: true }).click();
  const addToQueue = dialog.getByRole("button", { name: "Add to Queue" });
  await addToQueue.focus();
  await page.keyboard.press("Escape");
  await expect(addToQueue).toBeHidden();
  await expect(dialog.getByText("More", { exact: true })).toBeFocused();

  await dialog.getByText("More", { exact: true }).click();
  await addToQueue.click();
  const notice = dialog.getByRole("status").filter({ hasText: "Added to reading queue." });
  await expect(notice).toBeVisible();
  await notice.getByRole("button", { name: "Close" }).click();
  await expect(notice).toBeHidden();

  await dialog.dispatchEvent("keydown", { key: "Escape", isComposing: true, bubbles: true });
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(iframe).toBeFocused();
});
