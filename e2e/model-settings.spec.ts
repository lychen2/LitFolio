import { expect, test } from "@playwright/test";

test("saves thinking controls and output budget in model settings", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("litfolio.lang", "en");
    window.localStorage.setItem("litera.onboarding.completed", "1");
  });
  await page.goto("/settings?tab=profiles");
  await page.getByRole("button", { name: "Ollama (MiniLM)", exact: true }).click();
  await page.getByText("Thinking & API compatibility", { exact: true }).click();
  await expect(page.getByLabel("Thinking mode", { exact: true })).toHaveValue("auto");
  await page.getByLabel("Thinking mode", { exact: true }).selectOption("enabled");
  await page.getByLabel("Parameter format", { exact: true }).selectOption("reasoning_effort");
  await page.getByLabel("Reasoning effort", { exact: true }).selectOption("high");
  await page.getByLabel("Output token limit", { exact: true }).fill("8192");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("✓ Saved.");
  await page.getByRole("tab", { name: "Data & Privacy", exact: true }).click();
  await page.getByRole("tab", { name: "LLM Profiles", exact: true }).click();
  await page.getByText("Thinking & API compatibility", { exact: true }).click();
  await expect(page.getByLabel("Thinking mode", { exact: true })).toHaveValue("enabled");
  await expect(page.getByLabel("Parameter format", { exact: true })).toHaveValue("reasoning_effort");
  await expect(page.getByLabel("Reasoning effort", { exact: true })).toHaveValue("high");
  await expect(page.getByLabel("Output token limit", { exact: true })).toHaveValue("8192");
  await page.getByRole("button", { name: "Test connection", exact: true }).click();
  await expect(page.getByText(/pong/)).toBeVisible();
});
