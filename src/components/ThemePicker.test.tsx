import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "@/i18n/I18nProvider";
import { THEME_MODE_STORAGE_KEY } from "@/lib/theme";
import { ThemeProvider } from "./ThemeProvider";
import { ThemePicker } from "./ThemePicker";

describe("ThemePicker", () => {
  afterEach(() => vi.unstubAllGlobals());

  it.each(["dark", "light"])("renders theme previews and the selected %s mode", (mode) => {
    vi.stubGlobal("window", {
      localStorage: { getItem: (key: string) => key === THEME_MODE_STORAGE_KEY ? mode : null },
    });
    const html = renderToString(
      <ThemeProvider initialTheme="warm">
        <I18nProvider lang="en">
          <ThemePicker />
        </I18nProvider>
      </ThemeProvider>,
    );

    expect(html).toContain('role="radiogroup"');
    expect(html).toContain("Muted violet");
    expect(html).toContain("Graphite paper");
    expect(html).toContain("Cold blueprint");
    expect(html).toMatch(/Graphite paper[\s\S]*aria-hidden="true"/);
    expect(html).toContain('aria-checked="true"');
    expect(html).toMatch(new RegExp(`<input(?=[^>]*type="radio")(?=[^>]*checked="")(?=[^>]*value="${mode}")[^>]*>`));
    for (const theme of ["violet", "warm", "blueprint"]) {
      expect(html).toContain(`data-theme="${theme}" data-mode="${mode}" aria-hidden="true"`);
    }
  });
});
