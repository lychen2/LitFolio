import { expect, test } from "@playwright/test";

test.describe("app smoke", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem("litfolio.lang", "en");
      window.localStorage.setItem("litera.onboarding.completed", "1");
    });
  });

  test("loads library, import, reader, and settings routes", async ({ page }) => {
    await page.goto("/library");
    await expect(page.getByRole("heading", { name: "Library" })).toBeVisible();
    await expect(page.getByText("Browser Smoke Paper")).toBeVisible();

    await page.goto("/import");
    await expect(page.getByRole("heading", { name: "Import" })).toBeVisible();
    await expect(page.getByRole("button", { name: "PDF file", exact: true })).toBeVisible();

    await page.goto("/reader/paper-1");
    await expect(page.getByText("This paper has no PDF bound yet")).toBeVisible();

    await page.goto("/settings");
    await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Save" })).toBeVisible();
  });

  test("core AppRoot reaches Library and Reader readiness with no external browser egress", async ({ page }) => {
    const externalRequests: string[] = [];
    const externalNavigations: string[] = [];
    const appOrigin = "http://127.0.0.1:1420";

    page.on("request", (request) => {
      if (!request.url().startsWith(appOrigin)) externalRequests.push(request.url());
    });
    page.on("framenavigated", (frame) => {
      if (frame === page.mainFrame() && !frame.url().startsWith(appOrigin)) {
        externalNavigations.push(frame.url());
      }
    });

    await page.clock.install();
    await page.goto("/library");
    await expect(page.getByRole("heading", { name: "Library" })).toBeVisible();
    await page.goto("/reader/paper-1");
    await expect(page.getByText("This paper has no PDF bound yet")).toBeVisible();
    await page.clock.fastForward(30_000);

    expect(externalRequests).toEqual([]);
    expect(externalNavigations).toEqual([]);
  });

  test("opens an existing paper from a repeated DOI import", async ({ page }) => {
    await page.goto("/import?tab=arxiv_doi&link=https%3A%2F%2Fdoi.org%2F10.1145%2F3530819");

    await expect(page.getByText("Already in library: Browser Smoke Paper")).toBeVisible();
    await page.getByRole("button", { name: "Open existing paper" }).click();

    await expect(page).toHaveURL(/\/reader\/paper-1$/);
  });
});
