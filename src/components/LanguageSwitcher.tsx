import { Languages } from "@/components/icons";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useI18n } from "@/i18n/I18nProvider";
import { llmLanguageNameFor, type Lang } from "@/i18n/dict";

/// Sidebar zh/en toggle. Single button drives both the UI dictionary AND
/// the LLM `output_language` config — so switching to English here means
/// future TL;DR / Quick Read / 翻译 all come back in English without the
/// user touching Settings. Sync to the backend is fire-and-forget; if it
/// fails (no profile configured yet) the UI switch still applies.
export function LanguageSwitcher() {
  const { lang, setLang, t } = useI18n();
  const qc = useQueryClient();

  async function switchTo(next: Lang) {
    setLang(next);
    try {
      const cfg = await api.llmGetConfig();
      if (cfg.output_language !== llmLanguageNameFor(next)) {
        await api.llmSaveConfig({ ...cfg, output_language: llmLanguageNameFor(next) });
        qc.invalidateQueries({ queryKey: ["llmConfig"] });
      }
    } catch { /* config not ready yet — best-effort */ }
  }

  return (
    <div className="flex items-center gap-1 text-xs max-[900px]:flex-col" role="group" aria-label={t("lang.label")}>
      <Languages className="size-[1.125rem] max-[900px]:hidden" aria-hidden="true" />
      <button
        type="button"
        onClick={() => switchTo("zh")}
        className={
          "min-h-7 rounded-[var(--litera-radius)] px-2 py-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-litera-focus " +
          (lang === "zh"
            ? "bg-litera-accent/20 text-litera-accent"
            : "text-litera-text/70 hover:text-litera-text")
        }
        title={t("lang.zh")}
        aria-pressed={lang === "zh"}
      >
        ZH
      </button>
      <button
        type="button"
        onClick={() => switchTo("en")}
        className={
          "min-h-7 rounded-[var(--litera-radius)] px-2 py-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-litera-focus " +
          (lang === "en"
            ? "bg-litera-accent/20 text-litera-accent"
            : "text-litera-text/70 hover:text-litera-text")
        }
        title={t("lang.en")}
        aria-pressed={lang === "en"}
      >
        EN
      </button>
    </div>
  );
}
