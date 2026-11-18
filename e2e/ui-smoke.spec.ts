import { expect, test, type Page } from "@playwright/test";

/** The fixed loopback origin the reading-service mock answers with. */
const READING_SERVICE_ORIGIN = "http://127.0.0.1:9";

/** Library and import are the hosted upstream page, so the frame carries the heading. */
const hostedRoutes = ["/library", "/import"];
const shellRoutes = ["/browse", "/feeds", "/candidates", "/topic", "/ask", "/graph", "/settings"];
const viewports = [
  { name: "wide", width: 1280, height: 800 },
  { name: "mid", width: 1024, height: 768 },
  { name: "narrow", width: 900, height: 700 },
];

async function serveReadingService(page: Page) {
  await page.route(`${READING_SERVICE_ORIGIN}/**`, (route) =>
    route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: "<!doctype html><title>LitFolio</title>" }),
  );
}

test("reader navigation is keyboard reachable while auto-hidden", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("litfolio.lang", "en");
    window.localStorage.setItem("litera.onboarding.completed", "1");
    window.localStorage.setItem("litera-pin-nav", "0");
  });
  await page.goto("/reader/paper-1");
  const trigger = page.getByRole("button", { name: /Show navigation/ });
  await trigger.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("navigation", { name: "Primary navigation" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("navigation", { name: "Primary navigation" })).toHaveCount(0);
});

for (const viewport of viewports) {
  test(`core routes remain scannable at ${viewport.name} width`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.addInitScript(() => {
      window.localStorage.setItem("litfolio.lang", "en");
      window.localStorage.setItem("litera.onboarding.completed", "1");
      if (!window.localStorage.getItem("litfolio.theme")) {
        window.localStorage.setItem("litfolio.theme", "violet");
      }
    });
    await serveReadingService(page);

    for (const route of hostedRoutes) {
      await page.goto(route);
      await expect(page.locator("main#main-content")).toBeVisible();
      await expect(page.locator(`iframe[src^="${READING_SERVICE_ORIGIN}"]`)).toBeVisible();
      const fits = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
      expect(fits, `${route} overflows horizontally at ${viewport.width}px`).toBe(true);
    }

    for (const route of shellRoutes) {
      await page.goto(route);
      await expect(page.locator("main#main-content")).toBeVisible();
      await expect(page.locator("main#main-content h1").first()).toBeVisible();
      const fits = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
      expect(fits, `${route} overflows horizontally at ${viewport.width}px`).toBe(true);
    }

    await page.goto("/library");
    if (viewport.width > 900) {
      await expect(page.getByText("Discover", { exact: true }).first()).toBeVisible();
      await expect(page.getByText("Research", { exact: true }).first()).toBeVisible();
    } else {
      const navWidth = await page.locator("aside").first().evaluate((element) => element.getBoundingClientRect().width);
      expect(navWidth).toBeLessThanOrEqual(56);
      await page.goto("/library?view=extensions");
      await page.getByRole("button", { name: "Folders" }).click();
      await expect(page.locator("aside").filter({ hasText: "Folders" }).last()).toBeVisible();
      await page.getByRole("button", { name: "Close" }).last().click();
      await page.goto("/feeds");
      await page.getByRole("button", { name: "Sources" }).click();
      await expect(page.locator("aside").filter({ hasText: "Sources" }).last()).toBeVisible();
      await page.getByRole("button", { name: "Close" }).last().click();
      await page.goto("/browse");
      await page.getByRole("button", { name: "Categories" }).click();
      await expect(page.locator("aside").filter({ hasText: "Categories" }).last()).toBeVisible();
      await page.getByRole("button", { name: "Close" }).last().click();
    }

    await page.goto("/settings");
    await page.getByRole("tab", { name: "Tools" }).click();
    await expect(page.getByRole("radio").first()).toBeVisible();
    await page.getByRole("radio", { name: /Muted violet/ }).focus();
    await page.keyboard.press("End");
    await expect.poll(() => page.locator("html").getAttribute("data-theme")).toBe("blueprint");
    const accentColors: string[] = [];
    for (const theme of ["violet", "warm", "blueprint"] as const) {
      await page.getByRole("radio", { name: new RegExp(theme === "violet" ? "Muted violet" : theme === "warm" ? "Graphite paper" : "Cold blueprint") }).click();
      await expect.poll(() => page.locator("html").getAttribute("data-theme")).toBe(theme);
      accentColors.push(await page.locator("html").evaluate((element) => getComputedStyle(element).getPropertyValue("--litera-accent").trim()));
    }
    expect(new Set(accentColors).size).toBe(3);

    await page.reload();
    await expect.poll(() => page.locator("html").getAttribute("data-theme")).toBe("blueprint");
    await page.screenshot({ path: testInfo.outputPath(`ui-${viewport.name}-blueprint.png`), fullPage: false });
  });
}
