export const THEME_IDS = ["violet", "warm", "blueprint"] as const;

export type ThemeId = (typeof THEME_IDS)[number];

export const THEME_STORAGE_KEY = "litfolio.theme";
export const DEFAULT_THEME: ThemeId = "violet";

export const FONT_IDS = ["rounded", "system", "serif", "mono"] as const;
export type FontId = (typeof FONT_IDS)[number];

export const FONT_STORAGE_KEY = "litfolio.font";
export const DEFAULT_FONT: FontId = "rounded";

export const FONT_STACKS: Record<FontId, string> = {
  rounded: '"Quicksand", "Nunito", -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans SC", system-ui, sans-serif',
  system: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans SC", system-ui, sans-serif',
  serif: 'Georgia, Cambria, "Times New Roman", "Source Han Serif SC", "Songti SC", "Noto Serif CJK SC", ui-serif, serif',
  mono: '"SFMono-Regular", "Cascadia Code", "Liberation Mono", "JetBrains Mono", "Fira Code", ui-monospace, monospace',
};

export const FONT_SIZE_IDS = ["sm", "md", "lg", "xl"] as const;
export type FontSizeId = (typeof FONT_SIZE_IDS)[number];

export const FONT_SIZE_STORAGE_KEY = "litfolio.fontSize";
export const DEFAULT_FONT_SIZE: FontSizeId = "md";

export const FONT_SIZES: Record<FontSizeId, string> = {
  sm: "14px",
  md: "16px",
  lg: "18px",
  xl: "20px",
};

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

export function isFontId(value: unknown): value is FontId {
  return typeof value === "string" && (FONT_IDS as readonly string[]).includes(value);
}

export function parseFont(value: string | null | undefined): FontId {
  return isFontId(value) ? value : DEFAULT_FONT;
}

export function readStoredFont(storage?: Storage): FontId {
  try {
    return parseFont((storage ?? window.localStorage).getItem(FONT_STORAGE_KEY));
  } catch {
    return DEFAULT_FONT;
  }
}

export function applyFont(font: FontId, root?: HTMLElement): void {
  const target = root ?? document.documentElement;
  target.style.setProperty("--litera-font-sans", FONT_STACKS[font] || FONT_STACKS.rounded);
}

export function persistFont(font: FontId, storage?: Storage): void {
  try {
    (storage ?? window.localStorage).setItem(FONT_STORAGE_KEY, font);
  } catch {
    // Private mode and embedded webviews can disable localStorage.
  }
}

export function isFontSizeId(value: unknown): value is FontSizeId {
  return typeof value === "string" && (FONT_SIZE_IDS as readonly string[]).includes(value);
}

export function parseFontSize(value: string | null | undefined): FontSizeId {
  return isFontSizeId(value) ? value : DEFAULT_FONT_SIZE;
}

export function readStoredFontSize(storage?: Storage): FontSizeId {
  try {
    return parseFontSize((storage ?? window.localStorage).getItem(FONT_SIZE_STORAGE_KEY));
  } catch {
    return DEFAULT_FONT_SIZE;
  }
}

export function applyFontSize(size: FontSizeId, root?: HTMLElement): void {
  const target = root ?? document.documentElement;
  target.style.setProperty("--litera-font-size", FONT_SIZES[size] || FONT_SIZES.md);
}

export function persistFontSize(size: FontSizeId, storage?: Storage): void {
  try {
    (storage ?? window.localStorage).setItem(FONT_SIZE_STORAGE_KEY, size);
  } catch {
    // Private mode and embedded webviews can disable localStorage.
  }
}
