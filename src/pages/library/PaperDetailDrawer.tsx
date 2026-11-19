import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  BookOpen, Download, ExternalLink, FileText, Languages, LibraryBig, ListPlus, Sparkles, X,
} from "lucide-react";
import type { Paper } from "@/lib/api";
import type { ReadingAction } from "@/lib/apiReadingService";
import { useT } from "@/i18n/I18nProvider";
import { useDialogKeyboard } from "@/components/useDialogKeyboard";
import { DoiEnrichRow } from "./DoiEnrichRow";
import { CustomFieldsSection } from "./PaperCustomFieldsSection";
import { PaperSupplementsSection } from "./PaperSupplementsSection";
import { PaperHostMeta } from "./PaperHostMeta";

export function PaperDetailDrawer({
  paper: paperProp, onClose, onAction,
}: {
  paper: Paper;
  onClose: () => void;
  onAction: (action: ReadingAction) => void;
}) {
  const t = useT();
  const dialog = useDialogKeyboard(onClose);
  // Metadata enrichment (manual DOI fetch) returns an updated paper; show it
  // immediately rather than waiting for the parent list to re-feed the prop.
  const [override, setOverride] = useState<Paper | null>(null);
  // The override only bridges the gap until the live paper arrives; keeping it
  // longer would hide later status, tag and summary updates behind a snapshot.
  useEffect(() => {
    setOverride(null);
  }, [paperProp]);
  const paper = override ?? paperProp;

  return (
    <div className="fixed inset-0 z-30 flex justify-end bg-litera-ink/40 backdrop-blur-sm litera-drawer-backdrop" onClick={onClose}>
      <div
        {...dialog}
        aria-label={paper.title}
        onClick={(e) => e.stopPropagation()}
        className="w-[760px] max-w-[94vw] h-full bg-litera-paper border-l border-litera-line shadow-2xl flex flex-col litera-drawer-enter"
      >
        <header className="px-5 py-4 border-b border-litera-line flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-wider text-litera-accent2">{t("paper.detail.metadata")}</div>
            <h2 className="font-serif text-xl leading-tight mt-1">{paper.title}</h2>
            {paper.title_translated && <p className="text-sm text-litera-accent mt-2">{paper.title_translated}</p>}
          </div>
          <button onClick={onClose} aria-label={t("common.close")} className="text-litera-mute hover:text-litera-text">
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="px-5 py-3 border-b border-litera-line flex items-center gap-2 flex-wrap">
          <button onClick={() => onAction("tldr")} className="litera-btn text-xs">
            <Sparkles className="h-3.5 w-3.5" /> {t("paper.detail.quickRead")}
          </button>
          <button onClick={() => onAction("quick-read")} className="litera-btn text-xs">
            <BookOpen className="h-3.5 w-3.5" /> {t("reader.tabNotes")}
          </button>
          <details className="relative">
            <summary className="litera-btn cursor-pointer list-none text-xs">{t("paper.detail.more")}</summary>
            <div className="absolute z-10 mt-2 grid w-52 gap-1 rounded-lg border border-litera-line bg-litera-paper p-2 shadow-xl">
              <p className="px-2 pt-1 text-xs text-litera-mute">AI</p>
              <button type="button" className="litera-btn text-xs" onClick={() => onAction("translate-metadata")}>
                <Languages className="h-3.5 w-3.5" /> {t("paper.detail.translateTitleAbstract")}
              </button>
              <button type="button" className="litera-btn text-xs" onClick={() => onAction("similar")}>
                <Sparkles className="h-3.5 w-3.5" /> {t("similar.find")}
              </button>
              <button type="button" className="litera-btn text-xs" onClick={() => onAction("review")}>
                <FileText className="h-3.5 w-3.5" /> {t("litReview.title")}
              </button>
              <p className="px-2 pt-1 text-xs text-litera-mute">{t("paper.detail.exportGroup")}</p>
              <button type="button" className="litera-btn text-xs" onClick={() => onAction("zotero")}>
                <LibraryBig className="h-3.5 w-3.5" /> {t("library.sendToZotero")}
              </button>
              <button type="button" className="litera-btn text-xs" onClick={() => onAction("export")}>
                <Download className="h-3.5 w-3.5" /> {t("citations.title")}
              </button>
              <p className="px-2 pt-1 text-xs text-litera-mute">{t("paper.detail.organizeGroup")}</p>
              <button type="button" className="litera-btn text-xs" onClick={() => onAction("queue-add")}>
                <ListPlus className="h-3.5 w-3.5" /> {t("queue.add")}
              </button>
            </div>
          </details>
          {paper.pdf_path && (
            <Link to={`/reader/${paper.id}`} className="litera-btn-primary text-xs">
              <BookOpen className="h-3.5 w-3.5" /> {t("library.readPdf")}
            </Link>
          )}
        </div>

        <div className="flex-1 overflow-auto px-5 py-4 space-y-5">
          <Meta paper={paper} onEnriched={setOverride} />
          <Section title={t("paper.detail.abstract")} body={paper.abstract_text ?? t("paper.detail.noAbstract")} />
          {paper.abstract_translated && <Section title={t("paper.detail.abstractTranslation")} body={paper.abstract_translated} accent />}
          {paper.tldr && <Section title={t("paper.detail.quickRead")} body={paper.tldr} accent />}
          {paper.key_findings.length > 0 && <Section title={t("paper.detail.keyFindings")} body={paper.key_findings.join("\n")} />}
          <PaperHostMeta paper={paper} />
          <PaperSupplementsSection paperId={paper.id} />
          <CustomFieldsSection paperId={paper.id} />
        </div>
      </div>
    </div>
  );
}

