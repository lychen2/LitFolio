import { type Ref } from "react";
import {
  AlertCircle,
  BookOpen,
  ExternalLink,
  FolderOpen,
  Loader2,
  Rocket,
  Save,
  Search,
} from "lucide-react";
import { type Paper, type ArxivDraft } from "@/lib/api";
import { useT } from "@/i18n/I18nProvider";
import { type TKey } from "@/i18n/dict";
import {
  type AutoDownloadFailure,
  type AutoDownloadSource,
  type AutoDownloadSourceDecision,
  type AutoDownloadSourceStatus,
  type SourceKind,
} from "./ArxivDoiWorkflow";

export function IdentifierPanel({
  value,
  setValue,
  fetching,
  error,
  success,
  existingPaper,
  onOpenExisting,
  onSubmit,
}: {
  value: string;
  setValue: (value: string) => void;
  fetching: boolean;
  error: string | null;
  success: string | null;
  existingPaper?: Paper | null;
  onOpenExisting?: () => void;
  onSubmit: () => void;
}) {
  const t = useT();
  const trimmed = value.trim();
  return (
    <div className="litera-panel p-5">
      <label className="text-xs uppercase tracking-wider text-litera-mute">
        {t("import.step1.label")}
      </label>
      <div className="flex gap-2 mt-2">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onSubmit()}
          placeholder={t("import.step1.placeholder")}
          className="litera-input flex-1 font-mono"
        />
        <button
          onClick={onSubmit}
          disabled={fetching || !trimmed}
          className="litera-btn-primary disabled:opacity-50"
        >
          {fetching ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Search className="h-4 w-4" />
          )}
          {t("import.step1.fetch")}
        </button>
      </div>
      <div className="mt-2 text-xs text-litera-mute">
        {t("import.step1.hint")}
      </div>
      {error && <div className="mt-3 text-sm text-litera-error">✕ {error}</div>}
      {success && (
        <div className="mt-3 text-sm text-litera-accent">{success}</div>
      )}
      {existingPaper && onOpenExisting && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-litera-success/25 bg-litera-success/10 px-3 py-2 text-sm text-litera-success">
          <span className="min-w-0 flex-1 truncate">
            {t("import.existingDoi", { title: existingPaper.title })}
          </span>
          <button type="button" onClick={onOpenExisting} className="litera-btn px-2 py-1 text-xs">
            <BookOpen className="h-3.5 w-3.5" /> {t("import.openExisting")}
          </button>
        </div>
      )}
    </div>
  );
}

export function DraftSavePanel({
  draft,
  sourceKind,
  selectedPdf,
  autoDownloadFailure,
  saving,
  autoPending,
  savePending,
  pdfDropRef,
  onPickPdf,
  onAutoDownload,
  onSave,
  onReset,
}: {
  draft: ArxivDraft;
  sourceKind: SourceKind;
  selectedPdf: string | null;
  autoDownloadFailure: AutoDownloadFailure | null;
  saving: boolean;
  autoPending: boolean;
  savePending: boolean;
  pdfDropRef: Ref<HTMLDivElement>;
  onPickPdf: () => void;
  onAutoDownload: () => void;
  onSave: () => void;
  onReset: () => void;
}) {
  const t = useT();
  return (
    <div className="litera-panel p-5 space-y-4">
      <DraftPreview draft={draft} />
      <div ref={pdfDropRef} className="border-t border-litera-line pt-4">
        <div className="mb-2 text-xs uppercase tracking-wider text-litera-mute">
          {t("import.step3.label")}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={onPickPdf}
            disabled={saving}
            className="litera-btn text-sm disabled:opacity-50"
          >
            <FolderOpen className="h-4 w-4" /> {t("import.step3.pickPdf")}
          </button>
          {sourceKind && (
            <button
              onClick={onAutoDownload}
              disabled={saving}
              className="litera-btn text-sm disabled:opacity-50"
              title={
                sourceKind === "doi"
                  ? t("import.step3.doiAutoDownloadTitle")
                  : t("import.step3.autoDownloadTitle")
              }
            >
              {autoPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Rocket className="h-4 w-4" />
              )}
              {t("import.step3.autoDownload")}
            </button>
          )}
          <button
            onClick={onSave}
            disabled={!selectedPdf || saving}
            className="litera-btn-primary text-sm disabled:opacity-50"
          >
            {savePending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            {t("import.step3.save")}
          </button>
          <button
            onClick={onReset}
            disabled={saving}
            className="litera-btn text-xs ml-auto disabled:opacity-50"
          >
            {t("import.step3.cancel")}
          </button>
        </div>
        <SelectedPdf path={selectedPdf} />
        <AutoDownloadFailurePanel failure={autoDownloadFailure} />
      </div>
    </div>
  );
}

