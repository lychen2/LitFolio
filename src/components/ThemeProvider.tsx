import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import {
  applyTheme,
  persistTheme,
  readStoredTheme,
  type ThemeId,
  applyThemeMode,
  persistThemeMode,
  readStoredThemeMode,
  resolveThemeMode,
  subscribeToSystemTheme,
  type ThemeMode,
  type ThemeModePreference,
  applyFont,
  persistFont,
  readStoredFont,
  type FontId,
  applyFontSize,
  persistFontSize,
  readStoredFontSize,
  type FontSizeId,
} from "@/lib/theme";

interface ThemeContextValue {
  theme: ThemeId;
  setTheme: (theme: ThemeId) => void;
  mode: ThemeMode;
  modePreference: ThemeModePreference;
  setModePreference: (preference: ThemeModePreference) => void;
  font: FontId;
  setFont: (font: FontId) => void;
  fontSize: FontSizeId;
  setFontSize: (size: FontSizeId) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const useBrowserLayoutEffect = typeof document === "undefined" ? useEffect : useLayoutEffect;

export function ThemeProvider({
  children,
  initialTheme,
  initialFont,
  initialFontSize,
}: {
  children: ReactNode;
  initialTheme?: ThemeId;
  initialFont?: FontId;
  initialFontSize?: FontSizeId;
}) {
  const [theme, setThemeState] = useState<ThemeId>(() => initialTheme ?? readStoredTheme());
  const [modePreference, setModePreferenceState] = useState(() => readStoredThemeMode());
  const getMode = () => resolveThemeMode(modePreference);
  const mode = useSyncExternalStore(subscribeToSystemTheme, getMode, getMode);
  const [font, setFontState] = useState<FontId>(() => initialFont ?? readStoredFont());
  const [fontSize, setFontSizeState] = useState<FontSizeId>(() => initialFontSize ?? readStoredFontSize());

  useEffect(() => {
    applyTheme(theme);
    persistTheme(theme);
  }, [theme]);

  useBrowserLayoutEffect(() => {
    applyThemeMode(mode);
  }, [mode]);

  useEffect(() => {
    applyFont(font);
    persistFont(font);
  }, [font]);

  useEffect(() => {
    applyFontSize(fontSize);
    persistFontSize(fontSize);
  }, [fontSize]);

  const setTheme = useCallback((nextTheme: ThemeId) => {
    applyTheme(nextTheme);
    persistTheme(nextTheme);
    setThemeState(nextTheme);
  }, []);

  const setModePreference = useCallback((preference: ThemeModePreference) => {
    persistThemeMode(preference);
    setModePreferenceState(preference);
  }, []);

  const setFont = useCallback((nextFont: FontId) => {
    applyFont(nextFont);
    persistFont(nextFont);
    setFontState(nextFont);
  }, []);

  const setFontSize = useCallback((nextSize: FontSizeId) => {
    applyFontSize(nextSize);
    persistFontSize(nextSize);
    setFontSizeState(nextSize);
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({ theme, setTheme, mode, modePreference, setModePreference, font, setFont, fontSize, setFontSize }),
    [theme, setTheme, mode, modePreference, setModePreference, font, setFont, fontSize, setFontSize],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext);
  if (!value) throw new Error("useTheme must be used within ThemeProvider");
  return value;
}
