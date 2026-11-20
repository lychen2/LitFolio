import { useSearchParams } from "react-router-dom";
import { Inbox } from "@/components/icons";
import { ChoiceButton } from "@/components/ChoiceButton";
import { PageHeader } from "@/components/PageHeader";
import { PageToolbar } from "@/components/PageToolbar";
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
  const isAndroid = typeof navigator !== "undefined" && /\bAndroid\b/.test(navigator.userAgent);
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
    : requestedTab === "arxiv_doi" || link || fromFeedItem || candidate ? "arxiv_doi"
    : isAndroid ? "pdf" : "paper";

  function setTab(nextTab: (typeof TABS)[number][0]) {
    setParams((current) => {
      const next = new URLSearchParams(current);
      next.set("tab", nextTab);
      return next;
    });
  }

  return (
    <section className="litera-import flex h-full flex-col">
      <PageHeader icon={<Inbox />} title={t("import.title")} />
      <PageToolbar>
        <details key={tab} open={tab === "paper" ? undefined : true}>
          <summary className="w-fit cursor-pointer text-sm text-litera-mute">{t("import.advanced")}</summary>
          <div className="litera-tab-list mt-2 flex-wrap" role="group" aria-label={t("import.advanced")}>
            {TABS.map(([id, label]) => (
              <ChoiceButton key={id} aria-pressed={tab === id} onClick={() => setTab(id)}>
                {t(label)}
              </ChoiceButton>
            ))}
          </div>
        </details>
      </PageToolbar>
      {tab === "arxiv_doi" && <ImportSourceBanner source={source} />}
      <div className="min-h-0 flex-1 overflow-hidden">
        {tab === "paper" ? <CoreFrame showImport /> : (
          <div className="h-full overflow-auto px-[var(--litera-page-inset)] py-4">
            {tab === "pdf" ? <PdfTab allowFolderImport={!isAndroid} /> : (
              <ArxivDoiTab key={JSON.stringify([fromFeedItem, candidate, link])} source={source} />
            )}
          </div>
        )}
      </div>
    </section>
  );
}
