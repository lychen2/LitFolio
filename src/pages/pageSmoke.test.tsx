import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToString } from "react-dom/server";
import { Route, Routes } from "react-router-dom";
import { StaticRouter } from "react-router-dom/server";
import { describe, expect, it, vi } from "vitest";

import { I18nProvider } from "@/i18n/I18nProvider";
import { ImportPage } from "./ImportPage";
import { LibraryPage } from "./LibraryPage";
import { ProjectsPage } from "./ProjectsPage";
import { ReaderPage } from "./ReaderPage";
import { SettingsPage } from "./SettingsPage";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn((command: string) => Promise.resolve(mockInvoke(command))),
}));

vi.mock("./reader/PdfPane", () => ({
  PdfPane: () => <div data-testid="pdf-pane" />,
}));

describe("page smoke render", () => {
  it("renders the library shell", () => {
    expect(renderPage(<LibraryPage />, "/library")).toContain("文献库");
  });

  it("renders the import shell", () => {
    expect(renderPage(<ImportPage />, "/import")).toContain("导入");
  });

  it("renders the settings shell", () => {
    expect(renderPage(<SettingsPage />, "/settings")).toContain("设置");
  });

  it("renders the projects shell", () => {
    expect(renderPage(<ProjectsPage />, "/projects")).toContain("研究项目");
  });

  it("renders the reader route while paper data is loading", () => {
    expect(renderPage(<ReaderPage />, "/reader/paper-1", "/reader/:paperId")).toContain("加载中");
  });
});

function renderPage(element: React.ReactElement, path: string, route = path) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return renderToString(
    <I18nProvider>
      <QueryClientProvider client={client}>
        <StaticRouter location={path}>
          <Routes>
            <Route path={route} element={element} />
          </Routes>
        </StaticRouter>
      </QueryClientProvider>
    </I18nProvider>,
  );
}

function mockInvoke(command: string): unknown {
  switch (command) {
    case "papers_recent":
    case "folders_list":
    case "smart_collections_list":
    case "reading_queue_list":
    case "projects_list":
      return [];
    case "papers_count":
      return 0;
    case "library_root":
      return "/tmp/litfolio-test";
    case "sync_get_config":
      return { webdav: { base_url: "", remote_path: "", username: "", password: "" } };
    case "llm_get_config":
      return {
        profiles: [],
        active: null,
        task_assignments: {},
        output_language: "Chinese",
      };
    default:
      return null;
  }
}
