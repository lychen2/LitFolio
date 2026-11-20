import { expect, test, type Page } from "@playwright/test";

/** The fixed loopback origin the reading-service mock answers with. */
const READING_SERVICE_ORIGIN = "http://127.0.0.1:9";

/** Library and import are the hosted upstream page, so the frame carries the heading. */
const hostedRoutes = ["/library", "/import"];
const shellRoutes = ["/browse", "/feeds", "/candidates", "/topic", "/settings"];
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

test("primary navigation loads a distinct Kubai icon for every route", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.addInitScript(() => {
    localStorage.setItem("litfolio.lang", "en");
    localStorage.setItem("litera.onboarding.completed", "1");
  });
  await serveReadingService(page);
  await page.goto("/settings");
  const nav = page.getByRole("navigation", { name: "Primary navigation" });
  const links = nav.getByRole("link");
  await expect(links).toHaveCount(8);
  const icons = nav.locator("a img");
  await expect(icons).toHaveCount(8);
  await expect.poll(() => icons.evaluateAll((images) => images.every(
    (image) => image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0,
  ))).toBe(true);
  const sources = await icons.evaluateAll((images) => images.map((image) => image.getAttribute("src")));
  expect(new Set(sources).size).toBe(8);

  await nav.getByRole("link", { name: "Library", exact: true }).click();
  await expect(page).toHaveURL(/\/library$/);
  await expect(nav.getByRole("link", { name: "Library", exact: true })).toHaveAttribute("aria-current", "page");
});

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

test("route transitions replay without resetting same-page controls", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("litfolio.lang", "en");
    localStorage.setItem("litera.onboarding.completed", "1");
    document.addEventListener("animationstart", (event) => {
      if (event.animationName !== "litera-fade-in" || !(event.target instanceof HTMLElement)) return;
      if (event.target.parentElement?.id === "main-content") {
        event.target.dataset.entered = location.pathname;
      }
    });
  });
  await serveReadingService(page);
  await page.goto("/settings");
  const main = page.getByRole("main");
  const nav = page.getByRole("navigation", { name: "Primary navigation" });
  await expect(main.locator('[data-entered="/settings"]')).toBeVisible();

  await nav.getByRole("link", { name: "Import", exact: true }).click();
  const importPage = main.locator('[data-entered="/import"]');
  await expect(importPage.getByRole("heading", { name: "Import", level: 1 })).toBeVisible();
  await importPage.evaluate((element) => element.setAttribute("data-query-check", "present"));
  await importPage.getByText("Advanced import options", { exact: true }).click();
  await importPage.getByRole("button", { name: "Local files and folders" }).click();
  await expect(page).toHaveURL(/\/import\?tab=pdf$/);
  await expect(importPage).toHaveAttribute("data-query-check", "present");

  await nav.getByRole("link", { name: "Settings", exact: true }).click();
  await expect(main.locator('[data-entered="/settings"]').getByRole("heading", { name: "Settings", level: 1 })).toBeVisible();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await nav.getByRole("link", { name: "Import", exact: true }).click();
  await expect(main.getByRole("heading", { name: "Import", level: 1 })).toBeVisible();
  await expect(main.locator(":scope > div").first()).toHaveCSS("animation-name", "none");
});

