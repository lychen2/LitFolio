import { describe, expect, it } from "vitest";
import { en } from "./en";
import { zh } from "./zh";

/// Guards the two flat dictionaries against the failure modes tsc can't catch.
/// `en` is typed `Record<TKey, string>`, so the key *set* is already enforced
/// at compile time — these tests cover the runtime gaps: blank translations and
/// interpolation placeholders that drift between locales (e.g. zh has `{count}`
/// but en dropped it).
const PLACEHOLDER = /\{(\w+)\}/g;

function placeholders(value: string): Set<string> {
  return new Set([...value.matchAll(PLACEHOLDER)].map((match) => match[1]));
}

function keysOf(dict: Record<string, string>): string[] {
  return Object.keys(dict);
}

describe("i18n dictionaries", () => {
  it("zh and en expose the same keys", () => {
    const zhKeys = new Set(keysOf(zh));
    const enKeys = new Set(keysOf(en));
    const missingInEn = [...zhKeys].filter((key) => !enKeys.has(key));
    const missingInZh = [...enKeys].filter((key) => !zhKeys.has(key));
    expect({ missingInEn, missingInZh }).toEqual({ missingInEn: [], missingInZh: [] });
  });

  it("has no blank translations", () => {
    const blankZh = keysOf(zh).filter((key) => zh[key as keyof typeof zh].trim() === "" && key !== "shell.footer");
    const blankEn = keysOf(en).filter((key) => en[key as keyof typeof en].trim() === "" && key !== "shell.footer");
    expect({ blankZh, blankEn }).toEqual({ blankZh: [], blankEn: [] });
  });

  it("keeps interpolation placeholders consistent across locales", () => {
    const mismatches: { key: string; zh: string[]; en: string[] }[] = [];
    for (const key of keysOf(zh)) {
      const zhPlaceholders = placeholders(zh[key as keyof typeof zh]);
      const enPlaceholders = placeholders(en[key as keyof typeof en] ?? "");
      const same =
        zhPlaceholders.size === enPlaceholders.size &&
        [...zhPlaceholders].every((name) => enPlaceholders.has(name));
      if (!same) {
        mismatches.push({ key, zh: [...zhPlaceholders], en: [...enPlaceholders] });
      }
    }
    expect(mismatches).toEqual([]);
  });
});
