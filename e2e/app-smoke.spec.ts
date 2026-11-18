import { expect, test, type Page } from "@playwright/test";

/**
 * Both the library and the reader are the hosted upstream page; the browser
 * harness has no Rust side, so the reading-service mock answers with this fixed
 * loopback origin and the spec serves it. Assertions cover the shell routes and
 * what the shell hands to the frame, not the upstream page itself.
 */
const READING_SERVICE_ORIGIN = "http://127.0.0.1:9";

async function serveReadingService(page: Page) {
  await page.route(`${READING_SERVICE_ORIGIN}/**`, (route) =>
    route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: "<!doctype html><title>LitFolio</title>" }),
  );
}

test.describe("app smoke", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem("litfolio.lang", "en");
      window.localStorage.setItem("litera.onboarding.completed", "1");
      window.localStorage.setItem("litera.reader.onboarded", "1");
    });
    await serveReadingService(page);
  });

  test("loads library, import, reader, and settings routes", async ({ page }) => {
    await page.goto("/library");
    await expect(page.getByRole("link", { name: "Library", exact: true })).toBeVisible();
    await expect(page.locator(`iframe[src^="${READING_SERVICE_ORIGIN}"]`)).toBeVisible();

    await page.goto("/import");
    await expect(page.locator(`iframe[src="${READING_SERVICE_ORIGIN}/?litfolio=import&ref="]`)).toBeVisible();

    await page.goto("/reader/paper-1");
    await expect(page.locator(`iframe[src="${READING_SERVICE_ORIGIN}/read/paper-1"]`)).toBeVisible();

    await page.goto("/settings");
    await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Save" })).toBeVisible();
  });

  test("core AppRoot reaches Library and Reader readiness with no external browser egress", async ({ page }) => {
    const externalRequests: string[] = [];
    const externalNavigations: string[] = [];
    const appOrigin = "http://127.0.0.1:1420";

    page.on("request", (request) => {
      const url = request.url();
      if (!url.startsWith(appOrigin) && !url.startsWith(READING_SERVICE_ORIGIN)) externalRequests.push(url);
    });
    page.on("framenavigated", (frame) => {
      if (frame === page.mainFrame() && !frame.url().startsWith(appOrigin)) {
        externalNavigations.push(frame.url());
      }
    });

    await page.clock.install();
    await page.goto("/library");
    await expect(page.locator(`iframe[src^="${READING_SERVICE_ORIGIN}"]`)).toBeVisible();
    await page.goto("/reader/paper-1");
    await expect(page.locator(`iframe[src="${READING_SERVICE_ORIGIN}/read/paper-1"]`)).toBeVisible();
    await page.clock.fastForward(30_000);

    expect(externalRequests).toEqual([]);
    expect(externalNavigations).toEqual([]);
  });

  test("hands an import reference to the upstream import workflow", async ({ page }) => {
    const reference = "https://doi.org/10.1145%2F3530819";
    await page.goto(`/import?fromFeedItem=feed-1&link=${reference}`);

    await expect(page.getByText("From RSS subscription")).toBeVisible();
    await expect(page.locator(`iframe[src^="${READING_SERVICE_ORIGIN}/?litfolio=import&ref="]`)).toBeVisible();
  });
});
