import { type Ref } from "react";
import { FolderOpen, Loader2, Rocket, Save, Search } from "lucide-react";
import { type ArxivDraft } from "@/lib/api";
import { useT } from "@/i18n/I18nProvider";
import { type SourceKind } from "./ArxivDoiWorkflow";

export function IdentifierPanel({
  value, setValue, fetching, error, success, onSubmit,
}: {
  value: string;
  setValue: (value: string) => void;
  fetching: boolean;
  error: string | null;
  success: string | null;
  onSubmit: () => void;
}) {
  const t = useT();
  const trimmed = value.trim();
  return (
    <div className="litera-panel p-5">
      <label className="text-xs uppercase tracking-wider text-litera-mute">{t("import.step1.label")}</label>
      <div className="flex gap-2 mt-2">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onSubmit()}
          placeholder={t("import.step1.placeholder")}
          className="litera-input flex-1 font-mono"
        />
        <button onClick={onSubmit} disabled={fetching || !trimmed} className="litera-btn-primary disabled:opacity-50">
          {fetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          {t("import.step1.fetch")}
        </button>
      </div>
      <div className="mt-2 text-xs text-litera-mute">{t("import.step1.hint")}</div>
      {error && <div className="mt-3 text-sm text-red-400/90">✕ {error}</div>}
      {success && <div className="mt-3 text-sm text-litera-accent">{success}</div>}
    </div>
  );
}

export function DraftSavePanel({
  draft, sourceKind, selectedPdf, saving, autoPending, savePending, pdfDropRef,
  onPickPdf, onAutoDownload, onSave, onReset,
}: {
  draft: ArxivDraft;
  sourceKind: SourceKind;
  selectedPdf: string | null;
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
        <div className="text-xs uppercase tracking-wider text-litera-mute mb-2">{t("import.step3.label")}</div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={onPickPdf} disabled={saving} className="litera-btn text-sm disabled:opacity-50">
            <FolderOpen className="h-4 w-4" /> {t("import.step3.pickPdf")}
          </button>
          {sourceKind === "arxiv" && (
            <button onClick={onAutoDownload} disabled={saving} className="litera-btn text-sm disabled:opacity-50" title={t("import.step3.autoDownloadTitle")}>
              {autoPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}
              {t("import.step3.autoDownload")}
            </button>
          )}
          <button onClick={onSave} disabled={!selectedPdf || saving} className="litera-btn-primary text-sm disabled:opacity-50">
            {savePending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {t("import.step3.save")}
          </button>
          <button onClick={onReset} disabled={saving} className="litera-btn text-xs ml-auto disabled:opacity-50">
            {t("import.step3.cancel")}
          </button>
        </div>
        <SelectedPdf path={selectedPdf} />
      </div>
    </div>
  );
}

function DraftPreview({ draft }: { draft: ArxivDraft }) {
  const t = useT();
  return (
    <div>
      <div className="text-xs uppercase tracking-wider text-litera-mute mb-1.5">{t("import.step2.label")}</div>
      <div className="font-serif text-lg leading-snug text-litera-text">{draft.title}</div>
      <div className="text-xs text-litera-mute mt-1 flex items-center gap-2 flex-wrap">
        {draft.authors.length > 0 && <span>{draft.authors.slice(0, 5).join(", ")}{draft.authors.length > 5 ? " et al." : ""}</span>}
        {draft.year && <span>· {draft.year}</span>}
        {draft.venue && <span>· {draft.venue}</span>}
        {draft.doi && <span className="font-mono">· DOI: {draft.doi}</span>}
        {draft.arxiv_id && <span className="font-mono">· arXiv: {draft.arxiv_id}</span>}
      </div>
      {draft.abstract_text && <p className="text-xs text-litera-text/80 mt-2 leading-relaxed line-clamp-6">{draft.abstract_text}</p>}
    </div>
  );
}

function SelectedPdf({ path }: { path: string | null }) {
  const t = useT();
  return (
    <div className="mt-2 text-xs">
      {path ? (
        <span className="text-litera-accent">
          {t("import.step3.selected", { path: "" })} <span className="font-mono text-[11px] text-litera-text/80">{path}</span>
        </span>
      ) : (
        <span className="text-litera-mute italic">{t("import.step3.notSelected")}</span>
      )}
    </div>
  );
}
