import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { dict, type Lang, type TKey } from "./dict";
import { formatMessage, type I18nVars } from "./format";

const STORAGE_KEY = "litfolio.lang";

interface I18nValue {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: TKey, vars?: I18nVars) => string;
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

export function I18nProvider({ children, lang: forced }: { children: ReactNode; lang?: Lang }) {
  const [lang, setLangState] = useState<Lang>(() => forced ?? detectInitial());
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, lang); } catch { /* ignore */ }
    if (typeof document !== "undefined") {
      document.documentElement.lang = lang === "zh" ? "zh-CN" : "en";
    }
  }, [lang]);
  const tRef = useRef<(key: TKey, vars?: I18nVars) => string>(() => "");
  tRef.current = (key: TKey, vars?: I18nVars): string => {
    const template = dict[lang][key] ?? dict.zh[key] ?? key;
    return formatMessage(template, vars);
  };
  const value = useMemo<I18nValue>(
    () => ({ lang, setLang: setLangState, t: (key, vars) => tRef.current(key, vars) }),
    [lang],
  );
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n called outside I18nProvider");
  return ctx;
}

export function useT(): (key: TKey, vars?: I18nVars) => string {
  return useI18n().t;
}
