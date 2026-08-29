import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { I18nProvider } from "@/i18n/I18nProvider";
import { PluginsPanel } from "./PluginsPanel";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

describe("PluginsPanel", () => {
  it("exposes the plugin enable controls promised by PluginGate", () => {
    const html = renderPluginsPanel();
    expect(html).toContain("Plugins");
    expect(html).toContain("Enable or disable optional features");
  });
});

function renderPluginsPanel() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return renderToString(
    <I18nProvider lang="en">
      <QueryClientProvider client={client}>
        <PluginsPanel />
      </QueryClientProvider>
    </I18nProvider>,
  );
}