test("command palette localizes and opens a route by keyboard", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("litfolio.lang", "en");
    localStorage.setItem("litera.onboarding.completed", "1");
  });
  await serveReadingService(page);
  await page.goto("/settings");
  const language = page.getByRole("button", { name: "ZH", exact: true });
  await language.focus();
  await page.keyboard.press("Control+k");
  const english = page.getByRole("dialog", { name: "Command palette" });
  await expect(english.getByRole("combobox", { name: "Search commands and papers" })).toBeFocused();
  await expect(english.getByRole("group", { name: "Navigation" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(english).toBeHidden();
  await expect(language).toBeFocused();

  await language.click();
  await page.keyboard.press("Control+k");
  const chinese = page.getByRole("dialog", { name: "命令面板" });
  const search = chinese.getByRole("combobox", { name: "搜索命令和论文" });
  await expect(search).toBeFocused();
  await expect(chinese.getByRole("group", { name: "导航" })).toBeVisible();
  await search.fill("zzq-no-matches-9827");
  await expect(chinese.getByRole("status")).toHaveText("没有结果");
  await search.clear();
  await expect(chinese.getByRole("option", { selected: true })).toHaveText("文献库");
  await search.press("ArrowDown");
  await expect(chinese.getByRole("option", { selected: true })).toHaveText("导入");
  await search.press("Enter");
  await expect(page).toHaveURL(/\/import$/);
  await expect(chinese).toBeHidden();
  await expect(page.getByRole("heading", { name: "导入", level: 1 })).toBeVisible();
});

test("shared tabs follow the responsive keyboard axis and label their panels", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.addInitScript(() => {
    localStorage.setItem("litfolio.lang", "en");
    localStorage.setItem("litera.onboarding.completed", "1");
  });
  await page.goto("/settings");
  const settings = page.getByRole("tablist", { name: "Settings" });
  await expect(settings).toHaveAttribute("aria-orientation", "vertical");
  await settings.getByRole("tab", { selected: true }).focus();
  await page.keyboard.press("End");
  const tools = settings.getByRole("tab", { name: "Tools", selected: true });
  await expect(tools).toBeFocused();
  await expect(page.getByRole("tabpanel", { name: "Tools" })).toBeVisible();
  await tools.press("ArrowUp");
  await expect(page.getByRole("tabpanel", { name: "Export" })).toBeVisible();

  await page.setViewportSize({ width: 390, height: 750 });
  await expect(settings).toHaveAttribute("aria-orientation", "horizontal");
  await page.keyboard.press("ArrowRight");
  await expect(tools).toBeFocused();
  await expect(page.getByRole("tabpanel", { name: "Tools" })).toBeVisible();

  await page.goto("/topic");
  const topic = page.getByRole("tablist");
  await topic.getByRole("tab", { name: "Survey generation", selected: true }).press("ArrowRight");
  const search = topic.getByRole("tab", { name: "Search recall", selected: true });
  await expect(search).toBeFocused();
  await expect(page.getByRole("tabpanel", { name: "Search recall" })).toBeVisible();
  await expect(search.locator("img")).toHaveJSProperty("naturalWidth", 24);
  await page.screenshot({ path: testInfo.outputPath("topic-narrow.png"), animations: "disabled" });
  await page.reload();
  await expect(search).toBeVisible();
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
    } else {
      const navWidth = await page.locator("aside").first().evaluate((element) => element.getBoundingClientRect().width);
      expect(navWidth).toBeLessThanOrEqual(56);
      await page.goto("/library?panel=collections");
      const folders = page.getByRole("dialog", { name: "Folders", exact: true });
      await expect(folders).toBeVisible();
      await folders.getByRole("button", { name: "Close", exact: true }).click();
      await expect(folders).toBeHidden();
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
    const navIcon = page.getByRole("link", { name: "Library", exact: true }).locator("img.kubai-icon");
    const iconPaints: Buffer[] = [];
    for (const theme of ["violet", "warm", "blueprint"] as const) {
      await page.getByRole("radio", { name: new RegExp(theme === "violet" ? "Muted violet" : theme === "warm" ? "Graphite paper" : "Cold blueprint") }).click();
      await expect.poll(() => page.locator("html").getAttribute("data-theme")).toBe(theme);
      accentColors.push(await page.locator("html").evaluate((element) => getComputedStyle(element).getPropertyValue("--litera-accent").trim()));
      iconPaints.push(await navIcon.screenshot({
        animations: "disabled",
        style: '.litera-nav-item[href="/library"] { background: #242428 !important; }',
      }));
    }
    expect(new Set(accentColors).size).toBe(3);
    expect(new Set(iconPaints.map((image) => image.toString("base64"))).size).toBe(3);

    await page.reload();
    await expect.poll(() => page.locator("html").getAttribute("data-theme")).toBe("blueprint");
    await expect(page.getByRole("heading", { name: "Settings", level: 1 })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`ui-${viewport.name}-blueprint.png`), fullPage: false, animations: "disabled" });
  });
}
