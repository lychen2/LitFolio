import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  BookOpen, ClipboardCopy, Download, ExternalLink, FileText, Languages, Loader2, Quote, Sparkles, X,
} from "lucide-react";
import { api, type Paper } from "@/lib/api";
import { useI18n, useT } from "@/i18n/I18nProvider";
import { llmLanguageNameFor } from "@/i18n/dict";
import { ExportCitationsDialog } from "@/components/ExportCitationsDialog";
import { SimilarPapersPanel } from "./SimilarPapersPanel";
import { DoiEnrichRow } from "./DoiEnrichRow";
import { CustomFieldsSection } from "./PaperCustomFieldsSection";
import { CopyCitationDropdown } from "./CopyCitationDropdown";

export function PaperDetailDrawer({
  paper: paperProp, onClose,
}: {
  paper: Paper;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const { lang } = useI18n();
  const t = useT();
  // Metadata enrichment (manual DOI fetch) returns an updated paper; show it
  // immediately rather than waiting for the parent list to re-feed the prop.
  const [override, setOverride] = useState<Paper | null>(null);
  const paper = override ?? paperProp;
  const [showSimilar, setShowSimilar] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [showCiteDropdown, setShowCiteDropdown] = useState(false);
  const translate = useMutation({
    mutationFn: () => api.paperTranslate(paper.id, llmLanguageNameFor(lang)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["papers"] });
      qc.invalidateQueries({ queryKey: ["paper", paper.id] });
    },
  });

  return (
    <div className="fixed inset-0 z-30 flex justify-end bg-litera-ink/40 backdrop-blur-sm litera-drawer-backdrop" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-[760px] max-w-[94vw] h-full bg-litera-paper border-l border-litera-line shadow-2xl flex flex-col litera-drawer-enter"
      >
        <header className="px-5 py-4 border-b border-litera-line flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-wider text-litera-accent2">{t("paper.detail.metadata")}</div>
            <h2 className="font-serif text-xl leading-tight mt-1">{paper.title}</h2>
            {paper.title_translated && <p className="text-sm text-litera-accent mt-2">{paper.title_translated}</p>}
          </div>
          <button onClick={onClose} className="text-litera-mute hover:text-litera-text">
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="px-5 py-3 border-b border-litera-line flex items-center gap-2 flex-wrap">
          <button
            onClick={() => translate.mutate()}
            disabled={translate.isPending}
            className="litera-btn text-xs disabled:opacity-50"
          >
            {translate.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Languages className="h-3.5 w-3.5" />}
            {t("paper.detail.translateTitleAbstract")}
          </button>
          {paper.bibtex && (
            <button
              onClick={() => navigator.clipboard.writeText(paper.bibtex!)}
              className="litera-btn text-xs"
              title={t("reader.copyBibtex")}
            >
              <ClipboardCopy className="h-3.5 w-3.5" /> {t("reader.copyBibtex")}
            </button>
          )}
          <button
            onClick={() => setShowSimilar(true)}
            className="litera-btn text-xs"
            title={t("similar.find")}
          >
            <Sparkles className="h-3.5 w-3.5" /> {t("similar.find")}
          </button>
          <button
            onClick={() => setShowExport(true)}
            className="litera-btn text-xs"
            title={t("citations.title")}
          >
            <Download className="h-3.5 w-3.5" /> {t("citations.title")}
          </button>
          <div className="relative">
            <button
              onClick={() => setShowCiteDropdown(!showCiteDropdown)}
              className="litera-btn text-xs"
              title={t("citations.title")}
            >
              <Quote className="h-3.5 w-3.5" />
            </button>
            {showCiteDropdown && (
              <CopyCitationDropdown
                paper={paper}
                onClose={() => setShowCiteDropdown(false)}
              />
            )}
          </div>
          {paper.pdf_path && (
            <Link to={`/reader/${paper.id}`} className="litera-btn-primary text-xs">
              <BookOpen className="h-3.5 w-3.5" /> {t("library.readPdf")}
            </Link>
          )}
        </div>

        {showSimilar && (
          <SimilarPapersPanel
            paperId={paper.id}
            paperTitle={paper.title}
            onClose={() => setShowSimilar(false)}
          />
        )}
        {showExport && (
          <ExportCitationsDialog
            paperIds={[paper.id]}
            onClose={() => setShowExport(false)}
          />
        )}

        <div className="flex-1 overflow-auto px-5 py-4 space-y-5">
          <Meta paper={paper} onEnriched={setOverride} />
          <Section title={t("paper.detail.abstract")} body={paper.abstract_text ?? t("paper.detail.noAbstract")} />
          {paper.abstract_translated && <Section title={t("paper.detail.abstractTranslation")} body={paper.abstract_translated} accent />}
          {paper.tldr && <Section title={t("paper.detail.quickRead")} body={paper.tldr} accent />}
          {paper.key_findings.length > 0 && <Section title={t("paper.detail.keyFindings")} body={paper.key_findings.join("\n")} />}
          <CustomFieldsSection paperId={paper.id} />
          {translate.error && <ErrorLine error={translate.error} />}
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
      <dt className="text-litera-mute">Venue</dt>
      <dd>{paper.venue ?? t("paper.detail.unknown")}</dd>
      <dt className="text-litera-mute pt-1">DOI</dt>
      <DoiEnrichRow paper={paper} onEnriched={onEnriched} />
      <dt className="text-litera-mute">arXiv</dt>
      <dd>{paper.arxiv_id ? <ArxivLink id={paper.arxiv_id} /> : t("common.none")}</dd>
      <dt className="text-litera-mute">PDF</dt>
      <dd className="font-mono break-all flex items-start gap-1">
        {paper.pdf_path ? <><FileText className="h-3.5 w-3.5 mt-0.5 shrink-0" />{paper.pdf_path}</> : t("common.none")}
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

function ErrorLine({ error }: { error: unknown }) {
  const t = useT();
  const message = error instanceof Error ? error.message : String(error);
  return <div className="text-sm text-red-400/90">✕ {t("paper.detail.translateFailed")}: {message}</div>;
}
