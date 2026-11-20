import { useId } from "react";
import { useT } from "@/i18n/I18nProvider";
import { THEME_MODE_PREFERENCES } from "@/lib/theme";
import type { ThemeModePreference } from "@/lib/theme";
import "./AppearanceMode.css";

const glyphs = {
  light: (
    <>
      <circle cx="10" cy="10" r="3.25" />
      <path d="M10 1.75v2m0 12.5v2M1.75 10h2m12.5 0h2M4.15 4.15l1.4 1.4m8.9 8.9 1.4 1.4m0-11.7-1.4 1.4m-8.9 8.9-1.4 1.4" />
    </>
  ),
  dark: <path d="M16.9 13.2A7.25 7.25 0 0 1 6.8 3.1a7.25 7.25 0 1 0 10.1 10.1Z" />,
  system: (
    <>
      <rect x="2.25" y="3.5" width="15.5" height="10.75" rx="2" />
      <path d="M10 14.25v3.25m-3 0h6" />
    </>
  ),
};

export function AppearanceMode({
  preference,
  onChange,
}: {
  preference: ThemeModePreference;
  onChange: (preference: ThemeModePreference) => void;
}) {
  const groupName = useId();
  const t = useT();

  return (
    <fieldset className="appearance-mode" role="radiogroup" aria-labelledby={groupName}>
      <legend id={groupName} className="appearance-mode__legend">{t("theme.modeTitle")}</legend>
      <div
        className="appearance-mode__track"
        data-preference={preference}
        onKeyDown={(event) => {
          if (event.key !== "Home" && event.key !== "End") return;
          event.preventDefault();
          const radios = event.currentTarget.querySelectorAll<HTMLInputElement>("input");
          const radio = radios[event.key === "Home" ? 0 : radios.length - 1];
          radio.focus();
          radio.click();
        }}
      >
        <span className="appearance-mode__thumb" aria-hidden="true" />
        {THEME_MODE_PREFERENCES.map((option) => (
          <label className="appearance-mode__option" key={option}>
            <input
              className="appearance-mode__input"
              type="radio"
              name={groupName}
              value={option}
              checked={preference === option}
              onChange={() => onChange(option)}
            />
            <span className="appearance-mode__segment">
              <svg
                className="appearance-mode__glyph"
                viewBox="0 0 20 20"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                {glyphs[option]}
              </svg>
              {t(`theme.mode.${option}`)}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
