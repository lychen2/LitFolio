import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Hash, Globe, Upload } from "lucide-react";
import { useT } from "@/i18n/I18nProvider";
import { TabButton } from "@/components/TabButton";
import { ImportJobInbox } from "./import/ImportJobInbox";
import { ImportSidebar } from "./import/ImportSidebar";
import { extractIdentifier } from "@/lib/identifier";
import { ArxivDoiTab } from "./import/ArxivDoiTab";
import { ImportSourceBanner, LibraryStats } from "./import/ImportHeader";
import { PdfTab } from "./import/PdfTab";
import { SearchTab } from "./import/SearchTab";
import { type ImportSource } from "./import/types";

type Tab = "pdf" | "arxiv_doi" | "search";

export function ImportPage() {
  const t = useT();
  const [params] = useSearchParams();
  const source: ImportSource = {
    fromFeedItem: params.get("fromFeedItem"),
    candidateId: candidateIdFrom(params),
    link: params.get("link"),
    title: params.get("title"),
    prefill: params.get("link") ? extractIdentifier(params.get("link")!) : null,
  };
  const [tab, setTab] = useState<Tab>(() => initialTab(params, source.prefill));

  return (
    <section className="h-full flex flex-col">
      <header className="border-b border-litera-line px-6 py-4 flex items-end justify-between gap-6">
        <div>
          <h1 className="font-serif text-2xl tracking-tight">
            {t("import.title")}
          </h1>
          <p className="text-sm text-litera-mute">{t("import.subtitle")}</p>
        </div>
        <LibraryStats />
      </header>
      <ImportSourceBanner source={source} />
      <nav className="px-6 pt-4 flex gap-1">
        <TabButton
          active={tab === "arxiv_doi"}
          onClick={() => setTab("arxiv_doi")}
          icon={<Hash className="h-3.5 w-3.5" />}
          label={t("import.tab.arxivDoi")}
        />
        <TabButton
          active={tab === "pdf"}
          onClick={() => setTab("pdf")}
          icon={<Upload className="h-3.5 w-3.5" />}
          label={t("import.tab.pdf")}
        />
        <TabButton
          active={tab === "search"}
          onClick={() => setTab("search")}
          icon={<Globe className="h-3.5 w-3.5" />}
          label={t("import.tab.search")}
        />
      </nav>
      <div className="flex-1 overflow-auto p-6">
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="min-w-0 litera-fade-in" key={tab}>
            {tab === "arxiv_doi" && <ArxivDoiTab source={source} />}
            {tab === "pdf" && <PdfTab />}
            {tab === "search" && <SearchTab />}
          </div>
          <div className="space-y-4">
            <ImportJobInbox />
            <ImportSidebar />
          </div>
        </div>
      </div>
    </section>
  );
}

function candidateIdFrom(params: URLSearchParams): number | null {
  const raw = params.get("candidateId");
  if (!raw) return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

function initialTab(params: URLSearchParams, prefill: string | null): Tab {
  const requested = params.get("tab");
  if (
    requested === "pdf" ||
    requested === "arxiv_doi" ||
    requested === "search"
  ) {
    return requested;
  }
  return params.get("fromFeedItem") || prefill ? "arxiv_doi" : "pdf";
}
