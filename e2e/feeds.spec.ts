import { expect, test } from "@playwright/test";

const journal = "Photonics and Nanostructures – Fundamentals and Applications";

test("RSS sources reveal long names and the desktop sidebar resizes", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.addInitScript(() => {
    localStorage.setItem("litfolio.lang", "en");
    localStorage.setItem("litera.onboarding.completed", "1");
  });
  await page.goto("/feeds");
  const source = page.getByRole("button", { name: journal });
  await expect(source).toHaveAttribute("title", journal);
  await source.click();
  const heading = page.getByRole("heading", { name: journal });
  await expect(heading).toBeVisible();
  const divider = page.getByRole("separator", { name: "Resize sources sidebar" });
  await divider.focus();
  const initial = await source.evaluate((element) => element.getBoundingClientRect().width);
  await divider.press("ArrowRight");
  await expect.poll(() => source.evaluate((element) => element.getBoundingClientRect().width)).toBeGreaterThan(initial);
  const beforeDrag = await source.evaluate((element) => element.getBoundingClientRect().width);
  const bounds = await divider.boundingBox();
  expect(bounds).not.toBeNull();
  if (!bounds) throw new Error("RSS divider is not visible");
  const x = bounds.x + bounds.width / 2;
  const y = bounds.y + bounds.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 100, y, { steps: 5 });
  await page.mouse.up();
  await expect.poll(() => source.evaluate((element) => element.getBoundingClientRect().width)).toBeGreaterThan(beforeDrag + 80);
  const firstArticle = page.getByRole("listitem").filter({ hasText: "Newly added article" });
  expect(await firstArticle.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("rss-desktop.png") });

  await page.setViewportSize({ width: 760, height: 700 });
  await expect(divider).toHaveCount(0);
  await page.getByRole("button", { name: "Sources", exact: true }).click();
  await source.click();
  await expect(source).toHaveCount(0);
  await expect(heading).toBeVisible();
  expect(await heading.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("rss-narrow.png") });
});

test("RSS sources enter in order through the last row and honor reduced motion on reopen", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("litfolio.lang", "en");
    localStorage.setItem("litera.onboarding.completed", "1");
  });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/feeds");
  const first = page.getByRole("button", { name: journal });
  const nav = page.getByRole("navigation").filter({ has: first });
  const rows = nav.locator(":scope > *");
  const open = page.getByRole("button", { name: "Sources", exact: true });

  async function checkEntrance() {
    await expect(rows).toHaveCount(17);
    const delays = await rows.evaluateAll(async (elements) => {
      const animations = elements.map((row) => {
        const animation = row.getAnimations().find((entry) => entry instanceof CSSAnimation);
        if (!animation?.effect) throw new Error(`Missing entrance animation on ${row.textContent}`);
        return { delay: animation.effect.getTiming().delay, finished: animation.finished };
      });
      await Promise.all(animations.map(({ finished }) => finished));
      return animations.map(({ delay }) => delay);
    });
    expect(delays[0]).toBe(0);
    for (let i = 1; i < delays.length; i++) {
      expect(delays[i], `subscription ${i}`).toBeGreaterThan(delays[i - 1]);
    }
    await expect(rows.last()).toHaveCSS("opacity", "1");
  }

  await checkEntrance();
  await page.setViewportSize({ width: 760, height: 700 });
  await open.click();
  await checkEntrance();
  await first.click();
  await expect(nav).toHaveCount(0);
  await open.click();
  await checkEntrance();
  await first.click();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await open.click();
  await expect(rows).toHaveCount(17);
  expect(await rows.evaluateAll((elements) => elements.every((row) =>
    row.getAnimations().length === 0 && getComputedStyle(row).opacity === "1"
  ))).toBe(true);
});

test("RSS order controls reload the article list", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("litfolio.lang", "en");
    localStorage.setItem("litera.onboarding.completed", "1");
  });
  await page.goto("/feeds");
  const sort = page.getByRole("button", { name: /^Sort RSS articles/ });
  const articles = page.getByRole("listitem").filter({ hasText: /Newly added article|Earlier article/ });
  await expect(articles.first()).toContainText("Newly added article");
  await sort.press("Enter");
  const options = page.getByRole("menu", { name: "Sort RSS articles" });
  await expect(options.getByRole("menuitemradio", { name: "Newest added", checked: true })).toBeVisible();
  await expect(options.getByRole("menuitemradio", { name: "Newest added" })).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(options.getByRole("menuitemradio", { name: "Oldest added" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(options).toBeHidden();
  await expect(sort).toBeFocused();
  await sort.click();
  await options.getByRole("menuitemradio", { name: "Oldest added" }).click();
  await expect(articles.first()).toContainText("Earlier article");
  await sort.click();
  await options.getByRole("menuitemradio", { name: "Impact factor (high to low)" }).click();
  await expect(articles.first()).toContainText("Newly added article");
  await expect(articles.first()).toContainText("Journal impact factor: 3.5");
});

test("RSS article drawer traps and restores keyboard focus", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("litfolio.lang", "en");
    localStorage.setItem("litera.onboarding.completed", "1");
  });
  await page.goto("/feeds");
  const article = page.getByRole("button", { name: "Newly added article", exact: true });
  await article.press("Enter");
  const drawer = page.getByRole("dialog", { name: "Newly added article" });
  await expect(drawer).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(drawer.locator(":focus")).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(drawer.getByRole("button", { name: "Close", exact: true })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(drawer).toBeHidden();
  await expect(article).toBeFocused();
  await article.click();
  await expect(drawer).toBeVisible();
  await page.mouse.click(10, 10);
  await expect(drawer).toBeHidden();
});
