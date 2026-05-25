import { en } from "./en";
import { zh, type TKey } from "./zh";

export type Lang = "zh" | "en";

export { TKey, zh, en };

export const dict: Record<Lang, Record<TKey, string>> = { zh, en };

export function llmLanguageNameFor(lang: Lang): string {
  return lang === "en" ? "English" : "Chinese";
}
