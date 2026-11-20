import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_THEME,
  THEME_MODE_STORAGE_KEY,
  THEME_STORAGE_KEY,
  applyTheme,
  applyThemeMode,
  parseTheme,
  persistTheme,
  persistThemeMode,
  readStoredTheme,
  readStoredThemeMode,
} from "./theme";

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
  afterEach(() => vi.unstubAllGlobals());

  it("defaults to violet and dark for missing or invalid preferences", () => {
    expect(parseTheme(null)).toBe(DEFAULT_THEME);
    expect(parseTheme("neon")).toBe(DEFAULT_THEME);
    expect(readStoredTheme(memoryStorage())).toBe("violet");
    expect(readStoredThemeMode(memoryStorage())).toBe("dark");
    expect(readStoredThemeMode(memoryStorage({ [THEME_MODE_STORAGE_KEY]: "invalid" }))).toBe("dark");
  });

  it("retains the system preference independently of the effective mode", () => {
    const storage = memoryStorage();
    vi.stubGlobal("window", {
      localStorage: storage,
      matchMedia: () => ({ matches: false }),
    });
    persistThemeMode("system", storage);
    const root = { dataset: {}, style: {} } as unknown as HTMLElement;
    applyTheme(readStoredTheme(), root);
    expect(root.dataset).toEqual({ theme: "violet", mode: "light" });
    expect(readStoredThemeMode(storage)).toBe("system");
  });

  it("persists and reads a supported theme", () => {
    const storage = memoryStorage();
    persistTheme("blueprint", storage);
    expect(storage.getItem(THEME_STORAGE_KEY)).toBe("blueprint");
    expect(readStoredTheme(storage)).toBe("blueprint");
  });

  it("restores both preferences and lets the same palette switch modes", () => {
    const storage = memoryStorage({ [THEME_STORAGE_KEY]: "warm" });
    vi.stubGlobal("window", { localStorage: storage });
    const root = { dataset: {}, style: {} } as unknown as HTMLElement;
    applyTheme(readStoredTheme(), root);
    expect(root.dataset).toEqual({ theme: "warm", mode: "dark" });

    applyThemeMode("light", root);
    persistThemeMode("light");
    expect(root.dataset).toEqual({ theme: "warm", mode: "light" });

    const reopenedRoot = { dataset: {}, style: {} } as unknown as HTMLElement;
    applyTheme(readStoredTheme(), reopenedRoot);
    expect(reopenedRoot.dataset).toEqual({ theme: "warm", mode: "light" });
    applyTheme("blueprint", reopenedRoot);
    expect(reopenedRoot.dataset).toEqual({ theme: "blueprint", mode: "light" });
    expect(reopenedRoot.style.colorScheme).toBeUndefined();
  });
});
