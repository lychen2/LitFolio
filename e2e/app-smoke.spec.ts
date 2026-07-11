import { expect, test } from "@playwright/test";

test.describe("app smoke", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem("litfolio.lang", "en");
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

  test("opens an existing paper from a repeated DOI import", async ({ page }) => {
    await page.goto("/import?tab=arxiv_doi&link=https%3A%2F%2Fdoi.org%2F10.1145%2F3530819");

    await expect(page.getByText("Already in library: Browser Smoke Paper")).toBeVisible();
    await page.getByRole("button", { name: "Open existing paper" }).click();

    await expect(page).toHaveURL(/\/reader\/paper-1$/);
  });
});
