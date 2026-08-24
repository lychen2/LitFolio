import { describe, expect, it } from "vitest";
import { DEFAULT_THEME, THEME_STORAGE_KEY, applyTheme, parseTheme, persistTheme, readStoredTheme } from "./theme";

function memoryStorage(initial: Record<string, string> = {}): Storage {
  const values = new Map(Object.entries(initial));
  return {
    get length() { return values.size; },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => Array.from(values.keys())[index] ?? null,
    removeItem: (key) => { values.delete(key); },
    setItem: (key, value) => { values.set(key, value); },
  };
}

describe("theme preferences", () => {
  it("falls back to violet for missing or invalid values", () => {
    expect(parseTheme(null)).toBe(DEFAULT_THEME);
    expect(parseTheme("neon")).toBe(DEFAULT_THEME);
    expect(readStoredTheme(memoryStorage())).toBe("violet");
  });

  it("persists and reads a supported theme", () => {
    const storage = memoryStorage();
    persistTheme("blueprint", storage);
    expect(storage.getItem(THEME_STORAGE_KEY)).toBe("blueprint");
    expect(readStoredTheme(storage)).toBe("blueprint");
  });

  it("applies the theme to the root dataset", () => {
    const root = { dataset: {}, style: {} } as unknown as HTMLElement;
    applyTheme("warm", root);
    expect(root.dataset.theme).toBe("warm");
    expect(root.style.colorScheme).toBe("dark");
  });
});
