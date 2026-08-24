import { Check, Moon } from "lucide-react";
import { useI18n } from "@/i18n/I18nProvider";
import { useTheme } from "./ThemeProvider";
import type { ThemeId } from "@/lib/theme";

const THEMES: Array<{ id: ThemeId; labelKey: "theme.violet" | "theme.warm" | "theme.blueprint"; hintKey: "theme.violetHint" | "theme.warmHint" | "theme.blueprintHint"; swatches: string[] }> = [
  { id: "violet", labelKey: "theme.violet", hintKey: "theme.violetHint", swatches: ["#b49aff", "#8edcff", "#1d1c29"] },
  { id: "warm", labelKey: "theme.warm", hintKey: "theme.warmHint", swatches: ["#e2b866", "#7fd0c1", "#2c2720"] },
  { id: "blueprint", labelKey: "theme.blueprint", hintKey: "theme.blueprintHint", swatches: ["#7e9cff", "#75d6db", "#1b2432"] },
];

export function ThemePicker() {
  const { theme, setTheme } = useTheme();
  const { t } = useI18n();

  return (
    <fieldset className="space-y-3">
      <legend className="flex items-center gap-2 text-sm font-semibold text-litera-text">
        <Moon className="h-4 w-4 text-litera-accent" />
        {t("theme.title")}
      </legend>
      <p className="max-w-2xl text-xs leading-relaxed text-litera-mute">{t("theme.description")}</p>
      <div className="grid gap-2 md:grid-cols-3" role="radiogroup" aria-label={t("theme.title")}>
        {THEMES.map((option, index) => {
          const selected = theme === option.id;
          return (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={selected}
              tabIndex={selected ? 0 : -1}
              onClick={() => setTheme(option.id)}
              onKeyDown={(event) => {
                const direction = event.key === "ArrowRight" || event.key === "ArrowDown"
                  ? 1
                  : event.key === "ArrowLeft" || event.key === "ArrowUp"
                    ? -1
                    : 0;
                const targetIndex = event.key === "Home"
                  ? 0
                  : event.key === "End"
                    ? THEMES.length - 1
                    : direction
                      ? (index + direction + THEMES.length) % THEMES.length
                      : index;
                if (!direction && event.key !== "Home" && event.key !== "End") return;
                event.preventDefault();
                setTheme(THEMES[targetIndex].id);
                const radios = event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="radio"]');
                radios?.[targetIndex]?.focus();
              }}
              className={
                "group flex min-h-[76px] items-start gap-3 rounded-[var(--litera-radius)] border p-3 text-left transition-colors " +
                (selected
                  ? "border-litera-accent bg-litera-accent/10"
                  : "border-litera-border bg-litera-surface hover:border-litera-border-strong hover:bg-litera-surface2")
              }
            >
              <span className="flex shrink-0 gap-1 pt-0.5" aria-hidden="true">
                {option.swatches.map((swatch) => (
                  <span key={swatch} className="h-4 w-4 rounded-full border border-white/10" style={{ backgroundColor: swatch }} />
                ))}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center justify-between gap-2 text-sm font-medium text-litera-text">
                  {t(option.labelKey)}
                  {selected && <Check className="h-4 w-4 shrink-0 text-litera-accent" aria-hidden="true" />}
                </span>
                <span className="mt-1 block text-[11px] leading-snug text-litera-mute">{t(option.hintKey)}</span>
              </span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
