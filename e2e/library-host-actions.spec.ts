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
    Object.assign({ source: "litfolio-easyread" }, message), "*");
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
  await boot(page, "/library?panel=queue-open");

  await expect(page.getByText("Queue is empty — add papers from the library")).toBeVisible();
  await expect(page).toHaveURL(/\/library$/);
});

test("keeps the library on the hosted page with host entry points", async ({ page }) => {
  await boot(page, "/library");

  await expect(page.locator(`iframe[src="${SERVICE_ORIGIN}/"]`)).toBeVisible();
  await expect(page.getByRole("button", { name: "Folders" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Reading Queue" })).toBeVisible();
  await expect(page.getByRole("tablist")).toHaveCount(0);
  await expect.poll(async () => (await hostMessages(page)).includes("library-filter")).toBe(true);
});

test("tells the framed page that a host write changed the paper set", async ({ page }) => {
  await boot(page, "/reader/paper-reader");
  await expect(page.locator(`iframe[src="${SERVICE_ORIGIN}/read/paper-reader"]`)).toBeVisible();
  await expect.poll(async () => (await hostMessages(page)).length).toBeGreaterThan(0);

  // The reader offers the queue action; the host writes through `queue_add`
  // and must then publish the change back to the framed page.
  await expect.poll(async () => (await hostMessages(page)).includes("library-changed")).toBe(false);
  await hostFrame(page).evaluate(() =>
    (window as unknown as { __emit: (message: unknown) => void }).__emit({
      type: "action",
      action: "queue-add",
      paperIds: ["paper-reader"],
    }),
  );
  await expect.poll(async () => (await hostMessages(page)).includes("library-changed")).toBe(true);
});
