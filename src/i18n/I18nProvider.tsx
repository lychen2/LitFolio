import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { dict, type Lang, type TKey } from "./dict";

const STORAGE_KEY = "litfolio.lang";

interface I18nValue {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: TKey) => string;
}

const I18nContext = createContext<I18nValue | null>(null);

function detectInitial(): Lang {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "en" || stored === "zh") return stored;
  } catch { /* localStorage unavailable */ }
  if (typeof navigator !== "undefined" && /^en/i.test(navigator.language)) return "en";
  return "zh";
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(detectInitial);
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, lang); } catch { /* ignore */ }
    if (typeof document !== "undefined") {
      document.documentElement.lang = lang === "zh" ? "zh-CN" : "en";
    }
  }, [lang]);
  function t(key: TKey): string {
    return dict[lang][key] ?? dict.zh[key] ?? key;
  }
  const value: I18nValue = { lang, setLang: setLangState, t };
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n called outside I18nProvider");
  return ctx;
}

export function useT(): (key: TKey) => string {
  return useI18n().t;
}
