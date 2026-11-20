import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

interface TranslationCall {
  command: string;
  args: unknown;
}

type TranslationReply = { error: string } | { translations: (string | null)[] } | null;

async function interceptTranslation(page: Page, onTranslate: (call: TranslationCall) => TranslationReply) {
  await page.exposeFunction("interceptTranslation", onTranslate);
  await page.route(/\/src\/test\/tauriCoreMock\.ts(?:\?.*)?$/, async (route) => {
    if (new URL(route.request().url()).searchParams.has("original")) {
      await route.fallback();
      return;
    }
    await route.fulfill({
      contentType: "text/javascript",
      body: `
        export * from "/src/test/tauriCoreMock.ts?original";
        import { invoke as originalInvoke } from "/src/test/tauriCoreMock.ts?original";
        export async function invoke(command, args) {
          if (command === "literature_network_translate_titles") {
            const scripted = await globalThis.interceptTranslation({ command, args });
            if (scripted?.error) throw scripted.error;
            if (scripted) return scripted.translations;
          }
          return originalInvoke(command, args);
        }
      `,
    });
  });
}

async function mountFixture(page: Page, onTranslate: (call: TranslationCall) => TranslationReply) {
  await interceptTranslation(page, onTranslate);
  await page.route("**/network-title-translation-test", (route) => route.fulfill({
    contentType: "text/html",
    body: '<!doctype html><div id="root"></div><script type="module" src="/e2e/fixtures/networkTitleTranslation.ts"></script>',
  }));
  await page.goto("/network-title-translation-test");
  await expect(page.getByText("Browser Smoke Paper", { exact: true })).toBeVisible();
}

const initialCall = {
  command: "literature_network_translate_titles",
  args: { titles: ["Browser Smoke Paper", "Related Network Paper", "Common Reference Paper"] },
};

test("click translates node and evidence titles once, and switches back to untouched originals", async ({ page }) => {
  const calls: TranslationCall[] = [];
  await mountFixture(page, (call) => {
    calls.push(call);
    return null;
  });
  expect(calls).toEqual([]);
  await page.getByRole("button", { name: "Translate titles" }).click();
  await expect(page.getByRole("list", { name: "Papers" }).getByRole("listitem")).toHaveText([
    "浏览器测试论文", "相关网络论文",
  ]);
  const evidence = page.getByRole("list", { name: "Evidence" });
  await expect(evidence.getByRole("link")).toHaveText(["浏览器测试论文", "共同参考文献", "共同参考文献", "W5"]);
  await expect(evidence.getByRole("link").nth(2)).toHaveAttribute("href", "https://openalex.org/W4");
  expect(calls).toEqual([initialCall]);

  await page.getByRole("button", { name: "Show original" }).click();
  await expect(page.getByText("Browser Smoke Paper", { exact: true })).toBeVisible();
  await expect(evidence.getByRole("link")).toHaveText([
    "Alternate form of the seed title", "Common Reference Paper", "Common Reference Paper", "W5",
  ]);
  await page.getByRole("button", { name: "Translate titles" }).click();
  await expect(page.getByRole("button", { name: "Show original" })).toBeVisible();
  expect(calls).toEqual([initialCall]);
});

test("surfaces IPC errors and retries only titles missing from a partial response", async ({ page }) => {
  const calls: TranslationCall[] = [];
  const replies: TranslationReply[] = [
    { error: "Translation provider unavailable" },
    { translations: ["浏览器测试论文", null, "共同参考文献"] },
    { translations: ["相关网络论文"] },
  ];
  await mountFixture(page, (call) => {
    calls.push(call);
    return replies.shift() ?? null;
  });
  const translate = page.getByRole("button", { name: "Translate titles" });
  await translate.click();
  await expect(page.getByRole("alert")).toHaveText("Translation provider unavailable");
  await translate.click();
  await expect(page.getByRole("alert")).toHaveText(/Some titles could not be translated/);
  await expect(page.getByText("Browser Smoke Paper", { exact: true })).toBeVisible();
  await translate.click();
  await expect(page.getByText("相关网络论文", { exact: true })).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
  expect(calls).toEqual([
    initialCall, initialCall,
    { command: initialCall.command, args: { titles: ["Related Network Paper"] } },
  ]);
});

test("the literature network page translates after discovery and reuses the batch when toggling", async ({ page }) => {
  const calls: TranslationCall[] = [];
  await interceptTranslation(page, (call) => {
    calls.push(call);
    return null;
  });
  await page.addInitScript(() => {
    localStorage.setItem("litfolio.lang", "en");
    localStorage.setItem("litera.onboarding.completed", "1");
  });
  await page.goto("/literature-network");
  const seeds = page.getByRole("region", { name: "Seed papers" });
  await seeds.getByRole("button", { name: "Browser Smoke Paper", exact: true }).click();
  await seeds.getByRole("button", { name: "Discover online" }).click();
  const papers = page.getByRole("region", { name: "Papers", exact: true });
  await expect(papers.getByText("Related Network Paper", { exact: true })).toBeVisible();
  expect(calls).toEqual([]);

  await page.getByRole("button", { name: "Translate titles", exact: true }).click();
  await expect(papers.getByText("相关网络论文", { exact: true })).toBeVisible();
  const original = page.getByRole("button", { name: "Show original titles", exact: true });
  await expect(original).toHaveAttribute("aria-pressed", "true");
  await original.click();
  await expect(papers.getByText("Related Network Paper", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Translate titles", exact: true }).click();
  await expect(papers.getByText("相关网络论文", { exact: true })).toBeVisible();
  expect(calls).toEqual([initialCall]);
});
