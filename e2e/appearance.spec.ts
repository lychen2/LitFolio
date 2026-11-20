import { expect, test } from "@playwright/test";
import { THEME_MODE_STORAGE_KEY } from "../src/lib/theme";

test("settings appearance follows the OS, preserves manual choices, and restores on startup", async ({ page, browser }, testInfo) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem("litfolio.lang")) localStorage.setItem("litfolio.lang", "en");
    localStorage.setItem("litera.onboarding.completed", "1");
    const observer = new MutationObserver((changes) => {
      const root = document.documentElement;
      if (!changes.some(({ target }) => target === root)) return;
      performance.mark("appearance-before-mount", {
        detail: { theme: root.dataset.theme, mode: root.dataset.mode, mounted: !!document.querySelector("#root > *") },
      });
      observer.disconnect();
    });
    observer.observe(document, { attributeFilter: ["data-mode"], subtree: true });
    matchMedia("(prefers-color-scheme: dark)").addEventListener("change", ({ matches }) => {
      performance.mark(matches ? "appearance-os-dark" : "appearance-os-light");
    });
  });

  const firstMode = () => page.evaluate(() => {
    const mark = performance.getEntriesByName("appearance-before-mount", "mark")[0];
    return mark instanceof PerformanceMark ? mark.detail : null;
  });
  const root = page.locator("html");
  const group = page.getByRole("radiogroup", { name: "Appearance", exact: true });
  const day = group.getByRole("radio", { name: "Day", exact: true });
  const night = group.getByRole("radio", { name: "Night", exact: true });
  const system = group.getByRole("radio", { name: "Follow system", exact: true });
  const palette = page.getByRole("radiogroup", { name: "Interface theme", exact: true });
  const blueprint = palette.getByRole("radio", { name: /Cold blueprint/ });
  const save = page.getByRole("button", { name: "Save", exact: true });
  const storageMode = () => page.evaluate((key) => localStorage.getItem(key), THEME_MODE_STORAGE_KEY);

  async function changeOsColorScheme(colorScheme: "light" | "dark") {
    const name = `appearance-os-${colorScheme}`;
    const count = await page.evaluate((name) => performance.getEntriesByName(name).length, name);
    await page.emulateMedia({ colorScheme });
    await page.waitForFunction(({ name, count }) => performance.getEntriesByName(name).length > count, { name, count });
  }

  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/settings?tab=tools");
  await expect(page.getByRole("tab", { name: "Tools", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(night).toBeChecked();
  expect(await firstMode()).toEqual({ theme: "violet", mode: "dark", mounted: false });
  expect(await storageMode()).toBeNull();
  await expect(root).toHaveCSS("color-scheme", "dark");
  await expect(save).toBeDisabled();

  const draft = page.getByPlaceholder("Papers", { exact: true });
  await draft.fill("Research/Draft");
  await expect(save).toBeEnabled();
  await day.click();
  await expect(day).toBeChecked();
  await expect(root).toHaveCSS("color-scheme", "light");
  await expect(root).toHaveAttribute("data-theme", "violet");
  await group.screenshot({ path: testInfo.outputPath("appearance-en-day.png"), animations: "disabled" });

  await blueprint.click();
  await expect(blueprint).toBeChecked();
  await expect(day).toBeChecked();
  await expect(root).toHaveAttribute("data-theme", "blueprint");
  await expect(root).toHaveAttribute("data-mode", "light");

  const panel = page.getByRole("tabpanel", { name: "Tools", exact: true });
  await panel.focus();
  await page.keyboard.press("Tab");
  await expect(day).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(night).toBeFocused();
  await expect(night).toBeChecked();
  await expect(root).toHaveAttribute("data-mode", "dark");
  await expect(group.locator("input:focus-visible + span")).toHaveCSS("outline-style", "solid");
  await expect(group.locator("input:focus-visible + span")).toHaveCSS("outline-width", "2px");
  await group.screenshot({ path: testInfo.outputPath("appearance-en-night-focus.png"), animations: "disabled" });
  await page.keyboard.press("End");
  await expect(system).toBeFocused();
  await expect(system).toBeChecked();
  await page.keyboard.press("Home");
  await expect(day).toBeChecked();
  await page.keyboard.press("ArrowLeft");
  await expect(system).toBeFocused();
  await expect(system).toBeChecked();
  await page.keyboard.press("Space");
  await expect(system).toBeChecked();
  await page.keyboard.press("Tab");
  await expect(blueprint).toBeFocused();

  expect(await storageMode()).toBe("system");
  await expect(root).toHaveAttribute("data-mode", "light");
  await changeOsColorScheme("dark");
  await expect(root).toHaveAttribute("data-mode", "dark");
  await expect(root).toHaveCSS("color-scheme", "dark");
  await expect(system).toBeChecked();
  await expect(palette.locator('[data-theme][data-mode="dark"]')).toHaveCount(3);
  await changeOsColorScheme("light");
  await expect(root).toHaveAttribute("data-mode", "light");
  await expect(palette.locator('[data-theme][data-mode="light"]')).toHaveCount(3);

  await night.click();
  await expect(root).toHaveAttribute("data-mode", "dark");
  await changeOsColorScheme("dark");
  await changeOsColorScheme("light");
  await expect(root).toHaveAttribute("data-mode", "dark");
  expect(await storageMode()).toBe("dark");
  await day.click();
  await changeOsColorScheme("dark");
  await expect(root).toHaveAttribute("data-mode", "light");
  expect(await storageMode()).toBe("light");
  await expect(draft).toHaveValue("Research/Draft");
  await expect(save).toBeEnabled();
  await expect(page).toHaveURL(/settings\?tab=tools$/);

  for (const [mode, os] of [["light", "dark"], ["dark", "light"]] as const) {
    await page.evaluate(([key, value]) => localStorage.setItem(key, value), [THEME_MODE_STORAGE_KEY, mode]);
    await page.emulateMedia({ colorScheme: os });
    await page.reload();
    await expect(mode === "light" ? day : night).toBeChecked();
    expect(await firstMode()).toEqual({ theme: "blueprint", mode, mounted: false });
    expect(await storageMode()).toBe(mode);
  }

  const track = group.locator(".appearance-mode__track");
  const thumb = track.locator(".appearance-mode__thumb");
  await expect(thumb).toHaveCSS("transition-property", "transform");
  await expect(thumb).toHaveCSS("transition-duration", "0.19s");
  await expect(group.locator("svg").first()).toHaveCSS("transition-duration", "0.16s");
  await system.click();
  await expect(root).toHaveAttribute("data-mode", "light");
  await page.emulateMedia({ colorScheme: "dark" });
  await page.reload();
  await expect(system).toBeChecked();
  expect(await firstMode()).toEqual({ theme: "blueprint", mode: "dark", mounted: false });
  expect(await storageMode()).toBe("system");

  const reopened = await browser.newContext({ storageState: await page.context().storageState(), colorScheme: "light" });
  try {
    const reopenedPage = await reopened.newPage();
    await reopenedPage.goto(page.url());
    await expect(reopenedPage.locator("html")).toHaveAttribute("data-mode", "light");
    await expect(reopenedPage.locator("html")).toHaveAttribute("data-theme", "blueprint");
    await expect(reopenedPage.getByRole("radio", { name: "Follow system", exact: true })).toBeChecked();
  } finally {
    await reopened.close();
  }

  await page.setViewportSize({ width: 390, height: 820 });
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await expect(thumb).toHaveCSS("transition-property", "none");
  await expect(group.locator("svg").last()).toHaveCSS("transition-property", "none");
  await day.click();
  await expect(root).toHaveAttribute("data-mode", "light");
  await system.click();
  await expect(root).toHaveAttribute("data-mode", "dark");
  const thumbBox = await thumb.boundingBox();
  const systemBox = await system.boundingBox();
  if (!thumbBox || !systemBox) throw new Error("The selected segment and thumb must be visible");
  expect(Math.abs(thumbBox.x - systemBox.x)).toBeLessThan(1);
  expect(Math.abs(thumbBox.width - systemBox.width)).toBeLessThan(1);

  await page.getByRole("button", { name: "ZH", exact: true }).click();
  const chinese = page.getByRole("radiogroup", { name: "明暗模式", exact: true });
  await expect(chinese.getByRole("radio", { name: "日间", exact: true })).toBeVisible();
  await expect(chinese.getByRole("radio", { name: "夜间", exact: true })).toBeVisible();
  await expect(chinese.getByRole("radio", { name: "跟随系统", exact: true })).toBeChecked();
  await chinese.screenshot({ path: testInfo.outputPath("appearance-zh-system-390.png"), animations: "disabled" });
});