function Meta({ paper, onEnriched }: { paper: Paper; onEnriched: (updated: Paper) => void }) {
  const t = useT();
  return (
    <dl className="grid grid-cols-[92px_1fr] gap-x-3 gap-y-2 text-sm">
      <dt className="text-litera-mute">{t("paper.detail.authors")}</dt>
      <dd>{paper.authors.join(", ") || t("paper.detail.unknown")}</dd>
      <dt className="text-litera-mute">{t("paper.detail.year")}</dt>
      <dd>{paper.year ?? t("paper.detail.unknown")}</dd>
      <dt className="text-litera-mute">{t("paper.detail.venue")}</dt>
      <dd>{paper.venue ?? t("paper.detail.unknown")}</dd>
      <dt className="text-litera-mute pt-1">DOI</dt>
      <DoiEnrichRow paper={paper} onEnriched={onEnriched} />
      <dt className="text-litera-mute">arXiv</dt>
      <dd>{paper.arxiv_id ? <ArxivLink id={paper.arxiv_id} /> : t("common.none")}</dd>
      <dt className="text-litera-mute">PDF</dt>
      <dd className="font-mono break-all flex items-start gap-1">
        {paper.pdf_path ? <><FileText className="h-3.5 w-3.5 mt-0.5 shrink-0" />{paper.pdf_path}</> : <span className="font-sans text-litera-mute">{t("paper.detail.unknown")}</span>}
      </dd>
    </dl>
  );
}

function ArxivLink({ id }: { id: string }) {
  return (
    <a
      href={`https://arxiv.org/abs/${id}`}
      target="_blank"
      rel="noreferrer"
      className="font-mono text-litera-accent2 hover:underline inline-flex items-center gap-1"
    >
      {id}
      <ExternalLink className="h-3 w-3" />
    </a>
  );
}

function Section({ title, body, accent }: { title: string; body: string; accent?: boolean }) {
  return (
    <section>
      <h3 className="text-xs uppercase tracking-wider text-litera-mute mb-2">{title}</h3>
      <p className={"text-sm leading-relaxed whitespace-pre-wrap " + (accent ? "text-litera-accent" : "text-litera-text")}>
        {body}
      </p>
    </section>
  );
}