function AutoDownloadFailurePanel({
  failure,
}: {
  failure: AutoDownloadFailure | null;
}) {
  const t = useT();
  if (!failure || failure.decisions.length === 0) return null;

  return (
    <section className="mt-3 rounded-lg border border-litera-line/80 bg-litera-bg/60 p-3">
      <div className="flex items-start gap-2">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-litera-warn" />
        <div className="min-w-0 flex-1">
          <div className="text-xs font-semibold uppercase tracking-wider text-litera-text">
            {t("import.step3.sourceDecision.title")}
          </div>
          <p className="mt-1 text-xs leading-relaxed text-litera-mute">
            {t("import.step3.sourceDecision.hint")}
          </p>
        </div>
      </div>

      <div className="mt-3 space-y-2">
        {failure.decisions.map((decision) => (
          <SourceDecisionRow key={decision.source} decision={decision} />
        ))}
      </div>

      <details className="mt-3 text-[11px] text-litera-mute">
        <summary className="cursor-pointer hover:text-litera-text">
          {t("import.step3.sourceDecision.rawDetail")}
        </summary>
        <p className="mt-1 break-words font-mono text-litera-text/70">
          {failure.detail}
        </p>
      </details>
    </section>
  );
}

function SourceDecisionRow({
  decision,
}: {
  decision: AutoDownloadSourceDecision;
}) {
  const t = useT();
  return (
    <article className="rounded-md border border-litera-line/70 bg-litera-ink/15 px-3 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-litera-text">
          {t(sourceLabelKey(decision.source))}
        </span>
        <span
          className={
            "rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wider " +
            sourceStatusClassName(decision.status)
          }
        >
          {t(sourceStatusKey(decision.status))}
        </span>
      </div>

      <dl className="mt-2 space-y-1 text-[11px] leading-relaxed">
        <div className="grid gap-1 sm:grid-cols-[88px_1fr]">
          <dt className="text-litera-mute">
            {t("import.step3.sourceDecision.evidenceUrl")}
          </dt>
          <dd className="min-w-0">
            {decision.evidenceUrl ? (
              <a
                href={decision.evidenceUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex max-w-full items-center gap-1 break-all font-mono text-litera-accent hover:underline"
              >
                {decision.evidenceUrl}
                <ExternalLink className="h-3 w-3 shrink-0" />
              </a>
            ) : (
              <span className="text-litera-mute italic">
                {t("import.step3.sourceDecision.noEvidenceUrl")}
              </span>
            )}
          </dd>
        </div>
        <div className="grid gap-1 sm:grid-cols-[88px_1fr]">
          <dt className="text-litera-mute">
            {t("import.step3.sourceDecision.reason")}
          </dt>
          <dd className="break-words text-litera-text/80">{decision.reason}</dd>
        </div>
      </dl>
    </article>
  );
}

function sourceLabelKey(source: AutoDownloadSource): TKey {
  switch (source) {
    case "arxiv":
      return "import.step3.sourceDecision.source.arxiv";
    case "scihub":
      return "import.step3.sourceDecision.source.scihub";
    case "crossref":
      return "import.step3.sourceDecision.source.crossref";
  }
}

function sourceStatusKey(status: AutoDownloadSourceStatus): TKey {
  switch (status) {
    case "failed":
      return "import.step3.sourceDecision.status.failed";
    case "not_found":
      return "import.step3.sourceDecision.status.notFound";
  }
}

function sourceStatusClassName(status: AutoDownloadSourceStatus): string {
  switch (status) {
    case "failed":
      return "border-litera-error/30 bg-litera-error/10 text-litera-error";
    case "not_found":
      return "border-litera-warn/30 bg-litera-warn/10 text-litera-warn";
  }
}

function DraftPreview({ draft }: { draft: ArxivDraft }) {
  const t = useT();
  return (
    <div>
      <div className="text-xs uppercase tracking-wider text-litera-mute mb-1.5">
        {t("import.step2.label")}
      </div>
      <div className="font-serif text-lg leading-snug text-litera-text">
        {draft.title}
      </div>
      <div className="text-xs text-litera-mute mt-1 flex items-center gap-2 flex-wrap">
        {draft.authors.length > 0 && (
          <span>
            {draft.authors.slice(0, 5).join(", ")}
            {draft.authors.length > 5 ? " et al." : ""}
          </span>
        )}
        {draft.year && <span>· {draft.year}</span>}
        {draft.venue && <span>· {draft.venue}</span>}
        {draft.doi && <span className="font-mono">· DOI: {draft.doi}</span>}
        {draft.arxiv_id && (
          <span className="font-mono">· arXiv: {draft.arxiv_id}</span>
        )}
      </div>
      {draft.abstract_text && (
        <p className="text-xs text-litera-text/80 mt-2 leading-relaxed line-clamp-6">
          {draft.abstract_text}
        </p>
      )}
    </div>
  );
}

function SelectedPdf({ path }: { path: string | null }) {
  const t = useT();
  return (
    <div className="mt-2 text-xs">
      {path ? (
        <span className="text-litera-accent">
          {t("import.step3.selected", { path: "" })}{" "}
          <span className="font-mono text-[11px] text-litera-text/80">
            {path}
          </span>
        </span>
      ) : (
        <span className="text-litera-mute italic">
          {t("import.step3.notSelected")}
        </span>
      )}
    </div>
  );
}
