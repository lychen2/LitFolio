import { Check, Moon, Type, Sparkles } from "lucide-react";
import { useI18n } from "@/i18n/I18nProvider";
import { useTheme } from "./ThemeProvider";
import type { ThemeId, FontId, FontSizeId } from "@/lib/theme";

const THEMES: Array<{ id: ThemeId; labelKey: "theme.violet" | "theme.warm" | "theme.blueprint"; hintKey: "theme.violetHint" | "theme.warmHint" | "theme.blueprintHint"; swatches: string[] }> = [
  { id: "violet", labelKey: "theme.violet", hintKey: "theme.violetHint", swatches: ["#cba6f7", "#89dceb", "#201e30"] },
  { id: "warm", labelKey: "theme.warm", hintKey: "theme.warmHint", swatches: ["#fab387", "#94e2d5", "#2b231e"] },
  { id: "blueprint", labelKey: "theme.blueprint", hintKey: "theme.blueprintHint", swatches: ["#74c7ec", "#89dceb", "#1d2537"] },
];

const FONTS: Array<{
  id: FontId;
  labelKey: "theme.fontRounded" | "theme.fontSystem" | "theme.fontSerif" | "theme.fontMono";
  hintKey: "theme.fontRoundedHint" | "theme.fontSystemHint" | "theme.fontSerifHint" | "theme.fontMonoHint";
  sample: string;
  sampleStyle: React.CSSProperties;
}> = [
  {
    id: "rounded",
    labelKey: "theme.fontRounded",
    hintKey: "theme.fontRoundedHint",
    sample: "Aa 柔和圆体",
    sampleStyle: { fontFamily: '"Quicksand", "Nunito", "PingFang SC", sans-serif' },
  },
  {
    id: "system",
    labelKey: "theme.fontSystem",
    hintKey: "theme.fontSystemHint",
    sample: "Aa 系统默认",
    sampleStyle: { fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
  },
  {
    id: "serif",
    labelKey: "theme.fontSerif",
    hintKey: "theme.fontSerifHint",
    sample: "Aa 优雅衬线",
    sampleStyle: { fontFamily: 'Georgia, Cambria, "Songti SC", serif' },
  },
  {
    id: "mono",
    labelKey: "theme.fontMono",
    hintKey: "theme.fontMonoHint",
    sample: "Aa 极客等宽",
    sampleStyle: { fontFamily: '"SFMono-Regular", "Cascadia Code", "JetBrains Mono", monospace' },
  },
];

const FONT_SIZES: Array<{
  id: FontSizeId;
  labelKey: "theme.fontSizeSm" | "theme.fontSizeMd" | "theme.fontSizeLg" | "theme.fontSizeXl";
  previewScale: string;
}> = [
  { id: "sm", labelKey: "theme.fontSizeSm", previewScale: "14px" },
  { id: "md", labelKey: "theme.fontSizeMd", previewScale: "16px" },
  { id: "lg", labelKey: "theme.fontSizeLg", previewScale: "18px" },
  { id: "xl", labelKey: "theme.fontSizeXl", previewScale: "20px" },
];

export function ThemePicker() {
  const { theme, setTheme, font, setFont, fontSize, setFontSize } = useTheme();
  const { t } = useI18n();

  return (
    <div className="space-y-6">
      {/* Theme selection */}
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
                  "group flex min-h-[76px] items-start gap-3 rounded-[var(--litera-radius)] border p-3 text-left transition-all " +
                  (selected
                    ? "border-litera-accent bg-litera-accent/15 shadow-[0_0_12px_rgba(0,0,0,0.2)] ring-1 ring-litera-accent/30"
                    : "border-litera-border bg-litera-surface hover:border-litera-border-strong hover:bg-litera-surface2 hover:translate-y-[-1px]")
                }
              >
                <span className="flex shrink-0 gap-1.5 pt-0.5" aria-hidden="true">
                  {option.swatches.map((swatch) => (
                    <span key={swatch} className="h-4 w-4 rounded-full border border-white/20 shadow-sm" style={{ backgroundColor: swatch }} />
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

      {/* Font Family selection */}
      <fieldset className="space-y-3 border-t border-litera-border/60 pt-5">
        <legend className="flex items-center gap-2 text-sm font-semibold text-litera-text">
          <Type className="h-4 w-4 text-litera-accent" />
          {t("theme.fontTitle")}
        </legend>
        <p className="max-w-2xl text-xs leading-relaxed text-litera-mute">{t("theme.fontDescription")}</p>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4" role="radiogroup" aria-label={t("theme.fontTitle")}>
          {FONTS.map((option) => {
            const selected = font === option.id;
            return (
              <button
                key={option.id}
                type="button"
                role="radio"
                aria-checked={selected}
                tabIndex={selected ? 0 : -1}
                onClick={() => setFont(option.id)}
                className={
                  "group flex flex-col justify-between rounded-[var(--litera-radius)] border p-3 text-left transition-all " +
                  (selected
                    ? "border-litera-accent bg-litera-accent/15 shadow-[0_0_12px_rgba(0,0,0,0.2)] ring-1 ring-litera-accent/30"
                    : "border-litera-border bg-litera-surface hover:border-litera-border-strong hover:bg-litera-surface2 hover:translate-y-[-1px]")
                }
              >
                <div className="flex items-center justify-between gap-1.5">
                  <span className="text-sm font-medium text-litera-text">{t(option.labelKey)}</span>
                  {selected && <Check className="h-3.5 w-3.5 shrink-0 text-litera-accent" aria-hidden="true" />}
                </div>
                <div className="my-2 rounded bg-litera-paper/70 px-2 py-1 text-xs text-litera-text" style={option.sampleStyle}>
                  {option.sample}
                </div>
                <span className="text-[11px] leading-snug text-litera-mute">{t(option.hintKey)}</span>
              </button>
            );
          })}
        </div>
      </fieldset>

      {/* Font Size Scaling */}
      <fieldset className="space-y-3 border-t border-litera-border/60 pt-5">
        <legend className="flex items-center gap-2 text-sm font-semibold text-litera-text">
          <Sparkles className="h-4 w-4 text-litera-accent" />
          {t("theme.fontSizeTitle")}
        </legend>
        <p className="max-w-2xl text-xs leading-relaxed text-litera-mute">{t("theme.fontSizeDescription")}</p>
        <div className="grid gap-2 grid-cols-2 sm:grid-cols-4" role="radiogroup" aria-label={t("theme.fontSizeTitle")}>
          {FONT_SIZES.map((option) => {
            const selected = fontSize === option.id;
            return (
              <button
                key={option.id}
                type="button"
                role="radio"
                aria-checked={selected}
                tabIndex={selected ? 0 : -1}
                onClick={() => setFontSize(option.id)}
                className={
                  "group flex min-h-[56px] items-center justify-between rounded-[var(--litera-radius)] border px-3.5 py-2.5 text-left transition-all " +
                  (selected
                    ? "border-litera-accent bg-litera-accent/15 shadow-[0_0_12px_rgba(0,0,0,0.2)] ring-1 ring-litera-accent/30"
                    : "border-litera-border bg-litera-surface hover:border-litera-border-strong hover:bg-litera-surface2 hover:translate-y-[-1px]")
                }
              >
                <div>
                  <span className="block text-sm font-medium text-litera-text">{t(option.labelKey)}</span>
                  <span className="text-[11px] text-litera-mute">{option.previewScale}</span>
                </div>
                {selected && <Check className="h-4 w-4 shrink-0 text-litera-accent" aria-hidden="true" />}
              </button>
            );
          })}
        </div>
      </fieldset>
    </div>
  );
}
