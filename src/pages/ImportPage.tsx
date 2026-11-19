import { useSearchParams } from "react-router-dom";
import { CoreFrame } from "@/features/reader/CoreFrame";
import { useT } from "@/i18n/I18nProvider";
import { extractIdentifier } from "@/lib/identifier";
import { ArxivDoiTab } from "./import/ArxivDoiTab";
import { detectSourceKind } from "./import/ArxivDoiWorkflow";
import { ImportSourceBanner } from "./import/ImportHeader";
import { PdfTab } from "./import/PdfTab";
import type { ImportSource } from "./import/types";

const TABS = [
  ["paper", "import.tab.paper"],
  ["pdf", "import.tab.pdf"],
  ["arxiv_doi", "import.tab.arxivDoi"],
] as const;

export function ImportPage() {
  const t = useT();
  const [params, setParams] = useSearchParams();
  const link = params.get("link")?.trim() || null;
  const fromFeedItem = params.get("fromFeedItem");
  const candidate = params.get("candidateId");
  const source: ImportSource = {
    fromFeedItem,
    candidateId: candidate && /^\d+$/.test(candidate) ? Number(candidate) : null,
    link,
    title: params.get("title"),
    prefill: link ? extractIdentifier(link) ?? (detectSourceKind(link) ? link : null) : null,
  };
  const requestedTab = params.get("tab");
  const tab = requestedTab === "pdf" || requestedTab === "paper" ? requestedTab
    : requestedTab === "arxiv_doi" || link || fromFeedItem || candidate ? "arxiv_doi" : "paper";

  function setTab(nextTab: (typeof TABS)[number][0]) {
    setParams((current) => {
      const next = new URLSearchParams(current);
      next.set("tab", nextTab);
      return next;
    });
  }

  return (
    <section className="flex h-full flex-col">
      <header className="border-b border-litera-line px-6 py-4">
        <h1 className="font-serif text-xl text-litera-text">{t("import.title")}</h1>
        <details key={tab} open={tab === "paper" ? undefined : true} className="mt-2">
          <summary className="w-fit cursor-pointer text-sm text-litera-mute">{t("import.advanced")}</summary>
          <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label={t("import.advanced")}>
            {TABS.map(([id, label]) => (
              <button
                key={id}
                type="button"
                aria-pressed={tab === id}
                onClick={() => setTab(id)}
                className={tab === id ? "litera-btn-primary text-sm" : "litera-btn text-sm"}
              >
                {t(label)}
              </button>
            ))}
          </div>
        </details>
      </header>
      {tab === "arxiv_doi" && <ImportSourceBanner source={source} />}
      <div className="min-h-0 flex-1 overflow-hidden">
        {tab === "paper" ? <CoreFrame showImport /> : (
          <div className="h-full overflow-auto p-6">
            {tab === "pdf" ? <PdfTab /> : (
              <ArxivDoiTab key={JSON.stringify([fromFeedItem, candidate, link])} source={source} />
            )}
          </div>
        )}
      </div>
    </section>
  );
}
