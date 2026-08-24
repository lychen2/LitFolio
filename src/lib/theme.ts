export const THEME_IDS = ["violet", "warm", "blueprint"] as const;

export type ThemeId = (typeof THEME_IDS)[number];

export const THEME_STORAGE_KEY = "litfolio.theme";
export const DEFAULT_THEME: ThemeId = "violet";

export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === "string" && (THEME_IDS as readonly string[]).includes(value);
}

export function parseTheme(value: string | null | undefined): ThemeId {
  return isThemeId(value) ? value : DEFAULT_THEME;
}

export function readStoredTheme(storage?: Storage): ThemeId {
  try {
    return parseTheme((storage ?? window.localStorage).getItem(THEME_STORAGE_KEY));
  } catch {
    return DEFAULT_THEME;
  }
}

export function applyTheme(theme: ThemeId, root?: HTMLElement): void {
  const target = root ?? document.documentElement;
  target.dataset.theme = theme;
  target.style.colorScheme = "dark";
}

export function persistTheme(theme: ThemeId, storage?: Storage): void {
  try {
    (storage ?? window.localStorage).setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Private mode and embedded webviews can disable localStorage.
  }
}
