import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { I18nProvider } from "@/i18n/I18nProvider";
import { ThemeProvider } from "./ThemeProvider";
import { ThemePicker } from "./ThemePicker";

describe("ThemePicker", () => {
  it("renders all themes as an accessible radio group", () => {
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
  });
});
